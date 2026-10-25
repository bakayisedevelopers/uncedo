import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AuthField, AuthMessage, AuthScaffold, authColors } from '../../components/auth/AuthScaffold';
import { LEGAL_URLS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';
import { HELPER_LOGIN_BLOCKED_CODE } from '../../services/authService';

const socialButtons = [
  { label: 'Google', icon: 'logo-google' },
  { label: 'WhatsApp', icon: 'logo-whatsapp' },
];

export function LoginScreen({ navigate }) {
  const { login, loginWithGoogle, startWhatsAppAuthChallenge, completeWhatsAppAuthChallenge } = useAuth();
  const [method, setMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [helperBlocked, setHelperBlocked] = useState(false);
  const openLegalUrl = (url) => Linking.openURL(url).catch(() => null);

  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    setHelperBlocked(false);
    try {
      if (method === 'whatsapp' && challengeId) {
        await completeWhatsAppAuthChallenge({ challengeId, code: verificationCode });
      } else if (method === 'whatsapp') {
        const result = await startWhatsAppAuthChallenge({ phoneNumber, mode: 'login' });
        setChallengeId(String(result?.challengeId || ''));
        setNotice('If this number can sign in, a verification code has been sent on WhatsApp.');
      } else {
        await login({ email, password });
      }
    } catch (nextError) {
      if (nextError?.code === HELPER_LOGIN_BLOCKED_CODE) {
        setHelperBlocked(true);
      }
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  const handleSocialPress = async (label) => {
    setError('');
    setHelperBlocked(false);

    if (label === 'WhatsApp') {
      setMethod('whatsapp');
      setChallengeId('');
      setVerificationCode('');
      return;
    }
    if (label === 'Google') {
      setBusy(true);
      try { await loginWithGoogle(); } catch (nextError) { setError(nextError.message || 'Unable to sign in with Google.'); } finally { setBusy(false); }
      return;
    }
    setNotice(`${label} sign-in is coming soon.`);
  };

  const activeMessage = helperBlocked
    ? error || 'Helpers are not allowed to log in on this app. Please use the Uncedo Helpers app.'
    : error;

  return (
    <AuthScaffold
      brandName="Uncedo"
      footerLinks={[
        { label: 'Sign up', onPress: () => navigate('Signup') },
        { label: 'Forgot password?', onPress: () => setNotice('Password recovery is coming soon.') },
      ]}
      legalContent={(
        <Text style={styles.legalText}>
          By signing in, you agree to our{' '}
          <Text style={styles.legalLink} onPress={() => openLegalUrl(LEGAL_URLS.privacy)}>Privacy Policy</Text>{' '}
          and{' '}
          <Text style={styles.legalLink} onPress={() => openLegalUrl(LEGAL_URLS.terms)}>Terms of Use</Text>.
        </Text>
      )}
      mode="login"
      onPrimaryPress={submit}
      primaryDisabled={busy || (method === 'email' ? (!email.trim() || !password.trim()) : (!phoneNumber.trim() || (Boolean(challengeId) && !verificationCode.trim())))}
      primaryLabel={busy ? 'Please wait...' : method === 'whatsapp' ? challengeId ? 'Verify WhatsApp code' : 'Send WhatsApp code' : 'Sign in'}
      socialButtons={socialButtons.map((button) => ({
        ...button,
        onPress: () => {
          handleSocialPress(button.label);
        },
      }))}
      subtitle="Welcome back to Uncedo. Sign in to continue your requests and manage your account."
      title={'Welcome\nBack'}
    >
      <View style={styles.formBlock}>
        <AuthMessage text={activeMessage} />
        <AuthMessage text={notice} tone="info" />
        {method === 'email' ? <>
          <AuthField autoCapitalize="none" keyboardType="email-address" label="Email" onChangeText={setEmail} placeholder="name@example.com" value={email} />
          <AuthField autoCapitalize="none" label="Password" onChangeText={setPassword} placeholder="Enter your password" secureTextEntry value={password} />
        </> : <>
          <AuthField autoCapitalize="none" keyboardType="phone-pad" label="WhatsApp number" onChangeText={setPhoneNumber} placeholder="+27 71 234 5678" value={phoneNumber} editable={!challengeId} />
          {challengeId ? <AuthField autoCapitalize="none" keyboardType="number-pad" label="WhatsApp verification code" onChangeText={setVerificationCode} placeholder="Enter code" value={verificationCode} /> : null}
          {process.env.EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED !== 'true' ? <Text style={styles.notice}>WhatsApp sign-in is awaiting Meta authentication configuration.</Text> : null}
        </>}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  formBlock: {
    gap: 16,
  },
  notice: { color: authColors.muted, fontSize: 12, lineHeight: 18 },
  legalText: {
    color: authColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    color: authColors.brandDark,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
