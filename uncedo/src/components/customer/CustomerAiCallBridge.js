import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function normalizeBridgeBaseUrl(wsBaseUrl = '') {
  return String(wsBaseUrl || '')
    .trim()
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://')
    .replace(/\/+$/, '');
}

function buildBridgeUrl({ wsBaseUrl = '', idToken = '', callId = '' } = {}) {
  const baseUrl = normalizeBridgeBaseUrl(wsBaseUrl);
  if (!baseUrl || !idToken || !callId) return '';
  const params = new URLSearchParams({
    callId: String(callId || ''),
    token: String(idToken || ''),
  });
  return `${baseUrl}/customer-call-bridge?${params.toString()}`;
}

function emitBridgeEvent(onBridgeMessage, payload) {
  onBridgeMessage?.({
    nativeEvent: {
      data: JSON.stringify(payload),
    },
  });
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

  const bridgeUrl = useMemo(
    () => buildBridgeUrl({ wsBaseUrl, idToken, callId }),
    [callId, idToken, wsBaseUrl],
  );

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
        onError={(event) => {
          emitBridgeEvent(onBridgeMessage, {
            type: 'error',
            message: `Customer call bridge failed to load: ${event?.nativeEvent?.description || 'Unknown WebView error'}`,
          });
        }}
        onHttpError={(event) => {
          emitBridgeEvent(onBridgeMessage, {
            type: 'error',
            message: `Customer call bridge returned HTTP ${event?.nativeEvent?.statusCode || 'error'}.`,
          });
        }}
        onMessage={onBridgeMessage}
        originWhitelist={['https://*', 'http://*']}
        sharedCookiesEnabled
        source={bridgeUrl ? { uri: bridgeUrl } : { html: '<html><body></body></html>' }}
        thirdPartyCookiesEnabled
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
