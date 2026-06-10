import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { FIREBASE_PUBLIC_CONFIG, USE_FIREBASE_EMULATORS, WEB_APP_BASE_URL } from '../../constants/runtimeConfig';
import { getFunctionEndpoint } from '../../firebase/config';

function toBridgeMessage(type, payload) {
  return {
    nativeEvent: {
      data: JSON.stringify({ type, payload: payload || {} }),
    },
  };
}

export function StudentRtcSessionView({
  authHandoff,
  bridgeRef,
  idToken,
  onBridgeMessage,
  sessionId,
}) {
  const webViewRef = useRef(null);
  const mutedRef = useRef(false);

  const sessionUrl = useMemo(() => {
    const sessionPath = `/app/session/${encodeURIComponent(String(sessionId || ''))}`;
    const params = new URLSearchParams({
      sessionId: String(sessionId || ''),
      target: `${WEB_APP_BASE_URL}${sessionPath}`,
      source: 'mobile',
      apiKey: FIREBASE_PUBLIC_CONFIG.apiKey,
      authDomain: FIREBASE_PUBLIC_CONFIG.authDomain,
      projectId: FIREBASE_PUBLIC_CONFIG.projectId,
      appId: FIREBASE_PUBLIC_CONFIG.appId,
    });
    if (USE_FIREBASE_EMULATORS) {
      return `${getFunctionEndpoint('mobileWebviewAuth')}?${params.toString()}`;
    }
    return `${WEB_APP_BASE_URL}/mobile-webview-auth?${params.toString()}`;
  }, [sessionId]);
  const injectedAuthBootstrap = useMemo(() => {
    const payload = JSON.stringify(authHandoff || {});
    return `
      (function () {
        try {
          var handoff = ${payload};
          if (!handoff || !handoff.apiKey || !handoff.user) return;
          var appName = '[DEFAULT]';
          var authKey = 'firebase:authUser:' + handoff.apiKey + ':' + appName;
          var persistenceKey = 'firebase:persistence:' + handoff.apiKey + ':' + appName;
          window.localStorage.setItem(authKey, JSON.stringify(handoff.user));
          window.localStorage.setItem(persistenceKey, 'local');

          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'log',
              payload: { message: 'Auth handoff persisted to localStorage.' }
            }));
          }
        } catch (error) {
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'log',
              payload: { message: 'Auth handoff persistence failed.', error: String(error && error.message || error) }
            }));
          }
        }
      })();
      true;
    `;
  }, [authHandoff]);
  const injectedRuntimeProbe = `
    (function () {
      try {
        if (!window.__PARAKLEO_CONSOLE_BRIDGED__) {
          window.__PARAKLEO_CONSOLE_BRIDGED__ = true;
          var originalLog = console.log;
          var originalWarn = console.warn;
          var originalError = console.error;
          function forward(level, args) {
            try {
              var serialized = Array.prototype.map.call(args || [], function (entry) {
                if (typeof entry === 'string') return entry;
                try { return JSON.stringify(entry); } catch (_e) { return String(entry); }
              }).join(' ');
              if (serialized.indexOf('parakleo:') === -1 && serialized.indexOf('webrtc') === -1) return;
              if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'log',
                  payload: { message: 'WebView console ' + level, detail: serialized }
                }));
              }
            } catch (_err) {
              // no-op
            }
          }
          console.log = function () { forward('log', arguments); originalLog && originalLog.apply(console, arguments); };
          console.warn = function () { forward('warn', arguments); originalWarn && originalWarn.apply(console, arguments); };
          console.error = function () { forward('error', arguments); originalError && originalError.apply(console, arguments); };
        }

        if (!window.__PARAKLEO_RTC_PROBE__) {
          window.__PARAKLEO_RTC_PROBE__ = true;

          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            var originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            function buildSilentAudioStream() {
              try {
                var AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return null;
                var ctx = new AudioCtx();
                var oscillator = ctx.createOscillator();
                var gain = ctx.createGain();
                var destination = ctx.createMediaStreamDestination();
                gain.gain.value = 0.00001;
                oscillator.connect(gain);
                gain.connect(destination);
                oscillator.start();
                return destination.stream || null;
              } catch (_error) {
                return null;
              }
            }
            navigator.mediaDevices.getUserMedia = function (constraints) {
              if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'log',
                  payload: { message: 'RTC getUserMedia called', detail: constraints }
                }));
              }
              var sourcePromise = originalGetUserMedia(constraints).then(function (stream) {
                  var tracks = (stream && stream.getTracks ? stream.getTracks() : []).map(function (t) {
                    return { kind: t.kind, id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState };
                  });
                  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'log',
                      payload: { message: 'RTC getUserMedia success', detail: { trackCount: tracks.length, tracks: tracks } }
                    }));
                  }
                  return stream;
                });

              var timeoutMs = 4500;
              var timeoutPromise = new Promise(function (resolve) {
                setTimeout(function () {
                  var silentStream = buildSilentAudioStream();
                  if (!silentStream) {
                    resolve(null);
                    return;
                  }
                  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'log',
                      payload: { message: 'RTC getUserMedia timeout fallback: synthetic silent stream.' }
                    }));
                  }
                  resolve(silentStream);
                }, timeoutMs);
              });

              return Promise.race([sourcePromise, timeoutPromise]).then(function (stream) {
                if (stream) return stream;
                return sourcePromise;
              }).catch(function (err) {
                if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'log',
                    payload: { message: 'RTC getUserMedia failed', error: String(err && (err.name + ': ' + err.message) || err) }
                  }));
                }
                throw err;
              });
            };
          }

          if (window.RTCPeerConnection) {
            var OriginalRTCPeerConnection = window.RTCPeerConnection;
            window.RTCPeerConnection = function (config) {
              var pc = new OriginalRTCPeerConnection(config);
              try {
                var detail = {
                  iceTransportPolicy: config && config.iceTransportPolicy ? config.iceTransportPolicy : 'all',
                  iceServers: (config && Array.isArray(config.iceServers) ? config.iceServers : []).map(function (s) {
                    var urls = Array.isArray(s.urls) ? s.urls : [s.urls];
                    return { urls: urls, hasUsername: Boolean(s.username), hasCredential: Boolean(s.credential) };
                  }),
                };
                if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'log',
                    payload: { message: 'RTCPeerConnection created', detail: detail }
                  }));
                }
              } catch (_e) {
                // no-op
              }

              pc.addEventListener('connectionstatechange', function () {
                if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                  var state = String(pc.connectionState || '');
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'rtc_state',
                    payload: {
                      connectionMessage: state === 'connected' ? 'Connected' : (state === 'connecting' ? 'Connecting...' : 'Reconnecting...'),
                      isPeerConnected: state === 'connected',
                      networkError: '',
                    }
                  }));
                }
                if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'log',
                    payload: { message: 'RTC connectionstatechange', detail: pc.connectionState }
                  }));
                }
              });
              pc.addEventListener('iceconnectionstatechange', function () {
                if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                  var iceState = String(pc.iceConnectionState || '');
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'rtc_state',
                    payload: {
                      connectionMessage: (iceState === 'connected' || iceState === 'completed') ? 'Connected' : (iceState === 'checking' ? 'Connecting...' : 'Reconnecting...'),
                      isPeerConnected: iceState === 'connected' || iceState === 'completed',
                      networkError: '',
                    }
                  }));
                }
                if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'log',
                    payload: { message: 'RTC iceconnectionstatechange', detail: pc.iceConnectionState }
                  }));
                }
              });
              pc.addEventListener('signalingstatechange', function () {
                if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'log',
                    payload: { message: 'RTC signalingstatechange', detail: pc.signalingState }
                  }));
                }
              });
              pc.addEventListener('icecandidateerror', function (event) {
                if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'log',
                    payload: {
                      message: 'RTC icecandidateerror',
                      detail: {
                        errorCode: event && event.errorCode,
                        errorText: event && event.errorText,
                        url: event && event.url,
                      },
                    },
                  }));
                }
              });

              return pc;
            };
            window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
          }
        }

        var payload = {
          href: String(window.location && window.location.href || ''),
          hasMediaDevices: Boolean(navigator.mediaDevices),
          hasGetUserMedia: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
          secureContext: Boolean(window.isSecureContext),
          userAgent: String(navigator.userAgent || ''),
        };
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'log',
            payload: { message: 'WebView runtime probe', detail: payload }
          }));
        }
      } catch (error) {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'log',
            payload: { message: 'WebView runtime probe failed', error: String(error && error.message || error) }
          }));
        }
      }
    })();
    true;
  `;

  const emitBridge = (type, payload) => {
    onBridgeMessage?.(toBridgeMessage(type, payload));
  };

  const toggleAudio = async () => {
    mutedRef.current = !mutedRef.current;
    webViewRef.current?.injectJavaScript(`
      (function () {
        var muted = ${mutedRef.current ? 'true' : 'false'};
        var media = document.querySelectorAll('video, audio');
        media.forEach(function (el) { el.muted = muted; });
        if (window.ParakleoSessionBridge && typeof window.ParakleoSessionBridge.toggleAudio === 'function') {
          window.ParakleoSessionBridge.toggleAudio();
        }
      })();
      true;
    `);
    emitBridge('rtc_state', { isMuted: mutedRef.current });
    return !mutedRef.current;
  };

  const closeRtc = async () => {
    webViewRef.current?.injectJavaScript(`
      (function () {
        if (window.ParakleoSessionBridge && typeof window.ParakleoSessionBridge.close === 'function') {
          window.ParakleoSessionBridge.close();
        }
      })();
      true;
    `);
  };

  useEffect(() => {
    bridgeRef.current = {
      toggleAudio,
      close: closeRtc,
    };

    return () => {
      if (bridgeRef.current?.close === closeRtc) {
        bridgeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeRef]);

  useEffect(() => {
    emitBridge('rtc_state', {
      connectionMessage: 'Opening secure session room...',
      networkError: '',
      isPeerConnected: false,
      isRemoteScreenSharing: false,
      hasLiveRemoteScreenTrack: false,
      isMuted: mutedRef.current,
    });

    return () => closeRtc().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <View style={styles.wrap}>
      <WebView
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        domStorageEnabled
        javaScriptEnabled
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onError={(event) => {
          emitBridge('rtc_state', {
            connectionMessage: 'Unable to load secure session room.',
            networkError: event?.nativeEvent?.description || 'Please check your internet connection and try again.',
            isPeerConnected: false,
            isRemoteScreenSharing: false,
            hasLiveRemoteScreenTrack: false,
          });
          emitBridge('log', {
            message: 'WebView onError',
            error: JSON.stringify(event?.nativeEvent || {}),
          });
        }}
        onHttpError={(event) => {
          emitBridge('rtc_state', {
            connectionMessage: 'Secure session room request failed.',
            networkError: `HTTP ${event?.nativeEvent?.statusCode || ''} while loading session room.`,
            isPeerConnected: false,
            isRemoteScreenSharing: false,
            hasLiveRemoteScreenTrack: false,
          });
          emitBridge('log', {
            message: 'WebView onHttpError',
            error: JSON.stringify(event?.nativeEvent || {}),
          });
        }}
        onLoadEnd={() => {
          emitBridge('rtc_state', {
            connectionMessage: 'Secure session room ready.',
            networkError: '',
            isPeerConnected: true,
            isRemoteScreenSharing: true,
            hasLiveRemoteScreenTrack: true,
            isMuted: mutedRef.current,
          });
        }}
        onMessage={(event) => {
          onBridgeMessage?.(event);
        }}
        onShouldStartLoadWithRequest={(request) => {
          emitBridge('log', {
            message: `WebView navigating to ${request?.url || 'unknown URL'}`,
          });
          return true;
        }}
        originWhitelist={['https://*']}
        ref={webViewRef}
        injectedJavaScriptBeforeContentLoaded={injectedAuthBootstrap}
        injectedJavaScript={injectedRuntimeProbe}
        source={{
          uri: sessionUrl,
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        }}
        renderLoading={() => (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#ffffff" size="large" />
          </View>
        )}
        startInLoadingState
        style={styles.video}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  video: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
});
