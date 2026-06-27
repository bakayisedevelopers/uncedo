const fs = require('fs');
const path = require('path');
let tf;
try {
  tf = require('@tensorflow/tfjs-node');
} catch (_error) {
  tf = require('@tensorflow/tfjs');
}
const natural = require('natural');
const { z } = require('zod');

const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology'];

const ClassificationInputSchema = z.object({ text: z.string().min(1) });
const TrainingSampleSchema = z.object({
  text: z.string().min(1),
  subject: z.enum(SUBJECTS),
  topic: z.string().min(1),
  actualMinutes: z.number().min(10).max(180),
});

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function nearestToken(token, candidates) {
  let best = token;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = natural.LevenshteinDistance(token, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return { value: best, distance: bestDistance };
}

class AcademicBrain {
  constructor(options = {}) {
    this.modelDir = options.modelDir || path.join(__dirname, '..', 'ml', 'academic-brain');
    this.modelPath = `file://${path.join(this.modelDir, 'model.json')}`;
    this.vectorizer = new natural.TfIdf();
    this.topicVocabulary = {
      Mathematics: ['algebra', 'calculus', 'trigonometry', 'geometry', 'statistics', 'probability'],
      Physics: ['mechanics', 'electricity', 'magnetism', 'waves', 'optics', 'thermodynamics'],
      Chemistry: ['stoichiometry', 'organic', 'inorganic', 'equilibrium', 'kinetics', 'electrochemistry'],
      Biology: ['genetics', 'ecology', 'cells', 'evolution', 'physiology', 'anatomy'],
    };
    this.corpus = {
      Mathematics: ['solve equation algebra calculus trigonometry theorem graph probability statistics'],
      Physics: ['force motion acceleration newton mechanics voltage current wave frequency optics'],
      Chemistry: ['atoms molecules reactions moles stoichiometry acids bases equilibrium oxidation'],
      Biology: ['cell dna genetics mitosis evolution ecosystem respiration photosynthesis anatomy'],
    };
    this.subjectVectors = new Map();
    this.durationModel = null;
  }

  async init() {
    this._buildTfIdfCorpus();
    this._buildSubjectVectors();
    await this._loadOrCreateDurationModel();
  }

  normalizeText(rawText) {
    const cleaned = normalizeWhitespace(rawText)
      .replace(/[|`~^]+/g, ' ')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[lI](?=\d)/g, '1')
      .replace(/[Oo](?=\d)/g, '0');

    const tokens = tokenize(cleaned);
    const canonicalVocabulary = [
      ...Object.values(this.topicVocabulary).flat(),
      ...SUBJECTS.map((value) => value.toLowerCase()),
      'equation', 'diagram', 'calculate', 'prove', 'derive', 'simplify',
    ];

    const corrected = tokens.map((token) => {
      if (token.length <= 2) return token;
      const nearest = nearestToken(token, canonicalVocabulary);
      return nearest.distance <= 1 ? nearest.value : token;
    });

    return corrected.join(' ');
  }

  classifySubjectAndTopics(rawText) {
    const parsed = ClassificationInputSchema.parse({ text: rawText });
    const normalizedText = this.normalizeText(parsed.text);
    const query = new natural.TfIdf();
    query.addDocument(normalizedText);

    const subjectScores = SUBJECTS.map((subject) => {
      const vocab = this.subjectVectors.get(subject) || [];
      let score = 0;
      for (const token of vocab) score += query.tfidf(token, 0);
      return { subject, score };
    }).sort((a, b) => b.score - a.score);

    const top = subjectScores[0] || { subject: '', score: 0 };
    const topics = (this.topicVocabulary[top.subject] || [])
      .map((topic) => ({ topic, score: query.tfidf(topic, 0) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.topic);

    return {
      subject: top.subject,
      topics,
      topic: topics[0] || '',
      confidence: top.score,
      normalizedText,
    };
  }

  _extractDurationFeatures(rawText) {
    const text = this.normalizeText(rawText);
    const words = tokenize(text);
    return [
      words.length,
      (text.match(/[=+\-*/^]/g) || []).length,
      words.filter((word) => ['integral', 'derivative', 'equation', 'matrix', 'vector', 'graph'].includes(word)).length,
      (text.match(/[?]/g) || []).length,
      words.filter((token) => /^\d+(\.\d+)?$/.test(token)).length,
    ];
  }

  async estimateMinutes(rawText) {
    const features = this._extractDurationFeatures(rawText);
    const x = tf.tensor2d([features], [1, features.length]);
    try {
      const y = this.durationModel.predict(x);
      const values = await y.data();
      y.dispose();
      return Math.round(Math.max(10, Math.min(120, values[0])));
    } finally {
      x.dispose();
    }
  }

  async classify(rawText) {
    const basic = this.classifySubjectAndTopics(rawText);
    const estimatedMinutes = await this.estimateMinutes(basic.normalizedText);
    return {
      subject: basic.subject,
      topic: basic.topic,
      topics: basic.topics,
      estimatedMinutes,
      confidence: basic.confidence,
      normalizedText: basic.normalizedText,
    };
  }

  async retrain(samples) {
    const validSamples = z.array(TrainingSampleSchema).parse(samples || []);
    if (!validSamples.length) return { trained: false, reason: 'no_samples' };

    const grouped = { Mathematics: [], Physics: [], Chemistry: [], Biology: [] };
    for (const sample of validSamples) {
      grouped[sample.subject].push(sample.text);
      const topic = String(sample.topic || '').toLowerCase();
      if (topic && !this.topicVocabulary[sample.subject].includes(topic)) {
        this.topicVocabulary[sample.subject].push(topic);
      }
    }
    for (const subject of SUBJECTS) {
      this.corpus[subject] = [...this.corpus[subject], ...grouped[subject]].slice(-150);
    }

    this._buildTfIdfCorpus();
    this._buildSubjectVectors();

    const xRows = validSamples.map((sample) => this._extractDurationFeatures(sample.text));
    const yRows = validSamples.map((sample) => [sample.actualMinutes]);

    const x = tf.tensor2d(xRows, [xRows.length, xRows[0].length]);
    const y = tf.tensor2d(yRows, [yRows.length, 1]);
    try {
      await this.durationModel.fit(x, y, {
        epochs: 80,
        batchSize: Math.min(16, xRows.length),
        verbose: 0,
        shuffle: true,
      });
    } finally {
      x.dispose();
      y.dispose();
    }

    fs.mkdirSync(this.modelDir, { recursive: true });
    let persistedModel = false;
    const saveHandlers = tf.io.getSaveHandlers(this.modelPath);
    if (Array.isArray(saveHandlers) && saveHandlers.length > 0) {
      await this.durationModel.save(this.modelPath);
      persistedModel = true;
    }
    fs.writeFileSync(path.join(this.modelDir, 'corpus.json'), JSON.stringify(this.corpus, null, 2), 'utf8');
    fs.writeFileSync(path.join(this.modelDir, 'topics.json'), JSON.stringify(this.topicVocabulary, null, 2), 'utf8');

    return { trained: true, sampleCount: validSamples.length, persistedModel };
  }

  _buildTfIdfCorpus() {
    this.vectorizer = new natural.TfIdf();
    for (const subject of SUBJECTS) {
      for (const doc of this.corpus[subject] || []) this.vectorizer.addDocument(this.normalizeText(doc));
    }
  }

  _buildSubjectVectors() {
    this.subjectVectors = new Map();
    for (const subject of SUBJECTS) {
      const subjectDocs = (this.corpus[subject] || []).map((doc) => tokenize(this.normalizeText(doc)));
      this.subjectVectors.set(subject, [...new Set(subjectDocs.flat())]);
    }
  }

  async _loadOrCreateDurationModel() {
    const modelJsonPath = path.join(this.modelDir, 'model.json');
    const hasFileLoadHandler = Array.isArray(tf.io.getLoadHandlers(this.modelPath)) && tf.io.getLoadHandlers(this.modelPath).length > 0;
    if (fs.existsSync(modelJsonPath) && hasFileLoadHandler) {
      this.durationModel = await tf.loadLayersModel(this.modelPath);
      this.durationModel.compile({ optimizer: tf.train.adam(0.01), loss: 'meanSquaredError', metrics: ['mae'] });
      return;
    }

    this.durationModel = tf.sequential();
    this.durationModel.add(tf.layers.dense({ units: 24, activation: 'relu', inputShape: [5] }));
    this.durationModel.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    this.durationModel.add(tf.layers.dense({ units: 1, activation: 'linear' }));
    this.durationModel.compile({ optimizer: tf.train.adam(0.01), loss: 'meanSquaredError', metrics: ['mae'] });
  }
}

module.exports = { AcademicBrain, SUBJECTS };

