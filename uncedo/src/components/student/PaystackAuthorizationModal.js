import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildPaystackAuthorizationHtml, getPaystackPublicKey } from '../../services/paystackService';
import { colors } from '../../theme/colors';

export function PaystackAuthorizationModal({ email, onClose, onError, onSuccess, visible }) {
  const publicKey = getPaystackPublicKey();

  function handleMessage(event) {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'success') {
        onSuccess?.(message.payload);
      } else if (message.type === 'close') {
        onClose?.();
      } else if (message.type === 'error') {
        onError?.(new Error(message.payload?.message || 'Paystack authorization failed.'));
      }
    } catch (error) {
      onError?.(error);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={styles.header}>
        <Text style={styles.title}>Add a Card</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      {publicKey ? (
        <WebView
          javaScriptEnabled
          onMessage={handleMessage}
          originWhitelist={['*']}
          source={{ html: buildPaystackAuthorizationHtml({ email, publicKey }) }}
          style={styles.webview}
        />
      ) : (
        <View style={styles.missingConfig}>
          <Text style={styles.missingTitle}>Paystack public key not configured</Text>
          <Text style={styles.missingCopy}>Set EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY and restart Expo.</Text>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  closeButton: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  webview: {
    flex: 1,
  },
  missingConfig: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  missingTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  missingCopy: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
