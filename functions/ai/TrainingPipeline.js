const { z } = require('zod');
const { AcademicBrain, SUBJECTS } = require('./AcademicBrain');

const TrainerPayloadSchema = z.object({
  text: z.string().min(1),
  subject: z.enum(SUBJECTS),
  topic: z.string().min(1),
  actualMinutes: z.number().min(10).max(180),
});

class TrainingPipeline {
  constructor(options = {}) {
    this.db = options.db;
    this.logger = options.logger || console;
    this.geminiEnricher = options.geminiEnricher;
    this.brain = options.brain || new AcademicBrain();
  }

  async init() {
    await this.brain.init();
  }

  async runWeeklyTraining({ lookbackDays = 7 } = {}) {
    const databaseSamples = await this._fetchDatabaseHistorySamples({ lookbackDays });
    const syntheticSamples = await this._fetchGeminiSyntheticSamples(databaseSamples);
    const merged = [...databaseSamples, ...syntheticSamples];
    const valid = merged.map((entry) => TrainerPayloadSchema.safeParse(entry)).filter((r) => r.success).map((r) => r.data);

    if (!valid.length) {
      return { trained: false, reason: 'no_valid_samples', databaseCount: databaseSamples.length, syntheticCount: syntheticSamples.length };
    }

    const result = await this.brain.retrain(valid);
    this.logger.info('academic_brain_weekly_training_completed', {
      trained: result.trained,
      sampleCount: result.sampleCount || 0,
      databaseCount: databaseSamples.length,
      syntheticCount: syntheticSamples.length,
    });

    return {
      trained: result.trained,
      sampleCount: result.sampleCount || 0,
      databaseCount: databaseSamples.length,
      syntheticCount: syntheticSamples.length,
    };
  }

  async _fetchDatabaseHistorySamples({ lookbackDays = 7 } = {}) {
    if (!this.db) return [];

    const sinceMs = Date.now() - (Math.max(1, Number(lookbackDays || 7)) * 24 * 60 * 60 * 1000);
    const sinceDate = new Date(sinceMs);

    const snapshot = await this.db.collection('classRequests')
      .where('updatedAt', '>=', sinceDate)
      .limit(500)
      .get()
      .catch(() => null);

    const docs = snapshot?.docs || [];
    const samples = [];

    for (const doc of docs) {
      const data = doc.data() || {};
      const text = String(
        data?.boardPreparationSource?.combinedText
        || data?.boardPreparationSource?.typedText
        || data?.topic
        || ''
      ).trim();
      const subject = String(data?.subject || '').trim();
      const topic = String(data?.topic || '').trim() || 'general';
      const actualMinutes = Number(data?.durationMinutes || data?.pricingSnapshot?.requestedDurationMinutes || 0);

      samples.push({
        text,
        subject,
        topic,
        actualMinutes,
      });
    }

    return samples
      .map((entry) => TrainerPayloadSchema.safeParse(entry))
      .filter((result) => result.success)
      .map((result) => result.data);
  }

  async _fetchGeminiSyntheticSamples(databaseSamples = []) {
    if (typeof this.geminiEnricher !== 'function' || !databaseSamples.length) return [];
    try {
      const generated = await this.geminiEnricher(databaseSamples);
      if (!Array.isArray(generated)) return [];
      return generated
        .map((entry) => TrainerPayloadSchema.safeParse(entry))
        .filter((result) => result.success)
        .map((result) => result.data);
    } catch (error) {
      this.logger.warn('academic_brain_gemini_enrichment_failed', { error: error?.message || 'unknown_error' });
      return [];
    }
  }
}

module.exports = { TrainingPipeline };

