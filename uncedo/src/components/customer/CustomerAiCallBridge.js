import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildBridgeHtml({ wsUrl }) {
  const safeWsUrl = escapeJson(String(wsUrl || ''));
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
        var WS_URL = ${safeWsUrl};
        var ws = null;
        var audioContext = null;
        var mediaStream = null;
        var source = null;
        var processor = null;
        var muted = false;
        var closed = false;
        var ringInterval = null;

        function post(payload) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
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
                  userAgent: String(navigator.userAgent || ''),
                },
              },
            });
          } catch (_error) {
            // no-op
          }
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
            } catch (error) {}
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

        function playPcm16(base64, sampleRate) {
          try {
            var ctx = ensureAudioContext();
            var float = decodePcm16ToFloat32(base64);
            var audioBuffer = ctx.createBuffer(1, float.length, sampleRate || 16000);
            audioBuffer.copyToChannel(float, 0);
            var bufferSource = ctx.createBufferSource();
            bufferSource.buffer = audioBuffer;
            bufferSource.connect(ctx.destination);
            bufferSource.start();
            post({ type: 'audio_state', payload: { audioOutActive: true } });
            bufferSource.onended = function () {
              post({ type: 'audio_state', payload: { audioOutActive: false } });
            };
          } catch (error) {
            post({ type: 'error', message: error.message || 'Unable to play AI audio.' });
          }
        }

        function sendWs(payload) {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify(payload));
        }

        function attachSocketHandlers() {
          ws.onopen = function () {
            stopRinging();
            post({ type: 'status', payload: { status: 'connected', wsConnected: true } });
          };

          ws.onclose = function () {
            if (closed) return;
            post({ type: 'status', payload: { status: 'disconnected', wsConnected: false } });
          };

          ws.onerror = function () {
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
              playPcm16(message.base64Pcm16, Number(message.sampleRate || 16000));
            }

            post({ type: 'bridge_event', payload: message });
          };
        }

        async function startAudio() {
          var ctx = ensureAudioContext();
          var getUserMedia = resolveGetUserMedia();
          if (!getUserMedia) {
            throw new Error('Microphone capture is not available in this WebView. Please allow microphone access and try again.');
          }
          mediaStream = await getUserMedia({ audio: true });
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
            var pcm = new Int16Array(input.length);
            for (var i = 0; i < input.length; i += 1) {
              var sample = Math.max(-1, Math.min(1, input[i]));
              pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
            }
            var bytes = new Uint8Array(pcm.buffer);
            var binary = '';
            for (var index = 0; index < bytes.length; index += 1) {
              binary += String.fromCharCode(bytes[index]);
            }
            sendWs({ type: 'audio_in', base64Pcm16: btoa(binary), sampleRate: ctx.sampleRate });
          };
        }

        async function connect() {
          try {
            if (!WS_URL) throw new Error('Missing AI live proxy websocket URL.');
            post({ type: 'status', payload: { status: 'dialing', wsConnected: false } });
            startRinging();
            await startAudio();
            ws = new WebSocket(WS_URL);
            attachSocketHandlers();
          } catch (error) {
            stopRinging();
            post({ type: 'error', message: error.message || 'Unable to start the AI call.' });
          }
        }

        function close() {
          closed = true;
          stopRinging();
          try { processor && processor.disconnect(); } catch (error) {}
          try { source && source.disconnect(); } catch (error) {}
          try { mediaStream && mediaStream.getTracks().forEach(function (track) { track.stop(); }); } catch (error) {}
          try {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'client_close' }));
            }
          } catch (error) {}
          try { ws && ws.close(); } catch (error) {}
          try { audioContext && audioContext.close(); } catch (error) {}
          post({ type: 'status', payload: { status: 'ended', wsConnected: false } });
        }

        window.UncedoAiBridge = {
          receiveCommand: function (command) {
            var payload = command || {};
            if (payload.type === 'init_context') {
              sendWs({ type: 'init_context', context: payload.context || {} });
              return;
            }
            if (payload.type === 'customer_text') {
              sendWs({ type: 'customer_text', text: payload.text || '', metadata: payload.metadata || {} });
              return;
            }
            if (payload.type === 'app_prompt') {
              sendWs({ type: 'app_prompt', text: payload.text || '' });
              return;
            }
            if (payload.type === 'toggle_mute') {
              muted = !muted;
              post({ type: 'audio_state', payload: { audioInActive: !muted, isMuted: muted } });
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

export const CustomerAiCallBridge = forwardRef(function CustomerAiCallBridge(
  {
    idToken = '',
    onBridgeMessage,
    callId = '',
    wsBaseUrl = '',
  },
  ref,
) {
  const webViewRef = useRef(null);

  const wsUrl = useMemo(() => {
    if (!wsBaseUrl || !idToken || !callId) return '';
    const normalized = String(wsBaseUrl || '').replace(/\/+$/, '');
    return `${normalized}/live?callId=${encodeURIComponent(String(callId || ''))}&token=${encodeURIComponent(String(idToken || ''))}`;
  }, [callId, idToken, wsBaseUrl]);

  const html = useMemo(() => buildBridgeHtml({ wsUrl }), [wsUrl]);

  useImperativeHandle(ref, () => ({
    sendInitContext(context = {}) {
      webViewRef.current?.injectJavaScript(`window.UncedoAiBridge && window.UncedoAiBridge.receiveCommand(${escapeJson({ type: 'init_context', context })}); true;`);
    },
    sendCustomerText(text, metadata = {}) {
      webViewRef.current?.injectJavaScript(`window.UncedoAiBridge && window.UncedoAiBridge.receiveCommand(${escapeJson({ type: 'customer_text', text, metadata })}); true;`);
    },
    sendAppPrompt(text) {
      webViewRef.current?.injectJavaScript(`window.UncedoAiBridge && window.UncedoAiBridge.receiveCommand(${escapeJson({ type: 'app_prompt', text })}); true;`);
    },
    toggleMute() {
      webViewRef.current?.injectJavaScript(`window.UncedoAiBridge && window.UncedoAiBridge.receiveCommand(${escapeJson({ type: 'toggle_mute' })}); true;`);
    },
    close() {
      webViewRef.current?.injectJavaScript(`window.UncedoAiBridge && window.UncedoAiBridge.receiveCommand(${escapeJson({ type: 'close' })}); true;`);
    },
  }), []);

  return (
    <View style={styles.hiddenWrap}>
      <WebView
        ref={webViewRef}
        allowsInlineMediaPlayback
        domStorageEnabled
        javaScriptEnabled
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        mediaPlaybackRequiresUserAction={false}
        onMessage={onBridgeMessage}
        originWhitelist={['*']}
        source={{ html }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  hiddenWrap: {
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    width: 1,
  },
});
