import { getFirebaseClients } from '../firebase/config';

function toWebSocketUrl(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';
  if (input.startsWith('ws://') || input.startsWith('wss://')) return input;
  if (input.startsWith('http://')) return `ws://${input.slice('http://'.length)}`;
  if (input.startsWith('https://')) return `wss://${input.slice('https://'.length)}`;
  return input;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function createAiLiveSessionController({ sessionId, callbacks = {} }) {
  const clients = await getFirebaseClients();
  const auth = clients?.auth;
  const user = auth?.currentUser || null;
  if (!user) throw new Error('You must be signed in to start an AI live session.');
  if (!sessionId) throw new Error('Missing session id.');

  const baseWsUrl = toWebSocketUrl(import.meta.env.VITE_AI_LIVE_PROXY_WS_URL || '');
  if (!baseWsUrl) throw new Error('Missing VITE_AI_LIVE_PROXY_WS_URL.');

  const token = await user.getIdToken();
  const wsUrl = `${baseWsUrl.replace(/\/$/, '')}/live?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioCtx();
  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(mediaStream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0;
  source.connect(processor);
  processor.connect(gainNode);
  gainNode.connect(audioContext.destination);

  let ws = null;
  let closed = false;
  let muted = false;

  const emitStatus = (status, patch = {}) => {
    callbacks.onStatusChange?.({ status, ...patch });
  };

  const decodePcm16ToFloat32 = (base64) => {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(buffer);
    const out = new Float32Array(binary.length / 2);
    for (let i = 0; i < out.length; i += 1) {
      const sample = view.getInt16(i * 2, true);
      out[i] = sample / 32768;
    }
    return out;
  };

  const playPcm16 = (base64, sampleRate = 16000) => {
    try {
      const float = decodePcm16ToFloat32(base64);
      const audioBuffer = audioContext.createBuffer(1, float.length, sampleRate);
      audioBuffer.copyToChannel(float, 0);
      const src = audioContext.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(audioContext.destination);
      src.start();
      callbacks.onAudioStateChange?.({ audioOutActive: true });
      src.onended = () => callbacks.onAudioStateChange?.({ audioOutActive: false });
    } catch (error) {
      callbacks.onError?.(`Failed to play AI audio: ${error.message || 'unknown error'}`);
    }
  };

  const attachSocketHandlers = () => {
    ws.onclose = () => {
      if (closed) return;
      emitStatus('disconnected', { wsConnected: false });
      callbacks.onClose?.();
    };

    ws.onerror = () => {
      if (closed) return;
      callbacks.onError?.('AI websocket connection interrupted.');
    };

    ws.onmessage = (event) => {
      let message = null;
      try {
        message = JSON.parse(String(event.data || '{}'));
      } catch {
        return;
      }

      if (message.type === 'status') {
        emitStatus(message.status || 'connected', message);
        return;
      }

      if (message.type === 'transcript_delta') {
        callbacks.onTranscriptDelta?.({
          text: String(message.text || ''),
          questionId: message.questionId || null,
          textMode: message.textMode || 'readonly',
        });
        return;
      }

      if (message.type === 'transcript_final') {
        callbacks.onTranscriptFinal?.({
          text: String(message.text || ''),
          questionId: message.questionId || null,
          textMode: message.textMode || 'readonly',
        });
        return;
      }

      if (message.type === 'conversation_event') {
        callbacks.onConversationEvent?.(message.event || null);
        return;
      }

      if (message.type === 'board_action') {
        callbacks.onBoardAction?.(message.action || null);
        return;
      }

      if (message.type === 'audio') {
        if (message.base64Pcm16) {
          playPcm16(message.base64Pcm16, Number(message.sampleRate || 16000));
        }
        return;
      }

      if (message.type === 'error') {
        callbacks.onError?.(String(message.message || 'AI live error'));
      }
    };
  };

  const openSocketOnce = (attempt) => new Promise((resolve, reject) => {
    const candidate = new WebSocket(wsUrl);
    let settled = false;

    candidate.onopen = () => {
      settled = true;
      ws = candidate;
      attachSocketHandlers();
      emitStatus('connected', { wsConnected: true, attempt });
      callbacks.onAudioStateChange?.({ audioInActive: true });
      resolve();
    };

    candidate.onerror = () => {
      if (settled) return;
      settled = true;
      try { candidate.close(); } catch {}
      reject(new Error('AI websocket failed to connect.'));
    };

    candidate.onclose = () => {
      if (settled) return;
      settled = true;
      reject(new Error('AI websocket closed before connecting.'));
    };
  });

  const openSocket = async () => {
    const delays = [0, 800, 1600, 3200, 5000, 8000];
    let lastError = null;

    for (let index = 0; index < delays.length; index += 1) {
      if (closed) throw new Error('AI websocket connection canceled.');
      if (delays[index] > 0) await wait(delays[index]);
      const attempt = index + 1;
      emitStatus('connecting', { wsConnected: false, attempt });
      try {
        await openSocketOnce(attempt);
        return;
      } catch (error) {
        lastError = error;
        callbacks.onError?.(`AI websocket reconnecting (${attempt}/${delays.length})...`);
      }
    }

    throw lastError || new Error('AI websocket failed to connect.');
  };

  emitStatus('connecting', { wsConnected: false });
  await openSocket();

  const sendMessage = (payload) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  processor.onaudioprocess = (audioProcessingEvent) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || muted) return;
    const input = audioProcessingEvent.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 32768 : s * 32767;
    }
    const bytes = new Uint8Array(pcm.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    ws.send(JSON.stringify({ type: 'audio_in', base64Pcm16: btoa(binary), sampleRate: audioContext.sampleRate }));
  };

  return {
    sendInitContext(contextPayload = {}) {
      sendMessage({ type: 'init_context', context: contextPayload });
    },
    sendStudentText(text, metadata = {}) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return;
      sendMessage({ type: 'student_text', text: trimmed, metadata });
    },
    toggleMute() {
      muted = !muted;
      callbacks.onAudioStateChange?.({ audioInActive: !muted });
      return !muted;
    },
    close() {
      closed = true;
      try { processor.disconnect(); } catch {}
      try { source.disconnect(); } catch {}
      mediaStream.getTracks().forEach((track) => track.stop());
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'client_close' }));
      }
      try { ws?.close(); } catch {}
      try { audioContext.close(); } catch {}
      emitStatus('ended', { wsConnected: false });
      callbacks.onClose?.();
    },
  };
}
