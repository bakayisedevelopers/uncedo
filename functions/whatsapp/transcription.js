'use strict';

async function transcribeWhatsAppAudio({ buffer, mimeType, apiKey, model, fetchImpl = fetch } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 16 * 1024 * 1024) throw new Error('Voice note is empty or too large.');
  const key = String(apiKey || '').trim();
  const modelId = String(model || '').trim();
  if (!key || !/^[-A-Za-z0-9._]{2,100}$/.test(modelId)) throw new Error('Voice transcription is not configured.');
  const form = new FormData();
  const extension = String(mimeType || '').includes('ogg') ? 'ogg'
    : String(mimeType || '').includes('mpeg') ? 'mp3'
      : String(mimeType || '').includes('amr') ? 'amr' : 'm4a';
  form.append('file', new Blob([buffer], { type: String(mimeType || 'application/octet-stream') }), `voice-note.${extension}`);
  form.append('model', modelId);
  form.append('response_format', 'json');
  const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const error = new Error('Voice transcription provider rejected the request.');
    error.code = `transcription_http_${response.status}`;
    throw error;
  }
  const payload = await response.json();
  const text = String(payload?.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 8000);
  if (!text) throw new Error('Voice transcription returned no usable text.');
  return text;
}

module.exports = { transcribeWhatsAppAudio };
