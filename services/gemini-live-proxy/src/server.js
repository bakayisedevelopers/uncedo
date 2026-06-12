const http = require('http');
const admin = require('firebase-admin');
const { WebSocketServer } = require('ws');
const { GoogleGenAI } = require('@google/genai');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
});

const port = Number(process.env.PORT || 8080);
const LIVE_MODEL = 'gemini-live-2.5-flash-preview';
const AI_LIVE_PRICING_REFERENCE = {
  billingModel: 'gemini-3.1-flash-live-preview',
  pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  pricingAsOf: '2026-06-12',
  usdToZarRate: 16.2489,
  inputRatesUsdPerMillion: {
    text: 0.75,
    audio: 3,
    image: 1,
    video: 1,
    document: 0.75,
  },
  outputRatesUsdPerMillion: {
    text: 4.5,
    audio: 12,
    image: 4.5,
    video: 4.5,
    document: 4.5,
  },
};

const AI_TUTOR_SYSTEM_INSTRUCTION = [
  'You are an AI tutor for Parakleo.',
  'Teach step-by-step and keep the conversation natural.',
  'Always track the current active question and the student conversation context.',
  'If student asks to go back, return to previous question and continue from its saved answer context.',
  'Use provided extracted questions and answer threads as source of truth.',
  'Keep answers educational and age-appropriate.',
  'Ask if the student understands before moving forward.',
  'When board updates are needed, emit boardActions JSON.',
  'Return either normal text or JSON: {"speak":"...","textMode":"readonly|readwrite","questionId":"...","boardActions":[...]}.',
  'Do not hallucinate unseen diagrams.',
].join(' ');

const AI_CUSTOMER_REQUEST_SYSTEM_INSTRUCTION = [
  'You are the Uncedo AI service request agent.',
  'Your job is to help a customer request a real-world service through a natural voice call.',
  'Always identify exactly one category first, then at least one service inside that category.',
  'Ask one follow-up question at a time.',
  'Prioritize required questions before optional questions.',
  'If a customer mixes categories, ask them to choose one category for this request.',
  'Speak naturally, briefly, and clearly.',
  'Address the customer by name when available.',
  'Do not calculate prices yourself. The app pricing engine calculates the price and may send you a quote to announce.',
  'When the app sends a quote, explain it clearly, ask for approval, and wait for the customer to confirm or decline.',
  'Use the exact question ids from the provided question plan when you fill requestDraft.requiredAnswers and requestDraft.optionalAnswers.',
  'Return compact JSON whenever possible in this shape: {"speak":"...","status":"collecting|ready_to_search","requestDraft":{"categoryId":"","serviceIds":[],"requiredAnswers":{},"optionalAnswers":{},"missingRequired":[],"selectedPortfolioReferences":[],"safetyFlags":[]},"selectionRequest":{"type":"service_selection|reference_upload|none","prompt":"..."}}.',
  'Only mark status as ready_to_search when category and at least one service are confirmed.',
  'Do not invent categories or services outside the provided catalog.',
].join(' ');

function normalizeQuestionId(value, fallback = 'q1') {
  const next = String(value || '').trim();
  return next || fallback;
}

function clip(value, max = 700) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeModality(value, fallback = 'text') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
}

function modalityListToTotals(list = [], fallbackTotal = 0, fallbackModality = 'text') {
  const totals = {};
  if (Array.isArray(list) && list.length) {
    list.forEach((item) => {
      const modality = normalizeModality(item?.modality, fallbackModality);
      const tokens = Number(item?.tokenCount ?? item?.tokens ?? 0);
      if (!Number.isFinite(tokens) || tokens <= 0) return;
      totals[modality] = Number(totals[modality] || 0) + tokens;
    });
    return totals;
  }

  const fallbackTokens = Number(fallbackTotal || 0);
  if (Number.isFinite(fallbackTokens) && fallbackTokens > 0) {
    totals[normalizeModality(fallbackModality)] = fallbackTokens;
  }
  return totals;
}

function mergeTokenTotals(current = {}, next = {}) {
  const merged = { ...(current || {}) };
  Object.entries(next || {}).forEach(([key, value]) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    merged[key] = Number(merged[key] || 0) + numeric;
  });
  return merged;
}

function computeCostUsd(tokenTotals = {}, pricing = {}) {
  return Object.entries(tokenTotals || {}).reduce((sum, [modality, tokens]) => {
    const rate = Number(pricing?.[modality] ?? pricing?.text ?? 0);
    const numericTokens = Number(tokens || 0);
    if (!Number.isFinite(rate) || !Number.isFinite(numericTokens) || numericTokens <= 0) {
      return sum;
    }
    return sum + ((numericTokens / 1000000) * rate);
  }, 0);
}

function buildUsageSummary(currentSummary = null, usageMetadata = null) {
  if (!usageMetadata || typeof usageMetadata !== 'object') return currentSummary;

  const nextPromptTokensByModality = modalityListToTotals(
    usageMetadata.promptTokensDetails,
    usageMetadata.promptTokenCount,
    'text',
  );
  const nextResponseTokensByModality = modalityListToTotals(
    usageMetadata.responseTokensDetails,
    usageMetadata.responseTokenCount,
    'audio',
  );
  const nextToolUseTokensByModality = modalityListToTotals(
    usageMetadata.toolUsePromptTokensDetails,
    usageMetadata.toolUsePromptTokenCount,
    'text',
  );

  const promptTokensByModality = mergeTokenTotals(currentSummary?.promptTokensByModality, nextPromptTokensByModality);
  const responseTokensByModality = mergeTokenTotals(currentSummary?.responseTokensByModality, nextResponseTokensByModality);
  const toolUseTokensByModality = mergeTokenTotals(currentSummary?.toolUseTokensByModality, nextToolUseTokensByModality);

  const promptTokenCount = Object.values(promptTokensByModality).reduce((sum, value) => sum + Number(value || 0), 0);
  const responseTokenCount = Object.values(responseTokensByModality).reduce((sum, value) => sum + Number(value || 0), 0);
  const toolUsePromptTokenCount = Object.values(toolUseTokensByModality).reduce((sum, value) => sum + Number(value || 0), 0);
  const totalTokenCount = promptTokenCount + responseTokenCount + toolUsePromptTokenCount;

  const inputCostUsd = computeCostUsd(promptTokensByModality, AI_LIVE_PRICING_REFERENCE.inputRatesUsdPerMillion);
  const outputCostUsd = computeCostUsd(responseTokensByModality, AI_LIVE_PRICING_REFERENCE.outputRatesUsdPerMillion);
  const toolUseCostUsd = computeCostUsd(toolUseTokensByModality, AI_LIVE_PRICING_REFERENCE.inputRatesUsdPerMillion);
  const totalCostUsd = roundMoney(inputCostUsd + outputCostUsd + toolUseCostUsd);
  const totalCostZar = roundCurrency(totalCostUsd * AI_LIVE_PRICING_REFERENCE.usdToZarRate);

  return {
    liveModel: LIVE_MODEL,
    pricingReferenceModel: AI_LIVE_PRICING_REFERENCE.billingModel,
    pricingUrl: AI_LIVE_PRICING_REFERENCE.pricingUrl,
    pricingAsOf: AI_LIVE_PRICING_REFERENCE.pricingAsOf,
    usdToZarRate: AI_LIVE_PRICING_REFERENCE.usdToZarRate,
    currency: 'ZAR',
    promptTokenCount,
    responseTokenCount,
    toolUsePromptTokenCount,
    totalTokenCount,
    promptTokensByModality,
    responseTokensByModality,
    toolUseTokensByModality,
    inputCostUsd: roundMoney(inputCostUsd),
    outputCostUsd: roundMoney(outputCostUsd),
    toolUseCostUsd: roundMoney(toolUseCostUsd),
    totalCostUsd,
    totalCostZar,
    updatedAtMs: Date.now(),
  };
}

function parseAiPayload(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return {
    speak: '', boardActions: [], textMode: 'readonly', questionId: null, requestDraft: null, selectionRequest: null, status: '',
  };

  const parse = (candidate) => {
    const parsed = JSON.parse(candidate);
    return {
      speak: String(parsed?.speak || ''),
      boardActions: Array.isArray(parsed?.boardActions) ? parsed.boardActions : [],
      textMode: String(parsed?.textMode || 'readonly').toLowerCase() === 'readwrite' ? 'readwrite' : 'readonly',
      questionId: parsed?.questionId || null,
      requestDraft: parsed?.requestDraft && typeof parsed.requestDraft === 'object' ? parsed.requestDraft : null,
      selectionRequest: parsed?.selectionRequest && typeof parsed.selectionRequest === 'object' ? parsed.selectionRequest : null,
      status: String(parsed?.status || '').trim().toLowerCase(),
    };
  };

  try {
    return parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return parse(raw.slice(start, end + 1));
      } catch {
        return {
          speak: raw, boardActions: [], textMode: 'readonly', questionId: null, requestDraft: null, selectionRequest: null, status: '',
        };
      }
    }
  }

  return {
    speak: raw, boardActions: [], textMode: 'readonly', questionId: null, requestDraft: null, selectionRequest: null, status: '',
  };
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

async function verifyAndLoadSession(token, sessionId, callId) {
  const decoded = await admin.auth().verifyIdToken(String(token || ''));
  const uid = decoded.uid;
  if (callId) {
    const callSnap = await db.collection('serviceCalls').doc(callId).get();
    if (!callSnap.exists) throw new Error('Service call not found.');
    const call = callSnap.data() || {};
    if (call.customerId !== uid && call.userId !== uid) throw new Error('Unauthorized service call access.');
    return { uid, resourceId: callId, resourceKind: 'service_call', session: call };
  }

  const snap = await db.collection('sessions').doc(sessionId).get();
  if (!snap.exists) throw new Error('Session not found.');
  const session = snap.data() || {};
  if (session.sessionType !== 'ai') throw new Error('Session is not an AI session.');
  if (session.studentId !== uid && session.tutorId !== uid) throw new Error('Unauthorized session access.');
  return { uid, resourceId: sessionId, resourceKind: 'session', session };
}

async function writeAiSnapshot(resourceKind, resourceId, patch = {}) {
  const collectionName = resourceKind === 'service_call' ? 'serviceCalls' : 'sessions';
  await db.collection(collectionName).doc(resourceId).set({
    aiLive: {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

function createBufferedWriters(resourceKind, resourceId) {
  const collectionName = resourceKind === 'service_call' ? 'serviceCalls' : 'sessions';
  const transcriptBuffer = [];
  const boardBuffer = [];
  let flushing = false;

  const flush = async () => {
    if (flushing) return;
    if (!transcriptBuffer.length && !boardBuffer.length) return;
    flushing = true;
    try {
      const batch = db.batch();
      while (transcriptBuffer.length) {
        const item = transcriptBuffer.shift();
        const ref = db.collection(collectionName).doc(resourceId).collection('aiTranscriptEvents').doc();
        batch.set(ref, {
          ...item,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      while (boardBuffer.length) {
        const item = boardBuffer.shift();
        const ref = db.collection(collectionName).doc(resourceId).collection('aiBoardActions').doc();
        batch.set(ref, {
          ...item,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    } finally {
      flushing = false;
    }
  };

  const timer = setInterval(() => { flush().catch(() => {}); }, 1200);
  return {
    pushTranscript(item) { transcriptBuffer.push(item); },
    pushBoardAction(item) { boardBuffer.push(item); },
    async close() { clearInterval(timer); await flush(); },
  };
}

function createContextState(session = {}) {
  return {
    agentType: String(session?.aiLive?.agentType || 'tutor').trim().toLowerCase() || 'tutor',
    topic: String(session.topic || ''),
    description: String(session.requestDescription || ''),
    extractedText: String(session?.boardPreparationSource?.extractedText || ''),
    questions: [],
    activeQuestionId: null,
    answersByQuestion: {},
    conversation: [],
    customerName: '',
    serviceCatalog: [],
    questionPlan: {},
    requestState: {},
    primer: '',
  };
}

function buildQuestionSummary(state, currentId) {
  const questions = Array.isArray(state.questions) ? state.questions : [];
  const current = questions.find((q) => q.questionId === currentId) || questions[0] || null;
  const currentQuestionId = normalizeQuestionId(current?.questionId, currentId || 'q1');
  const currentAnswers = state.answersByQuestion[currentQuestionId] || [];
  const otherQuestionsSummary = questions
    .filter((q) => q.questionId !== currentQuestionId)
    .slice(0, 5)
    .map((q) => `- ${q.questionId}: ${clip(q.text, 140)} (answers: ${(state.answersByQuestion[q.questionId] || []).length})`)
    .join('\n');

  return {
    currentQuestionId,
    currentQuestionText: clip(current?.text || '', 1200),
    currentAnswersSummary: currentAnswers
      .slice(-5)
      .map((item, idx) => `${idx + 1}. ${clip(item.text, 220)} [${item.textMode || 'readonly'}]`)
      .join('\n'),
    otherQuestionsSummary,
  };
}

function buildConversationSummary(state) {
  return (state.conversation || [])
    .slice(-10)
    .map((turn, idx) => `${idx + 1}. ${turn.role}: ${clip(turn.text, 220)}`)
    .join('\n');
}

function buildCustomerRequestPrompt(state, studentText = '') {
  return [
    'CUSTOMER SERVICE REQUEST CONTEXT:',
    `Customer name: ${clip(state.customerName || 'Customer', 120)}`,
    `Current request state: ${clip(JSON.stringify(state.requestState || {}), 1800)}`,
    `Service catalog: ${clip(JSON.stringify(state.serviceCatalog || []), 6000)}`,
    `Question plan: ${clip(JSON.stringify(state.questionPlan || {}), 6000)}`,
    `Recent conversation summary:\n${buildConversationSummary(state) || '(none)'}`,
    'Store every answer under the exact question id key from the question plan.',
    'Follow the service request agent system rules.',
    'Return compact JSON whenever possible with speak, status, requestDraft, and selectionRequest.',
    `Customer turn: ${studentText}`,
  ].join('\n\n');
}

function buildEffectiveContextPrompt(state, studentText = '') {
  if (state.agentType === 'customer_request') {
    return buildCustomerRequestPrompt(state, studentText);
  }
  const current = buildQuestionSummary(state, state.activeQuestionId);
  return [
    'CONTEXT FOR THIS TURN:',
    `Topic: ${clip(state.topic, 200)}`,
    `Description: ${clip(state.description, 300)}`,
    `Extracted text summary: ${clip(state.extractedText, 900)}`,
    `Active question id: ${current.currentQuestionId}`,
    `Active question text: ${current.currentQuestionText}`,
    `Active question saved answers:\n${current.currentAnswersSummary || '(none yet)'}`,
    `Other question summary:\n${current.otherQuestionsSummary || '(none)'}`,
    `Recent conversation summary:\n${buildConversationSummary(state) || '(none)'}`,
    'If asked to go back to previous question, emit boardActions setCurrentQuestion to the earlier question id and continue from that question context.',
    `Student turn: ${studentText}`,
  ].join('\n\n');
}

function applyBoardActionsToState(state, boardActions = []) {
  for (const action of boardActions) {
    const type = String(action?.type || '').trim();
    const qid = normalizeQuestionId(action?.questionId, state.activeQuestionId || 'q1');

    if (type === 'setCurrentQuestion' || type === 'showQuestion') {
      state.activeQuestionId = qid;
      continue;
    }

    if (type === 'appendText' || type === 'replaceText') {
      const text = String(action?.text || action?.content || '').trim();
      if (!text) continue;
      const existing = state.answersByQuestion[qid] || [];
      state.answersByQuestion[qid] = type === 'replaceText'
        ? [{ text, textMode: 'readwrite', ts: Date.now() }]
        : [...existing, { text, textMode: 'readwrite', ts: Date.now() }];
    }
  }
}

function extractServerText(message) {
  const parts = message?.serverContent?.modelTurn?.parts || [];
  return parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractServerAudio(message) {
  const parts = message?.serverContent?.modelTurn?.parts || [];
  for (const part of parts) {
    if (part?.inlineData?.data && String(part?.inlineData?.mimeType || '').includes('audio')) {
      return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000' };
    }
  }
  return null;
}

function extractInputTranscription(message) {
  return String(
    message?.serverContent?.inputTranscription?.text
    || message?.serverContent?.inputAudioTranscription?.text
    || '',
  ).trim();
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ noServer: true });

function writeUpgradeError(socket, statusCode, message) {
  try {
    socket.write([
      `HTTP/1.1 ${statusCode} ${message}`,
      'Connection: close',
      'Content-Type: text/plain; charset=utf-8',
      `Content-Length: ${Buffer.byteLength(message)}`,
      '',
      message,
    ].join('\r\n'));
  } catch {}
  try { socket.destroy(); } catch {}
}

wss.on('connection', async (ws, request, context) => {
  const { resourceId, resourceKind, uid, session } = context;
  const writers = createBufferedWriters(resourceKind, resourceId);
  const contextState = createContextState(session);
  let geminiLiveSession = null;
  let ended = false;
  let usageSummary = session?.aiLive?.usageSummary || null;

  await writeAiSnapshot(resourceKind, resourceId, {
    status: 'connected',
    model: LIVE_MODEL,
    wsConnected: true,
    audioInActive: false,
    audioOutActive: false,
    transcriptStatus: 'idle',
    lastError: '',
    startedAt: session?.aiLive?.startedAt || admin.firestore.FieldValue.serverTimestamp(),
  });
  send(ws, { type: 'status', status: 'connected', wsConnected: true });

  const onGeminiMessage = (message) => {
    if (message?.usageMetadata) {
      usageSummary = buildUsageSummary(usageSummary, message.usageMetadata);
      if (usageSummary) {
        send(ws, { type: 'usage', usage: usageSummary });
        writeAiSnapshot(resourceKind, resourceId, {
          model: LIVE_MODEL,
          usageSummary,
        }).catch(() => {});
      }
    }

    const inputText = extractInputTranscription(message);
    if (inputText) {
      contextState.conversation.push({ role: 'student', text: inputText, ts: Date.now() });
      writers.pushTranscript({
        role: 'student',
        type: 'transcript',
        text: inputText,
        uid,
        questionId: contextState.activeQuestionId || null,
      });
      send(ws, {
        type: 'conversation_event',
        event: { role: 'student', text: inputText, questionId: contextState.activeQuestionId || null },
      });
    }

    const responseTextRaw = extractServerText(message);
    if (responseTextRaw) {
      const parsed = parseAiPayload(responseTextRaw);
      const speak = parsed.speak || responseTextRaw;
      const questionId = normalizeQuestionId(
        parsed.questionId,
        contextState.activeQuestionId || contextState.questions[0]?.questionId || 'q1',
      );
      const textMode = parsed.textMode || (parsed.boardActions.length ? 'readwrite' : 'readonly');

      if (speak) {
        send(ws, {
          type: 'transcript_delta', text: speak, questionId, textMode, requestDraft: parsed.requestDraft, selectionRequest: parsed.selectionRequest, agentStatus: parsed.status,
        });
        send(ws, {
          type: 'transcript_final', text: speak, questionId, textMode, requestDraft: parsed.requestDraft, selectionRequest: parsed.selectionRequest, agentStatus: parsed.status,
        });
        writers.pushTranscript({
          role: 'assistant',
          type: 'transcript',
          text: speak,
          uid,
          questionId,
          textMode,
        });
        contextState.conversation.push({
          role: 'assistant', text: speak, ts: Date.now(), questionId, textMode,
        });
      }

      applyBoardActionsToState(contextState, parsed.boardActions);
      for (const action of parsed.boardActions) {
        send(ws, { type: 'board_action', action });
        writers.pushBoardAction({ action, uid, questionId: action?.questionId || null });
      }

      if (parsed.boardActions.length) {
        contextState.activeQuestionId = normalizeQuestionId(
          parsed.boardActions.find((item) => ['setCurrentQuestion', 'showQuestion'].includes(String(item?.type || '')))?.questionId,
          contextState.activeQuestionId || questionId,
        );
      }

      send(ws, {
        type: 'conversation_event',
        event: {
          role: 'assistant', text: speak, questionId, textMode, requestDraft: parsed.requestDraft, selectionRequest: parsed.selectionRequest, agentStatus: parsed.status,
        },
      });
      send(ws, { type: 'status', status: 'speaking' });
      writeAiSnapshot(resourceKind, resourceId, {
        status: 'speaking',
        audioInActive: true,
        audioOutActive: true,
        transcriptStatus: 'finalized',
      }).catch(() => {});
    }

    const audioPayload = extractServerAudio(message);
    if (audioPayload?.data) {
      send(ws, { type: 'audio', base64Pcm16: audioPayload.data, sampleRate: 24000 });
    }
  };

  try {
    console.log(JSON.stringify({
      event: 'gemini_live_connect_start',
      sessionId: resourceId,
      project: process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    }));
    geminiLiveSession = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: ['AUDIO', 'TEXT'],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: contextState.agentType === 'customer_request'
          ? AI_CUSTOMER_REQUEST_SYSTEM_INSTRUCTION
          : AI_TUTOR_SYSTEM_INSTRUCTION,
      },
      callbacks: { onmessage: onGeminiMessage },
    });
    console.log(JSON.stringify({
      event: 'gemini_live_connect_success',
      sessionId: resourceId,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: 'gemini_live_connect_failed',
      sessionId: resourceId,
      message: error?.message || 'Unknown Gemini connection error',
    }));
    send(ws, { type: 'error', message: `Gemini connection failed: ${error.message}` });
  }

  const endSession = async (status) => {
    if (ended) return;
    ended = true;
    try { await writers.close(); } catch {}
    try { await geminiLiveSession?.close?.(); } catch {}
    await writeAiSnapshot(resourceKind, resourceId, {
      status,
      model: LIVE_MODEL,
      usageSummary,
      wsConnected: false,
      audioInActive: false,
      audioOutActive: false,
      transcriptStatus: 'finalized',
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    try { ws.close(); } catch {}
  };

  ws.on('message', async (buffer) => {
    let message = null;
    try {
      message = JSON.parse(String(buffer || '{}'));
    } catch {
      return;
    }

    if (message.type === 'client_close') {
      await endSession('ended');
      return;
    }

    if (message.type === 'init_context') {
      const incoming = message.context || {};
      contextState.topic = String(incoming.topic || contextState.topic || '');
      contextState.description = String(incoming.description || contextState.description || '');
      contextState.extractedText = String(incoming.extractedText || contextState.extractedText || '');
      contextState.agentType = String(incoming.agentType || contextState.agentType || 'tutor').trim().toLowerCase() || 'tutor';
      contextState.customerName = String(incoming.customerName || contextState.customerName || '');
      contextState.serviceCatalog = Array.isArray(incoming.serviceCatalog) ? incoming.serviceCatalog : [];
      contextState.questionPlan = incoming.questionPlan && typeof incoming.questionPlan === 'object' ? incoming.questionPlan : {};
      contextState.requestState = incoming.requestState && typeof incoming.requestState === 'object' ? incoming.requestState : {};
      contextState.primer = String(incoming.primer || '').trim();
      contextState.questions = Array.isArray(incoming.questions)
        ? incoming.questions.map((question, index) => ({
          questionId: normalizeQuestionId(question?.questionId, `q${index + 1}`),
          text: String(question?.text || ''),
          questionNumber: question?.questionNumber || null,
        }))
        : [];
      contextState.activeQuestionId = normalizeQuestionId(
        incoming.activeQuestionId,
        contextState.questions[0]?.questionId || 'q1',
      );

      const primer = buildEffectiveContextPrompt(
        contextState,
        contextState.primer || (contextState.agentType === 'customer_request'
          ? `Greet ${contextState.customerName || 'the customer'} and ask what help they need.`
          : 'Session initialized. Start from active question and ask learner readiness.'),
      );
      geminiLiveSession?.sendClientContent?.({ turns: [{ role: 'user', parts: [{ text: primer }] }] });
      send(ws, { type: 'status', status: 'connected' });
      return;
    }

    if (message.type === 'customer_text' || message.type === 'student_text') {
      const customerText = String(message.text || '').trim();
      if (!customerText) return;
      const qid = normalizeQuestionId(
        message?.metadata?.questionId,
        contextState.activeQuestionId || 'q1',
      );
      contextState.activeQuestionId = qid;
      contextState.conversation.push({
        role: 'student', text: customerText, ts: Date.now(), questionId: qid,
      });
      writers.pushTranscript({
        role: 'student', type: 'manual_text', text: customerText, uid, questionId: qid,
      });
      send(ws, { type: 'conversation_event', event: { role: 'student', text: customerText, questionId: qid } });

      const prompt = buildEffectiveContextPrompt(contextState, customerText);
      geminiLiveSession?.sendClientContent?.({ turns: [{ role: 'user', parts: [{ text: prompt }] }] });
      return;
    }

    if (message.type === 'app_prompt') {
      const appPrompt = String(message.text || '').trim();
      if (!appPrompt) return;
      geminiLiveSession?.sendClientContent?.({ turns: [{ role: 'user', parts: [{ text: appPrompt }] }] });
      return;
    }

    if (message.type === 'audio_in') {
      send(ws, { type: 'status', status: 'listening' });
      await writeAiSnapshot(resourceKind, resourceId, {
        status: 'listening',
        audioInActive: true,
        transcriptStatus: 'streaming',
      });
      try {
        const sampleRate = Number(message.sampleRate || 16000);
        const bytes = Buffer.from(String(message.base64Pcm16 || ''), 'base64');
        if (bytes.length && typeof geminiLiveSession?.sendRealtimeInput === 'function') {
          geminiLiveSession.sendRealtimeInput({
            media: {
              data: bytes,
              mimeType: `audio/pcm;rate=${sampleRate}`,
            },
          });
        }
      } catch (error) {
        send(ws, { type: 'error', message: `Audio stream failed: ${error.message || 'Unknown error'}` });
      }
    }
  });

  ws.on('close', async () => { await endSession('disconnected'); });
  ws.on('error', async (error) => {
    await writeAiSnapshot(resourceKind, resourceId, {
      status: 'error',
      wsConnected: false,
      lastError: String(error?.message || 'Unknown websocket error'),
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
});

server.on('upgrade', async (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname !== '/live') {
      writeUpgradeError(socket, 404, 'Not found');
      return;
    }
    const sessionId = String(url.searchParams.get('sessionId') || '').trim();
    const callId = String(url.searchParams.get('callId') || '').trim();
    const token = String(url.searchParams.get('token') || '').trim();
    if ((!sessionId && !callId) || !token) {
      writeUpgradeError(socket, 400, 'Missing resource id or token');
      return;
    }
    const { uid, session, resourceId, resourceKind } = await verifyAndLoadSession(token, sessionId, callId);
    console.log(JSON.stringify({
      event: 'ai_live_upgrade_allowed',
      sessionId: resourceId,
      uid,
      sessionType: session.sessionType || session.callType || null,
    }));
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, { resourceId, resourceKind, uid, session });
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'ai_live_upgrade_rejected',
      message: error?.message || 'Unknown upgrade error',
    }));
    writeUpgradeError(socket, 401, 'Unauthorized');
  }
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`gemini-live-proxy listening on :${port}`);
});
