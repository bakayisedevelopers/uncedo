const http = require('http');
const admin = require('firebase-admin');
const { WebSocketServer } = require('ws');
const { GoogleGenAI } = require('@google/genai');

function readCloudEnv(name, fallback = '') {
  const raw = String(process.env[name] || '').trim();
  const cleaned = raw.replace(new RegExp(`^${name}=`), '').trim();
  if (cleaned) {
    return cleaned.split(/\s+/)[0] || fallback;
  }

  const embeddedInProject = String(process.env.GOOGLE_CLOUD_PROJECT || '').match(new RegExp(`${name}=([^\\s]+)`));
  if (embeddedInProject && embeddedInProject[1]) {
    return embeddedInProject[1];
  }

  if (name === 'GOOGLE_CLOUD_PROJECT') {
    return String(process.env.GCLOUD_PROJECT || '').trim().split(/\s+/)[0] || fallback;
  }

  return fallback;
}

const GOOGLE_CLOUD_PROJECT = readCloudEnv('GOOGLE_CLOUD_PROJECT');
const GOOGLE_CLOUD_LOCATION = readCloudEnv('GOOGLE_CLOUD_LOCATION', 'us-central1');

if (!admin.apps.length) {
  if (GOOGLE_CLOUD_PROJECT) {
    admin.initializeApp({ projectId: GOOGLE_CLOUD_PROJECT });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();
const ai = new GoogleGenAI({
  vertexai: true,
  project: GOOGLE_CLOUD_PROJECT || undefined,
  location: GOOGLE_CLOUD_LOCATION || 'us-central1',
});

const port = Number(process.env.PORT || 8080);
const LIVE_MODEL = 'gemini-live-2.5-flash-native-audio';
const CUSTOMER_TEXT_MODEL = 'gemini-2.5-flash';
const AI_LIVE_PRICING_REFERENCE = {
  billingModel: 'gemini-live-2.5-flash-native-audio',
  pricingUrl: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing',
  pricingAsOf: '2026-06-12',
  usdToZarRate: 16.2489,
  inputRatesUsdPerMillion: {
    text: 0.5,
    audio: 3,
    image: 3,
    video: 3,
    document: 0.5,
  },
  outputRatesUsdPerMillion: {
    text: 2,
    audio: 12,
    image: 2,
    video: 2,
    document: 2,
  },
};
const AI_TEXT_PRICING_REFERENCE = {
  billingModel: 'gemini-2.5-flash',
  pricingUrl: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing',
  pricingAsOf: '2026-06-16',
  usdToZarRate: 16.2489,
  inputRatesUsdPerMillion: {
    text: 0.3,
    audio: 1,
    image: 1,
    video: 1,
    document: 0.3,
  },
  outputRatesUsdPerMillion: {
    text: 2.5,
    audio: 10,
    image: 2.5,
    video: 2.5,
    document: 2.5,
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
  'On the very first turn, respond with a short spoken greeting only. Do not return JSON on the first turn.',
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

function buildUsageSummary(currentSummary = null, usageMetadata = null, options = {}) {
  if (!usageMetadata || typeof usageMetadata !== 'object') return currentSummary;
  const liveModel = String(options.liveModel || LIVE_MODEL).trim() || LIVE_MODEL;
  const pricingReference = options.pricingReference || AI_LIVE_PRICING_REFERENCE;

  const nextPromptTokensByModality = modalityListToTotals(
    usageMetadata.promptTokensDetails,
    usageMetadata.promptTokenCount,
    'text',
  );
  const nextResponseTokensByModality = modalityListToTotals(
    usageMetadata.responseTokensDetails || usageMetadata.candidatesTokensDetails,
    usageMetadata.responseTokenCount ?? usageMetadata.candidatesTokenCount,
    String(options.defaultResponseModality || 'audio'),
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

  const inputCostUsd = computeCostUsd(promptTokensByModality, pricingReference.inputRatesUsdPerMillion);
  const outputCostUsd = computeCostUsd(responseTokensByModality, pricingReference.outputRatesUsdPerMillion);
  const toolUseCostUsd = computeCostUsd(toolUseTokensByModality, pricingReference.inputRatesUsdPerMillion);
  const totalCostUsd = roundMoney(inputCostUsd + outputCostUsd + toolUseCostUsd);
  const totalCostZar = roundCurrency(totalCostUsd * Number(pricingReference.usdToZarRate || AI_LIVE_PRICING_REFERENCE.usdToZarRate));

  return {
    liveModel,
    pricingReferenceModel: pricingReference.billingModel,
    pricingUrl: pricingReference.pricingUrl,
    pricingAsOf: pricingReference.pricingAsOf,
    usdToZarRate: pricingReference.usdToZarRate,
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

function getPricingReferenceForModel(model = '') {
  const normalized = String(model || '').trim();
  if (normalized === CUSTOMER_TEXT_MODEL) {
    return AI_TEXT_PRICING_REFERENCE;
  }
  return AI_LIVE_PRICING_REFERENCE;
}

function parseAiPayload(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return {
    speak: '', boardActions: [], textMode: 'readonly', questionId: null, requestDraft: null, selectionRequest: null, status: '',
  };

  const parse = (candidate) => {
    const parsed = JSON.parse(candidate);
    return {
      heard: String(parsed?.heard || ''),
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
          heard: '', speak: raw, boardActions: [], textMode: 'readonly', questionId: null, requestDraft: null, selectionRequest: null, status: '',
        };
      }
    }
  }

  return {
    heard: '', speak: raw, boardActions: [], textMode: 'readonly', questionId: null, requestDraft: null, selectionRequest: null, status: '',
  };
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function buildCustomerCallBridgePage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; }
    </style>
  </head>
  <body>
    <script>
      (function () {
        var search = new URLSearchParams(window.location.search || '');
        var callId = String(search.get('callId') || '').trim();
        var token = String(search.get('token') || '').trim();
        var wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        var WS_URL = wsProtocol + '//' + window.location.host + '/live?callId=' + encodeURIComponent(callId) + '&token=' + encodeURIComponent(token);
        var ws = null;
        var audioContext = null;
        var mediaStream = null;
        var source = null;
        var processor = null;
        var muted = false;
        var closed = false;
        var ringInterval = null;
        var lastInputLevelAt = 0;
        var lastOutputLevelAt = 0;
        var assistantReadyForUserAudio = false;
        var pendingCommands = [];
        var speechActive = false;
        var silenceFrameCount = 0;
        var consecutiveVoiceFrames = 0;
        var lastInputState = 'idle';
        var speechTurnStartedAt = 0;
        var TARGET_SAMPLE_RATE = 16000;
        var SPEECH_START_THRESHOLD = 0.028;
        var SPEECH_CONTINUE_THRESHOLD = 0.012;
        var SPEECH_START_FRAMES = 2;
        var SPEECH_END_SILENCE_FRAMES = 5;
        var MAX_SPEECH_TURN_MS = 7000;

        function post(payload) {
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        }

        function ensureAudioContext() {
          if (!audioContext) {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) {
              throw new Error('This device does not expose an AudioContext for live call audio.');
            }
            audioContext = new AudioCtx();
          }
          return audioContext;
        }

        function resolveGetUserMedia() {
          if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
            return function (constraints) {
              return navigator.mediaDevices.getUserMedia(constraints);
            };
          }

          var legacyGetUserMedia = navigator.getUserMedia
            || navigator.webkitGetUserMedia
            || navigator.mozGetUserMedia
            || navigator.msGetUserMedia;

          if (typeof legacyGetUserMedia === 'function') {
            return function (constraints) {
              return new Promise(function (resolve, reject) {
                try {
                  legacyGetUserMedia.call(navigator, constraints, resolve, reject);
                } catch (error) {
                  reject(error);
                }
              });
            };
          }

          return null;
        }

        function postRuntimeProbe() {
          try {
            post({
              type: 'log',
              payload: {
                message: 'Customer AI bridge runtime probe',
                detail: {
                  href: String(window.location && window.location.href || ''),
                  secureContext: Boolean(window.isSecureContext),
                  hasMediaDevices: Boolean(navigator.mediaDevices),
                  hasModernGetUserMedia: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
                  hasLegacyGetUserMedia: Boolean(
                    navigator.getUserMedia
                    || navigator.webkitGetUserMedia
                    || navigator.mozGetUserMedia
                    || navigator.msGetUserMedia
                  ),
                  audioContextSampleRate: Number((window.AudioContext || window.webkitAudioContext) ? ensureAudioContext().sampleRate : 0),
                  userAgent: String(navigator.userAgent || ''),
                },
              },
            });
          } catch (_error) {}
        }

        function startRinging() {
          stopRinging();
          ringInterval = setInterval(function () {
            try {
              var ctx = ensureAudioContext();
              var oscillator = ctx.createOscillator();
              var gain = ctx.createGain();
              oscillator.type = 'sine';
              oscillator.frequency.setValueAtTime(660, ctx.currentTime);
              gain.gain.setValueAtTime(0.0001, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.03);
              gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
              oscillator.connect(gain);
              gain.connect(ctx.destination);
              oscillator.start();
              oscillator.stop(ctx.currentTime + 0.3);
            } catch (_error) {}
          }, 1300);
        }

        function stopRinging() {
          if (ringInterval) {
            clearInterval(ringInterval);
            ringInterval = null;
          }
        }

        function decodePcm16ToFloat32(base64) {
          var binary = atob(base64);
          var buffer = new ArrayBuffer(binary.length);
          var bytes = new Uint8Array(buffer);
          for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          var view = new DataView(buffer);
          var out = new Float32Array(binary.length / 2);
          for (var index = 0; index < out.length; index += 1) {
            var sample = view.getInt16(index * 2, true);
            out[index] = sample / 32768;
          }
          return out;
        }

        function computeLevel(floatData) {
          if (!floatData || !floatData.length) return 0;
          var sum = 0;
          for (var i = 0; i < floatData.length; i += 1) {
            var sample = Number(floatData[i] || 0);
            sum += sample * sample;
          }
          var rms = Math.sqrt(sum / floatData.length);
          return Math.min(1, Math.max(0, rms * 4.5));
        }

        function postAudioLevel(direction, level) {
          var now = Date.now();
          if (direction === 'input') {
            if (now - lastInputLevelAt < 90) return;
            lastInputLevelAt = now;
          } else {
            if (now - lastOutputLevelAt < 120) return;
            lastOutputLevelAt = now;
          }
          post({ type: 'audio_level', payload: { direction: direction, level: level } });
        }

        function playPcm16(base64, sampleRate) {
          try {
            var ctx = ensureAudioContext();
            var float = decodePcm16ToFloat32(base64);
            postAudioLevel('output', computeLevel(float));
            var audioBuffer = ctx.createBuffer(1, float.length, sampleRate || 16000);
            audioBuffer.copyToChannel(float, 0);
            var bufferSource = ctx.createBufferSource();
            var gainNode = ctx.createGain();
            bufferSource.buffer = audioBuffer;
            bufferSource.connect(gainNode);
            gainNode.connect(ctx.destination);
            bufferSource.start();
            post({ type: 'audio_state', payload: { audioOutActive: true } });
            bufferSource.onended = function () {
              post({ type: 'audio_state', payload: { audioOutActive: false } });
              postAudioLevel('output', 0);
            };
          } catch (error) {
            post({ type: 'error', message: error.message || 'Unable to play AI audio.' });
          }
        }

        function sendWs(payload) {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify(payload));
        }

        function queueBridgeCommand(command, label) {
          pendingCommands.push(command);
          post({
            type: 'log',
            payload: {
              message: 'Queued bridge command until websocket opens',
              detail: { label: label, queueLength: pendingCommands.length },
            },
          });
        }

        function flushPendingCommands() {
          if (!ws || ws.readyState !== WebSocket.OPEN || !pendingCommands.length) return;
          var queued = pendingCommands.slice();
          pendingCommands = [];
          for (var i = 0; i < queued.length; i += 1) {
            sendWs(queued[i]);
          }
          post({
            type: 'log',
            payload: {
              message: 'Flushed queued bridge commands',
              detail: { count: queued.length },
            },
          });
        }

        function setInputState(nextState) {
          if (lastInputState === nextState) return;
          lastInputState = nextState;
          post({ type: 'audio_state', payload: { audioInActive: nextState === 'speaking', isMuted: muted } });
        }

        function beginSpeechTurn(sampleRate) {
          if (speechActive) return;
          speechActive = true;
          silenceFrameCount = 0;
          speechTurnStartedAt = Date.now();
          sendWs({ type: 'audio_activity_start', sampleRate: sampleRate, targetSampleRate: TARGET_SAMPLE_RATE });
          post({ type: 'log', payload: { message: 'Speech turn started', detail: { sampleRate: sampleRate, targetSampleRate: TARGET_SAMPLE_RATE } } });
          setInputState('speaking');
        }

        function endSpeechTurn(sampleRate, reason) {
          if (!speechActive) return;
          speechActive = false;
          silenceFrameCount = 0;
          consecutiveVoiceFrames = 0;
          var turnDurationMs = speechTurnStartedAt ? Date.now() - speechTurnStartedAt : 0;
          sendWs({
            type: 'audio_activity_end',
            sampleRate: sampleRate,
            targetSampleRate: TARGET_SAMPLE_RATE,
            reason: String(reason || 'manual'),
            turnDurationMs: turnDurationMs,
          });
          post({
            type: 'log',
            payload: {
              message: 'Speech turn ended',
              detail: {
                reason: String(reason || 'manual'),
                sampleRate: sampleRate,
                targetSampleRate: TARGET_SAMPLE_RATE,
                turnDurationMs: turnDurationMs,
              },
            },
          });
          speechTurnStartedAt = 0;
          postAudioLevel('input', 0);
          setInputState(muted ? 'muted' : 'idle');
        }

        function resampleTo16k(float32Samples, sourceRate) {
          var input = float32Samples instanceof Float32Array ? float32Samples : new Float32Array(float32Samples || []);
          var srcRate = Number(sourceRate || TARGET_SAMPLE_RATE);
          if (!input.length || !Number.isFinite(srcRate) || srcRate <= 0 || srcRate === TARGET_SAMPLE_RATE) {
            return input;
          }
          var ratio = srcRate / TARGET_SAMPLE_RATE;
          var outputLength = Math.max(1, Math.round(input.length / ratio));
          var output = new Float32Array(outputLength);
          var outputIndex = 0;
          var inputIndex = 0;
          while (outputIndex < outputLength) {
            var nextInputIndex = Math.min(input.length, Math.round((outputIndex + 1) * ratio));
            var sum = 0;
            var count = 0;
            for (var i = inputIndex; i < nextInputIndex; i += 1) {
              sum += input[i];
              count += 1;
            }
            output[outputIndex] = count ? (sum / count) : input[Math.min(inputIndex, input.length - 1)] || 0;
            outputIndex += 1;
            inputIndex = nextInputIndex;
          }
          return output;
        }

        function attachSocketHandlers() {
          ws.onopen = function () {
            post({ type: 'status', payload: { status: 'dialing', wsConnected: true } });
            startRinging();
            flushPendingCommands();
          };

          ws.onclose = function () {
            stopRinging();
            if (closed) return;
            post({ type: 'status', payload: { status: 'disconnected', wsConnected: false } });
          };

          ws.onerror = function () {
            stopRinging();
            if (closed) return;
            post({ type: 'error', message: 'AI websocket connection interrupted.' });
          };

          ws.onmessage = function (event) {
            var message = null;
            try {
              message = JSON.parse(String(event.data || '{}'));
            } catch (_error) {
              return;
            }

            if (message.type === 'audio' && message.base64Pcm16) {
              stopRinging();
              assistantReadyForUserAudio = true;
              post({
                type: 'log',
                payload: {
                  message: 'Ignored server audio chunk because local TTS is enabled for customer calls',
                  detail: { sampleRate: Number(message.sampleRate || 16000) },
                },
              });
            }

            if (
              message.type === 'conversation_event'
              && String(message?.event?.role || '').toLowerCase() === 'assistant'
            ) {
              stopRinging();
              assistantReadyForUserAudio = true;
            }

            if (message.type === 'status') {
              var normalizedStatus = String(message.status || '').toLowerCase();
              if (normalizedStatus === 'dialing') {
                startRinging();
              } else {
                stopRinging();
              }
              if (['connected', 'listening', 'processing', 'speaking'].indexOf(normalizedStatus) >= 0) {
                assistantReadyForUserAudio = true;
              }
            }

            post({ type: 'bridge_event', payload: message });
          };
        }

        async function startAudio() {
          var ctx = ensureAudioContext();
          if (typeof ctx.resume === 'function' && ctx.state === 'suspended') {
            try { await ctx.resume(); } catch (_resumeError) {}
          }
          var getUserMedia = resolveGetUserMedia();
          if (!getUserMedia) {
            throw new Error('Microphone capture is not available in this WebView runtime.');
          }
          mediaStream = await getUserMedia({
            audio: {
              autoGainControl: true,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: 48000,
            },
          });
          source = ctx.createMediaStreamSource(mediaStream);
          processor = ctx.createScriptProcessor(4096, 1, 1);
          var gainNode = ctx.createGain();
          gainNode.gain.value = 0;
          source.connect(processor);
          processor.connect(gainNode);
          gainNode.connect(ctx.destination);

          processor.onaudioprocess = function (audioProcessingEvent) {
            if (!ws || ws.readyState !== WebSocket.OPEN || muted) return;
            var input = audioProcessingEvent.inputBuffer.getChannelData(0);
            var level = computeLevel(input);
            postAudioLevel('input', level);
            if (!assistantReadyForUserAudio) {
              return;
            }
            if (level >= SPEECH_START_THRESHOLD) {
              consecutiveVoiceFrames += 1;
            } else {
              consecutiveVoiceFrames = 0;
            }
            if (!speechActive && consecutiveVoiceFrames >= SPEECH_START_FRAMES) {
              beginSpeechTurn(ctx.sampleRate);
            }
            if (!speechActive) {
              return;
            }
            if (level < SPEECH_CONTINUE_THRESHOLD) {
              silenceFrameCount += 1;
            } else {
              silenceFrameCount = 0;
            }
            var pcmSource = resampleTo16k(input, ctx.sampleRate);
            var pcm = new Int16Array(pcmSource.length);
            for (var i = 0; i < pcmSource.length; i += 1) {
              var sample = Math.max(-1, Math.min(1, pcmSource[i]));
              pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
            }
            var bytes = new Uint8Array(pcm.buffer);
            var binary = '';
            for (var index = 0; index < bytes.length; index += 1) {
              binary += String.fromCharCode(bytes[index]);
            }
            sendWs({ type: 'audio_in', base64Pcm16: btoa(binary), sampleRate: TARGET_SAMPLE_RATE, sourceSampleRate: ctx.sampleRate });
            if (silenceFrameCount >= SPEECH_END_SILENCE_FRAMES) {
              endSpeechTurn(ctx.sampleRate, 'silence');
              return;
            }
            if (speechTurnStartedAt && (Date.now() - speechTurnStartedAt) >= MAX_SPEECH_TURN_MS) {
              endSpeechTurn(ctx.sampleRate, 'max_turn_timeout');
            }
          };
        }

        async function connect() {
          try {
            if (!callId || !token) throw new Error('Missing call identity for the AI bridge.');
            post({ type: 'status', payload: { status: 'dialing', wsConnected: false } });
            startRinging();
            await startAudio();
            ws = new WebSocket(WS_URL);
            attachSocketHandlers();
          } catch (error) {
            stopRinging();
            post({
              type: 'error',
              message: (error && error.message) || 'Unable to start the AI call.',
            });
          }
        }

        function close() {
          closed = true;
          stopRinging();
          try { processor && processor.disconnect(); } catch (_error) {}
          try { source && source.disconnect(); } catch (_error) {}
          try { mediaStream && mediaStream.getTracks().forEach(function (track) { track.stop(); }); } catch (_error) {}
          try { endSpeechTurn(audioContext && audioContext.sampleRate ? audioContext.sampleRate : 16000, 'close'); } catch (_error) {}
          try {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'client_close' }));
            }
          } catch (_error) {}
          try { ws && ws.close(); } catch (_error) {}
          try { audioContext && audioContext.close(); } catch (_error) {}
          post({ type: 'audio_level', payload: { direction: 'input', level: 0 } });
            post({ type: 'audio_level', payload: { direction: 'output', level: 0 } });
            post({ type: 'status', payload: { status: 'ended', wsConnected: false } });
        }

        window.UncedoAiBridge = {
          receiveCommand: function (command) {
            var payload = command || {};
            if (payload.type === 'init_context') {
              var initContextCommand = { type: 'init_context', context: payload.context || {} };
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                pendingCommands = pendingCommands.filter(function (item) { return item.type !== 'init_context'; });
                queueBridgeCommand(initContextCommand, 'init_context');
                return;
              }
              sendWs(initContextCommand);
              return;
            }
            if (payload.type === 'customer_text') {
              var customerTextCommand = { type: 'customer_text', text: payload.text || '', metadata: payload.metadata || {} };
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                queueBridgeCommand(customerTextCommand, 'customer_text');
                return;
              }
              sendWs(customerTextCommand);
              return;
            }
            if (payload.type === 'app_prompt') {
              var appPromptCommand = { type: 'app_prompt', text: payload.text || '' };
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                queueBridgeCommand(appPromptCommand, 'app_prompt');
                return;
              }
              sendWs(appPromptCommand);
              return;
            }
            if (payload.type === 'toggle_mute') {
              if (!muted && speechActive) {
                endSpeechTurn(audioContext && audioContext.sampleRate ? audioContext.sampleRate : 16000, 'mute');
              }
              muted = !muted;
              if (muted) {
                post({ type: 'audio_level', payload: { direction: 'input', level: 0 } });
              }
              setInputState(muted ? 'muted' : 'idle');
              return;
            }
            if (payload.type === 'close') {
              close();
            }
          },
        };

        window.addEventListener('load', function () {
          postRuntimeProbe();
          post({ type: 'bridge_ready' });
          connect();
        });
      })();
    </script>
  </body>
</html>`;
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
    assistantResponded: false,
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

function buildCustomerAppPrompt(state, appPrompt = '') {
  return [
    'CUSTOMER SERVICE REQUEST APP PROMPT:',
    `Customer name: ${clip(state.customerName || 'Customer', 120)}`,
    `Current request state: ${clip(JSON.stringify(state.requestState || {}), 1800)}`,
    `Recent conversation summary:\n${buildConversationSummary(state) || '(none)'}`,
    'The following instruction came from the app and is authoritative.',
    `App instruction: ${clip(appPrompt, 1800)}`,
    'Respond as the Uncedo service request agent.',
    'Return compact JSON only in this shape: {"speak":"...","status":"collecting|ready_to_search","requestDraft":{"categoryId":"","serviceIds":[],"requiredAnswers":{},"optionalAnswers":{},"missingRequired":[],"selectedPortfolioReferences":[],"safetyFlags":[]},"selectionRequest":{"type":"service_selection|reference_upload|none","prompt":"..."}}.',
  ].join('\n\n');
}

function buildCustomerGreetingPrompt(state) {
  const customerName = clip(state.customerName || 'there', 120);
  return [
    'Start the phone call now.',
    `Greet ${customerName} by first name.`,
    'Introduce yourself as Uncedo.',
    'Ask what help they need today.',
    'Keep it natural and brief.',
    'Respond with plain text only on this first turn.',
    'Do not return JSON on this first turn.',
  ].join(' ');
}

function buildCustomerGreetingRetryPrompt(state) {
  const customerName = clip(state.customerName || 'there', 120);
  return [
    `Say exactly one short greeting to ${customerName}.`,
    'Introduce yourself as Uncedo.',
    'Ask what help they need today.',
    'Speak naturally.',
    'Do not return an empty response.',
    'Return plain text only.',
    'Do not return JSON on this greeting turn.',
  ].join(' ');
}

function mergeRequestState(current = {}, nextDraft = null) {
  if (!nextDraft || typeof nextDraft !== 'object') {
    return current && typeof current === 'object' ? current : {};
  }

  const base = current && typeof current === 'object' ? current : {};
  const requiredAnswers = {
    ...(base.requiredAnswers && typeof base.requiredAnswers === 'object' ? base.requiredAnswers : {}),
    ...(nextDraft.requiredAnswers && typeof nextDraft.requiredAnswers === 'object' ? nextDraft.requiredAnswers : {}),
  };
  const optionalAnswers = {
    ...(base.optionalAnswers && typeof base.optionalAnswers === 'object' ? base.optionalAnswers : {}),
    ...(nextDraft.optionalAnswers && typeof nextDraft.optionalAnswers === 'object' ? nextDraft.optionalAnswers : {}),
  };
  const structuredAnswers = {
    ...(base.structuredAnswers && typeof base.structuredAnswers === 'object' ? base.structuredAnswers : {}),
    ...(nextDraft.structuredAnswers && typeof nextDraft.structuredAnswers === 'object' ? nextDraft.structuredAnswers : {}),
    ...requiredAnswers,
    ...optionalAnswers,
  };

  return {
    ...base,
    ...nextDraft,
    serviceIds: Array.isArray(nextDraft.serviceIds) && nextDraft.serviceIds.length
      ? nextDraft.serviceIds
      : (Array.isArray(base.serviceIds) ? base.serviceIds : []),
    requiredAnswers,
    optionalAnswers,
    structuredAnswers,
    missingRequired: Array.isArray(nextDraft.missingRequired)
      ? nextDraft.missingRequired
      : (Array.isArray(base.missingRequired) ? base.missingRequired : []),
    selectedPortfolioReferences: Array.isArray(nextDraft.selectedPortfolioReferences)
      ? nextDraft.selectedPortfolioReferences
      : (Array.isArray(base.selectedPortfolioReferences) ? base.selectedPortfolioReferences : []),
    safetyFlags: Array.isArray(nextDraft.safetyFlags)
      ? nextDraft.safetyFlags
      : (Array.isArray(base.safetyFlags) ? base.safetyFlags : []),
  };
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
  const modelText = parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  return modelText || extractOutputTranscription(message);
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

function extractOutputTranscription(message) {
  return String(
    message?.serverContent?.outputTranscription?.text
    || message?.serverContent?.outputAudioTranscription?.text
    || '',
  ).trim();
}

function joinTextFragments(current = '', next = '') {
  const left = String(current || '');
  const right = String(next || '');
  if (!left) return right;
  if (!right) return left;
  if (/\s$/.test(left) || /^\s/.test(right)) return `${left}${right}`;
  if (/^[,.;:!?)}\]]/.test(right)) return `${left}${right}`;
  if (/[\[({"]$/.test(left)) return `${left}${right}`;
  return `${left} ${right}`;
}

function summarizeGeminiMessage(message = {}) {
  const serverContent = message?.serverContent || {};
  const modelParts = Array.isArray(serverContent?.modelTurn?.parts) ? serverContent.modelTurn.parts : [];
  const hasAudio = modelParts.some((part) => part?.inlineData?.data && String(part?.inlineData?.mimeType || '').includes('audio'));
  const textParts = modelParts
    .filter((part) => typeof part?.text === 'string' && part.text.trim())
    .map((part) => clip(part.text, 180));

  return {
    hasSetupComplete: Boolean(message?.setupComplete),
    hasServerContent: Boolean(message?.serverContent),
    hasUsageMetadata: Boolean(message?.usageMetadata),
    hasModelTurn: Boolean(serverContent?.modelTurn),
    hasAudio,
    textParts,
    inputTranscription: clip(extractInputTranscription(message), 180),
    outputTranscription: clip(extractOutputTranscription(message), 180),
    turnComplete: Boolean(serverContent?.turnComplete),
    generationComplete: Boolean(serverContent?.generationComplete),
    waitingForInput: Boolean(serverContent?.waitingForInput),
    interrupted: Boolean(serverContent?.interrupted),
    turnCompleteReason: String(serverContent?.turnCompleteReason || ''),
  };
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  if (req.url && req.url.startsWith('/customer-call-bridge')) {
    const html = buildCustomerCallBridgePage();
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
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
  const isCustomerTextCall = resourceKind === 'service_call' && contextState.agentType === 'customer_request';
  const activeModel = isCustomerTextCall ? CUSTOMER_TEXT_MODEL : LIVE_MODEL;
  const pricingReference = getPricingReferenceForModel(activeModel);
  let geminiLiveSession = null;
  let ended = false;
  let usageSummary = session?.aiLive?.usageSummary || null;
  let audioChunkCount = 0;
  let lastAudioChunkAt = 0;
  let activityOpen = false;
  let lastInputTranscript = '';
  let lastAssistantTranscript = '';
  let assistantResponseRawBuffer = '';
  let assistantResponseDisplayBuffer = '';
  let geminiSocketConnected = false;
  let geminiReady = false;
  let geminiSetupTimeout = null;
  let customerGreetingRetrySent = false;
  const pendingGeminiActions = [];
  const pendingCustomerActions = [];
  let customerActionRunning = false;
  const bufferedClientMessages = [];
  const bufferClientMessage = (buffer) => {
    bufferedClientMessages.push(Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || '')));
  };
  ws.on('message', bufferClientMessage);
  let endSession = async () => {};

  const enqueueGeminiAction = (label, action) => {
    if (!geminiSocketConnected || !geminiLiveSession || !geminiReady) {
      pendingGeminiActions.push({ label, action });
      console.log(JSON.stringify({
        event: 'gemini_action_queued',
        sessionId: resourceId,
        label,
        queueLength: pendingGeminiActions.length,
        reason: !geminiSocketConnected || !geminiLiveSession ? 'socket_not_connected' : 'gemini_not_ready',
      }));
      return null;
    }
    return action();
  };

  const flushPendingGeminiActions = async () => {
    while (pendingGeminiActions.length && geminiReady && geminiLiveSession) {
      const next = pendingGeminiActions.shift();
      try {
        await next.action();
      } catch (error) {
        console.error(JSON.stringify({
          event: 'gemini_action_flush_failed',
          sessionId: resourceId,
          label: next.label,
          message: error?.message || 'Unknown queued action failure',
        }));
      }
    }
  };

  await writeAiSnapshot(resourceKind, resourceId, {
    status: 'dialing',
    model: activeModel,
    wsConnected: true,
    audioInActive: false,
    audioOutActive: false,
    transcriptStatus: 'idle',
    lastError: '',
    startedAt: session?.aiLive?.startedAt || admin.firestore.FieldValue.serverTimestamp(),
  });
  send(ws, { type: 'status', status: 'dialing', wsConnected: true });

  const resetAssistantResponseBuffer = () => {
    lastAssistantTranscript = '';
    assistantResponseRawBuffer = '';
    assistantResponseDisplayBuffer = '';
  };

  const appendAssistantResponseChunk = (chunk) => {
    const nextChunk = String(chunk || '').trim();
    if (!nextChunk || nextChunk === lastAssistantTranscript) {
      return assistantResponseDisplayBuffer.trim();
    }

    if (assistantResponseRawBuffer && nextChunk.startsWith(assistantResponseRawBuffer)) {
      assistantResponseRawBuffer = nextChunk;
      assistantResponseDisplayBuffer = nextChunk;
    } else {
      assistantResponseRawBuffer += nextChunk;
      assistantResponseDisplayBuffer = joinTextFragments(assistantResponseDisplayBuffer, nextChunk);
    }

    lastAssistantTranscript = nextChunk;
    return assistantResponseDisplayBuffer.trim();
  };

  const emitAssistantTurn = () => {
    const rawBuffer = String(assistantResponseRawBuffer || '').trim();
    const displayBuffer = String(assistantResponseDisplayBuffer || '').trim();
    if (!rawBuffer && !displayBuffer) {
      resetAssistantResponseBuffer();
      return false;
    }

    const isStructuredPayload = /^[{\[]/.test(rawBuffer);
    const parsed = parseAiPayload(isStructuredPayload ? rawBuffer : displayBuffer || rawBuffer);
    const heard = String(parsed.heard || '').trim();
    const speak = String(parsed.speak || displayBuffer || rawBuffer).trim();
    const questionId = normalizeQuestionId(
      parsed.questionId,
      contextState.activeQuestionId || contextState.questions[0]?.questionId || 'q1',
    );
    const textMode = parsed.textMode || (parsed.boardActions.length ? 'readwrite' : 'readonly');

    resetAssistantResponseBuffer();

    if (parsed.requestDraft) {
      contextState.requestState = mergeRequestState(contextState.requestState, parsed.requestDraft);
    }

    if (heard) {
      const lastTurn = contextState.conversation[contextState.conversation.length - 1] || null;
      const shouldAppendHeard = !lastTurn
        || lastTurn.role !== 'student'
        || String(lastTurn.text || '').trim() !== heard;

      if (shouldAppendHeard) {
        contextState.conversation.push({
          role: 'student', text: heard, ts: Date.now(), questionId,
        });
        writers.pushTranscript({
          role: 'student',
          type: 'transcript',
          text: heard,
          uid,
          questionId,
        });
        send(ws, {
          type: 'conversation_event',
          event: { role: 'student', text: heard, questionId },
        });
      }
    }

    if (!speak) {
      return false;
    }

    if (!contextState.assistantResponded) {
      contextState.assistantResponded = true;
      send(ws, { type: 'status', status: 'connected' });
      writeAiSnapshot(resourceKind, resourceId, {
        status: 'connected',
        audioInActive: activityOpen,
        audioOutActive: false,
        transcriptStatus: 'finalized',
      }).catch(() => {});
    }

    send(ws, {
      type: 'transcript_final',
      text: speak,
      questionId,
      textMode,
      requestDraft: parsed.requestDraft,
      selectionRequest: parsed.selectionRequest,
      agentStatus: parsed.status,
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
      audioInActive: activityOpen,
      audioOutActive: true,
      transcriptStatus: 'finalized',
    }).catch(() => {});
    return true;
  };

  const emitAssistantDelta = (text) => {
    const displayText = String(text || '').trim();
    const looksStructured = /^[{\[]/.test(String(assistantResponseRawBuffer || '').trim());
    if (!displayText || looksStructured) {
      return;
    }

    send(ws, {
      type: 'transcript_delta',
      text: displayText,
      questionId: contextState.activeQuestionId || contextState.questions[0]?.questionId || 'q1',
      textMode: 'readonly',
    });
    send(ws, { type: 'status', status: 'speaking' });
    writeAiSnapshot(resourceKind, resourceId, {
      status: 'speaking',
      audioInActive: activityOpen,
      audioOutActive: true,
      transcriptStatus: 'streaming',
    }).catch(() => {});
  };

  const flushPendingCustomerActions = async () => {
    if (!isCustomerTextCall || customerActionRunning || !pendingCustomerActions.length) {
      return;
    }

    const next = pendingCustomerActions.shift();
    customerActionRunning = true;
    console.log(JSON.stringify({
      event: 'customer_turn_action_start',
      sessionId: resourceId,
      label: next.label,
      queueLength: pendingCustomerActions.length,
    }));

    try {
      await next.action();
    } catch (error) {
      console.error(JSON.stringify({
        event: 'customer_turn_action_failed',
        sessionId: resourceId,
        label: next.label,
        message: error?.message || 'Unknown customer turn failure',
      }));
      await writeAiSnapshot(resourceKind, resourceId, {
        status: contextState.assistantResponded ? 'connected' : 'dialing',
        lastError: String(error?.message || 'Unknown customer turn failure'),
      });
      send(ws, {
        type: 'error',
        message: `Customer AI generation failed: ${error?.message || 'Unknown error'}`,
      });
    } finally {
      customerActionRunning = false;
      if (pendingCustomerActions.length) {
        flushPendingCustomerActions().catch(() => {});
      }
    }
  };

  const enqueueCustomerAction = (label, action) => {
    pendingCustomerActions.push({ label, action });
    console.log(JSON.stringify({
      event: 'customer_turn_action_queued',
      sessionId: resourceId,
      label,
      queueLength: pendingCustomerActions.length,
      running: customerActionRunning,
    }));
    flushPendingCustomerActions().catch(() => {});
  };

  const streamCustomerTurn = async ({
    label = 'customer_turn',
    promptText = '',
    responseMimeType = '',
  } = {}) => {
    const trimmedPrompt = String(promptText || '').trim();
    if (!trimmedPrompt) {
      return false;
    }

    console.log(JSON.stringify({
      event: 'customer_turn_generate_start',
      sessionId: resourceId,
      label,
      model: activeModel,
      promptPreview: clip(trimmedPrompt, 220),
    }));

    resetAssistantResponseBuffer();
    let chunkCount = 0;

    const stream = await ai.models.generateContentStream({
      model: activeModel,
      contents: [{ role: 'user', parts: [{ text: trimmedPrompt }] }],
      config: {
        systemInstruction: AI_CUSTOMER_REQUEST_SYSTEM_INSTRUCTION,
        ...(responseMimeType ? { responseMimeType } : {}),
      },
    });

    for await (const chunk of stream) {
      chunkCount += 1;
      if (chunk?.usageMetadata) {
        usageSummary = buildUsageSummary(usageSummary, chunk.usageMetadata, {
          liveModel: activeModel,
          pricingReference,
          defaultResponseModality: 'text',
        });
        if (usageSummary) {
          send(ws, { type: 'usage', usage: usageSummary });
          writeAiSnapshot(resourceKind, resourceId, {
            model: activeModel,
            usageSummary,
          }).catch(() => {});
        }
      }

      const responseTextRaw = String(chunk?.text || '').trim();
      if (responseTextRaw) {
        const displayText = appendAssistantResponseChunk(responseTextRaw);
        if (chunkCount === 1 || chunkCount % 10 === 0) {
          console.log(JSON.stringify({
            event: 'customer_turn_generate_chunk',
            sessionId: resourceId,
            label,
            chunkCount,
            textPreview: clip(responseTextRaw, 180),
          }));
        }
        emitAssistantDelta(displayText);
      }
    }

    const emittedAssistantTurn = emitAssistantTurn();
    console.log(JSON.stringify({
      event: 'customer_turn_generate_complete',
      sessionId: resourceId,
      label,
      chunkCount,
      emittedAssistantTurn,
    }));

    return emittedAssistantTurn;
  };

  const onGeminiMessage = (message) => {
    console.log(JSON.stringify({
      event: 'gemini_live_message',
      sessionId: resourceId,
      summary: summarizeGeminiMessage(message),
    }));

    if (message?.usageMetadata) {
      usageSummary = buildUsageSummary(usageSummary, message.usageMetadata, {
        liveModel: activeModel,
        pricingReference,
        defaultResponseModality: 'audio',
      });
      if (usageSummary) {
        send(ws, { type: 'usage', usage: usageSummary });
        writeAiSnapshot(resourceKind, resourceId, {
          model: activeModel,
          usageSummary,
        }).catch(() => {});
      }
    }

    if (message?.setupComplete) {
      if (geminiSetupTimeout) {
        clearTimeout(geminiSetupTimeout);
        geminiSetupTimeout = null;
      }
      geminiReady = true;
      console.log(JSON.stringify({
        event: 'gemini_live_setup_complete',
        sessionId: resourceId,
      }));
      flushPendingGeminiActions().catch(() => {});
      send(ws, { type: 'status', status: 'dialing' });
      writeAiSnapshot(resourceKind, resourceId, {
        status: 'dialing',
        wsConnected: true,
        transcriptStatus: 'idle',
      }).catch(() => {});
    }

    if (message?.serverContent?.interrupted) {
      send(ws, { type: 'status', status: 'listening' });
      writeAiSnapshot(resourceKind, resourceId, {
        status: 'listening',
        audioOutActive: false,
        transcriptStatus: 'streaming',
      }).catch(() => {});
    }

    if (message?.serverContent?.waitingForInput) {
      send(ws, { type: 'status', status: 'listening' });
      writeAiSnapshot(resourceKind, resourceId, {
        status: 'listening',
        audioInActive: true,
        audioOutActive: false,
        transcriptStatus: 'streaming',
      }).catch(() => {});
    }

    const inputText = extractInputTranscription(message);
    if (inputText && inputText !== lastInputTranscript) {
      lastInputTranscript = inputText;
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
    if (responseTextRaw && responseTextRaw !== lastAssistantTranscript) {
      const displayText = appendAssistantResponseChunk(responseTextRaw);
      emitAssistantDelta(displayText);
    }

    const audioPayload = extractServerAudio(message);
    if (audioPayload?.data) {
      if (!contextState.assistantResponded) {
        contextState.assistantResponded = true;
        send(ws, { type: 'status', status: 'connected' });
        writeAiSnapshot(resourceKind, resourceId, {
          status: 'connected',
          audioInActive: activityOpen,
          audioOutActive: false,
          transcriptStatus: 'finalized',
        }).catch(() => {});
      }
      send(ws, { type: 'status', status: 'speaking' });
      console.log(JSON.stringify({
        event: 'gemini_live_audio_ignored_for_local_tts',
        sessionId: resourceId,
        mimeType: String(audioPayload.mimeType || ''),
      }));
      writeAiSnapshot(resourceKind, resourceId, {
        status: 'speaking',
        audioInActive: activityOpen,
        audioOutActive: true,
        transcriptStatus: 'finalized',
      }).catch(() => {});
    }

    if (message?.serverContent?.turnComplete || message?.serverContent?.generationComplete) {
      const emittedAssistantTurn = emitAssistantTurn();

      if (!contextState.assistantResponded && !emittedAssistantTurn && contextState.agentType === 'customer_request' && !customerGreetingRetrySent) {
        customerGreetingRetrySent = true;
        enqueueGeminiAction('customer_greeting_retry', () => {
          geminiLiveSession?.sendClientContent?.({
            turns: [{ role: 'user', parts: [{ text: buildCustomerGreetingRetryPrompt(contextState) }] }],
            turnComplete: true,
          });
        });
        send(ws, { type: 'status', status: 'dialing', wsConnected: true });
        writeAiSnapshot(resourceKind, resourceId, {
          status: 'dialing',
          audioInActive: false,
          audioOutActive: false,
          transcriptStatus: 'idle',
        }).catch(() => {});
        return;
      }

      if (contextState.assistantResponded || emittedAssistantTurn) {
        send(ws, { type: 'status', status: 'connected' });
        writeAiSnapshot(resourceKind, resourceId, {
          status: 'connected',
          audioInActive: activityOpen,
          audioOutActive: false,
          transcriptStatus: 'finalized',
        }).catch(() => {});
      }
    }
  };

  try {
    if (isCustomerTextCall) {
      console.log(JSON.stringify({
        event: 'customer_turn_processor_ready',
        sessionId: resourceId,
        model: activeModel,
        project: GOOGLE_CLOUD_PROJECT || '',
        location: GOOGLE_CLOUD_LOCATION || 'us-central1',
      }));
      geminiSocketConnected = true;
      geminiReady = true;
      send(ws, { type: 'status', status: 'dialing', wsConnected: true });
      writeAiSnapshot(resourceKind, resourceId, {
        status: 'dialing',
        wsConnected: true,
      }).catch(() => {});
    } else {
      console.log(JSON.stringify({
        event: 'gemini_live_connect_start',
        sessionId: resourceId,
        project: GOOGLE_CLOUD_PROJECT || '',
        location: GOOGLE_CLOUD_LOCATION || 'us-central1',
      }));
      geminiLiveSession = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: ['AUDIO'],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: contextState.agentType === 'customer_request'
            ? AI_CUSTOMER_REQUEST_SYSTEM_INSTRUCTION
            : AI_TUTOR_SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onmessage: onGeminiMessage,
          onerror: (event) => {
            console.error(JSON.stringify({
              event: 'gemini_live_socket_error',
              sessionId: resourceId,
              message: String(event?.message || event?.error?.message || 'Unknown Gemini socket error'),
            }));
            send(ws, { type: 'error', message: 'The live AI connection reported an error.' });
          },
          onclose: (event) => {
            geminiReady = false;
            geminiSocketConnected = false;
            geminiLiveSession = null;
            pendingGeminiActions.length = 0;
            if (geminiSetupTimeout) {
              clearTimeout(geminiSetupTimeout);
              geminiSetupTimeout = null;
            }
            console.log(JSON.stringify({
              event: 'gemini_live_socket_closed',
              sessionId: resourceId,
              code: Number(event?.code || 0),
              reason: String(event?.reason || ''),
            }));
            send(ws, { type: 'status', status: 'disconnected', wsConnected: false });
            send(ws, {
              type: 'error',
              message: String(event?.reason || 'The live AI connection closed unexpectedly.'),
            });
          },
        },
      });
      console.log(JSON.stringify({
        event: 'gemini_live_connect_success',
        sessionId: resourceId,
      }));
      geminiSocketConnected = true;
      send(ws, { type: 'status', status: 'dialing', wsConnected: true });
      writeAiSnapshot(resourceKind, resourceId, {
        status: 'dialing',
        wsConnected: true,
      }).catch(() => {});
      geminiSetupTimeout = setTimeout(() => {
        if (geminiReady || !geminiLiveSession) return;
        console.error(JSON.stringify({
          event: 'gemini_live_setup_timeout',
          sessionId: resourceId,
        }));
        send(ws, { type: 'status', status: 'disconnected', wsConnected: false });
        send(ws, {
          type: 'error',
          message: 'The live AI session did not become ready in time.',
        });
        try {
          geminiLiveSession?.close?.();
        } catch {}
      }, 10000);
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: isCustomerTextCall ? 'customer_turn_processor_failed' : 'gemini_live_connect_failed',
      sessionId: resourceId,
      message: error?.message || 'Unknown Gemini connection error',
    }));
    send(ws, { type: 'error', message: `Gemini connection failed: ${error.message}` });
  }

  endSession = async (status) => {
    if (ended) return;
    ended = true;
    if (geminiSetupTimeout) {
      clearTimeout(geminiSetupTimeout);
      geminiSetupTimeout = null;
    }
    try { await writers.close(); } catch {}
    try { await geminiLiveSession?.close?.(); } catch {}
    await writeAiSnapshot(resourceKind, resourceId, {
      status,
      model: activeModel,
      usageSummary,
      wsConnected: false,
      audioInActive: false,
      audioOutActive: false,
      transcriptStatus: 'finalized',
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    try { ws.close(); } catch {}
  };

  const handleClientMessage = async (buffer) => {
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
      console.log(JSON.stringify({
        event: 'customer_init_context_received',
        sessionId: resourceId,
        agentType: String(incoming.agentType || ''),
        hasPrimer: Boolean(incoming.primer),
        customerName: String(incoming.customerName || ''),
      }));
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

      const primer = contextState.agentType === 'customer_request'
        ? buildCustomerGreetingPrompt(contextState)
        : buildEffectiveContextPrompt(
          contextState,
          contextState.primer || 'Session initialized. Start from active question and ask learner readiness.',
        );
      console.log(JSON.stringify({
        event: 'customer_init_context_primer_prepared',
        sessionId: resourceId,
        agentType: contextState.agentType,
        primerPreview: clip(primer, 220),
      }));
      if (isCustomerTextCall) {
        enqueueCustomerAction('init_context_primer', async () => {
          console.log(JSON.stringify({
            event: 'customer_init_context_primer_sent',
            sessionId: resourceId,
            mode: 'turn_based_text',
          }));
          const emittedAssistantTurn = await streamCustomerTurn({
            label: 'init_context_primer',
            promptText: primer,
          });
          if (!contextState.assistantResponded && !emittedAssistantTurn && !customerGreetingRetrySent) {
            customerGreetingRetrySent = true;
            enqueueCustomerAction('customer_greeting_retry', () => streamCustomerTurn({
              label: 'customer_greeting_retry',
              promptText: buildCustomerGreetingRetryPrompt(contextState),
            }));
          }
          if (contextState.assistantResponded || emittedAssistantTurn) {
            send(ws, { type: 'status', status: 'connected' });
            await writeAiSnapshot(resourceKind, resourceId, {
              status: 'connected',
              audioInActive: false,
              audioOutActive: false,
              transcriptStatus: 'finalized',
            });
          }
        });
      } else {
        enqueueGeminiAction('init_context_primer', () => {
          console.log(JSON.stringify({
            event: 'customer_init_context_primer_sent',
            sessionId: resourceId,
          }));
          geminiLiveSession?.sendClientContent?.({
            turns: [{ role: 'user', parts: [{ text: primer }] }],
            turnComplete: true,
          });
        });
      }
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
      if (isCustomerTextCall) {
        send(ws, { type: 'status', status: 'processing' });
        enqueueCustomerAction('customer_text_prompt', async () => {
          await writeAiSnapshot(resourceKind, resourceId, {
            status: 'processing',
            audioInActive: false,
            audioOutActive: false,
            transcriptStatus: 'processing',
          });
          await streamCustomerTurn({
            label: 'customer_text_prompt',
            promptText: prompt,
            responseMimeType: 'application/json',
          });
          send(ws, { type: 'status', status: 'connected' });
          await writeAiSnapshot(resourceKind, resourceId, {
            status: 'connected',
            audioInActive: false,
            audioOutActive: false,
            transcriptStatus: 'finalized',
          });
        });
      } else {
        enqueueGeminiAction('customer_text_prompt', () => {
          geminiLiveSession?.sendClientContent?.({
            turns: [{ role: 'user', parts: [{ text: prompt }] }],
            turnComplete: true,
          });
        });
      }
      return;
    }

    if (message.type === 'app_prompt') {
      const appPrompt = String(message.text || '').trim();
      if (!appPrompt) return;
      if (isCustomerTextCall) {
        send(ws, { type: 'status', status: 'processing' });
        enqueueCustomerAction('app_prompt', async () => {
          await writeAiSnapshot(resourceKind, resourceId, {
            status: 'processing',
            audioInActive: false,
            audioOutActive: false,
            transcriptStatus: 'processing',
          });
          await streamCustomerTurn({
            label: 'app_prompt',
            promptText: buildCustomerAppPrompt(contextState, appPrompt),
            responseMimeType: 'application/json',
          });
          send(ws, { type: 'status', status: 'connected' });
          await writeAiSnapshot(resourceKind, resourceId, {
            status: 'connected',
            audioInActive: false,
            audioOutActive: false,
            transcriptStatus: 'finalized',
          });
        });
      } else {
        enqueueGeminiAction('app_prompt', () => {
          geminiLiveSession?.sendClientContent?.({
            turns: [{ role: 'user', parts: [{ text: appPrompt }] }],
            turnComplete: true,
          });
        });
      }
      return;
    }

    if (message.type === 'audio_activity_start') {
      if (isCustomerTextCall) {
        console.log(JSON.stringify({
          event: 'customer_text_call_audio_message_ignored',
          sessionId: resourceId,
          messageType: 'audio_activity_start',
        }));
        return;
      }
      activityOpen = true;
      lastInputTranscript = '';
      console.log(JSON.stringify({
        event: 'customer_audio_activity_start',
        sessionId: resourceId,
        sampleRate: Number(message.sampleRate || 0),
        targetSampleRate: Number(message.targetSampleRate || 0),
      }));
      send(ws, { type: 'status', status: 'listening' });
      await writeAiSnapshot(resourceKind, resourceId, {
        status: 'listening',
        audioInActive: true,
        audioOutActive: false,
        transcriptStatus: 'streaming',
      });
      try {
        if (typeof geminiLiveSession?.sendRealtimeInput === 'function' || !geminiReady) {
          enqueueGeminiAction('audio_activity_start', () => {
            geminiLiveSession.sendRealtimeInput({
              activityStart: {},
            });
          });
        }
      } catch (error) {
        send(ws, { type: 'error', message: `Audio activity start failed: ${error.message || 'Unknown error'}` });
      }
      return;
    }

    if (message.type === 'audio_activity_end') {
      if (isCustomerTextCall) {
        console.log(JSON.stringify({
          event: 'customer_text_call_audio_message_ignored',
          sessionId: resourceId,
          messageType: 'audio_activity_end',
        }));
        return;
      }
      activityOpen = false;
      console.log(JSON.stringify({
        event: 'customer_audio_activity_end',
        sessionId: resourceId,
        sampleRate: Number(message.sampleRate || 0),
        targetSampleRate: Number(message.targetSampleRate || 0),
        reason: String(message.reason || ''),
        turnDurationMs: Number(message.turnDurationMs || 0),
      }));
      send(ws, { type: 'status', status: 'processing' });
      await writeAiSnapshot(resourceKind, resourceId, {
        status: 'processing',
        audioInActive: false,
        audioOutActive: false,
        transcriptStatus: 'processing',
      });
      try {
        if (typeof geminiLiveSession?.sendRealtimeInput === 'function' || !geminiReady) {
          enqueueGeminiAction('audio_activity_end', () => {
            geminiLiveSession.sendRealtimeInput({
              activityEnd: {},
            });
            geminiLiveSession.sendRealtimeInput({
              audioStreamEnd: true,
            });
          });
        }
      } catch (error) {
        send(ws, { type: 'error', message: `Audio activity end failed: ${error.message || 'Unknown error'}` });
      }
      return;
    }

    if (message.type === 'audio_in') {
      if (isCustomerTextCall) {
        console.log(JSON.stringify({
          event: 'customer_text_call_audio_message_ignored',
          sessionId: resourceId,
          messageType: 'audio_in',
          byteLength: Buffer.from(String(message.base64Pcm16 || ''), 'base64').length,
          sampleRate: Number(message.sampleRate || 16000),
        }));
        return;
      }
      try {
        const sampleRate = Number(message.sampleRate || 16000);
        const bytes = Buffer.from(String(message.base64Pcm16 || ''), 'base64');
        if (bytes.length && (typeof geminiLiveSession?.sendRealtimeInput === 'function' || !geminiReady)) {
          audioChunkCount += 1;
          lastAudioChunkAt = Date.now();
          if (audioChunkCount === 1 || audioChunkCount % 24 === 0) {
            console.log(JSON.stringify({
              event: 'customer_audio_chunk_forwarded',
              sessionId: resourceId,
              chunkCount: audioChunkCount,
              byteLength: bytes.length,
              sampleRate,
              sourceSampleRate: Number(message.sourceSampleRate || sampleRate),
              activityOpen,
              lastAudioChunkAt,
              geminiReady,
            }));
          }
          enqueueGeminiAction('audio_in', () => {
            geminiLiveSession.sendRealtimeInput({
              audio: {
                data: String(message.base64Pcm16 || ''),
                mimeType: `audio/pcm;rate=${sampleRate}`,
              },
            });
          });
        }
      } catch (error) {
        send(ws, { type: 'error', message: `Audio stream failed: ${error.message || 'Unknown error'}` });
      }
    }
  };

  ws.off('message', bufferClientMessage);
  ws.on('message', handleClientMessage);
  bufferedClientMessages.splice(0).forEach((buffer) => {
    handleClientMessage(buffer).catch((error) => {
      console.error(JSON.stringify({
        event: 'buffered_client_message_failed',
        sessionId: resourceId,
        message: error?.message || 'Unknown buffered client message failure',
      }));
    });
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
