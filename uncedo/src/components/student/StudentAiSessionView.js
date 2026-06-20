import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { FIREBASE_PUBLIC_CONFIG, USE_FIREBASE_EMULATORS, WEB_APP_BASE_URL } from '../../constants/runtimeConfig';
import { getFunctionEndpoint } from '../../firebase/config';

export function StudentAiSessionView({ authHandoff, onBridgeMessage, sessionId }) {
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
        } catch (_error) {
          // no-op
        }
      })();
      true;
    `;
  }, [authHandoff]);

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
          onBridgeMessage?.({
            nativeEvent: {
              data: JSON.stringify({
                type: 'ai_state',
                payload: {
                  networkError: event?.nativeEvent?.description || 'Unable to load AI session room.',
                },
              }),
            },
          });
        }}
        source={{ uri: sessionUrl }}
        injectedJavaScriptBeforeContentLoaded={injectedAuthBootstrap}
        onMessage={onBridgeMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },
});
