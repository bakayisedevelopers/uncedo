import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card } from '../../components/app/HelperUi';
import { completeWhatsAppAccountLink } from '../../services/authService';
import { colors } from '../../theme/colors';

export function WhatsAppAccountLinkScreen() {
  const [state, setState] = useState({ status: 'working', message: 'Verifying your one-time WhatsApp link…' });
  const [returnUrl, setReturnUrl] = useState('https://wa.me/27605239926');

  useEffect(() => {
    const params = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const token = String(params.get('wa_link_token') || '').trim();
    if (window.location.hash) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      setState({ status: 'error', message: 'This link is missing or invalid. Return to your Uncedo WhatsApp chat and request a fresh link.' });
      return undefined;
    }
    let active = true;
    completeWhatsAppAccountLink(token).then((result) => {
      if (!active) return;
      const destination = /^https:\/\/wa\.me\/\d{8,15}$/.test(String(result?.returnUrl || ''))
        ? String(result.returnUrl)
        : 'https://wa.me/27605239926';
      setReturnUrl(destination);
      setState({ status: 'success', message: 'Your Uncedo account is now linked to this WhatsApp chat. Returning you to WhatsApp…' });
      window.setTimeout(() => window.location.assign(destination), 1400);
    }).catch((error) => {
      if (active) setState({ status: 'error', message: error?.message || 'We could not verify this link. Return to your WhatsApp chat and request a fresh one.' });
    });
    return () => { active = false; };
  }, []);

  const openWhatsApp = () => {
    if (Platform.OS === 'web') window.location.assign(returnUrl);
    else Linking.openURL(returnUrl).catch(() => null);
  };

  return (
    <View style={styles.page}>
      <Card>
        <Text style={styles.eyebrow}>UNCEDO HELPERS</Text>
        <Text style={styles.title}>{state.status === 'success' ? 'Account connected' : state.status === 'error' ? 'Link not completed' : 'Verifying your link'}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.copy}>{state.message}</Text>
        {state.status === 'error' ? <ActionButton label="Return to Uncedo WhatsApp" onPress={openWhatsApp} /> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: 24 },
  eyebrow: { color: colors.brandDark, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 25, fontWeight: '900', marginTop: 12 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginVertical: 16 },
});
