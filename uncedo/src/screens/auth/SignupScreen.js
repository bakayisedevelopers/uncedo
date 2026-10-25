import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AuthField, AuthMessage, AuthScaffold, authColors } from '../../components/auth/AuthScaffold';
import { LEGAL_URLS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';

const socialButtons = [
  { label: 'Google', icon: 'logo-google' },
  { label: 'WhatsApp', icon: 'logo-whatsapp' },
];

export function SignupScreen({ navigate }) {
  const { signup, loginWithGoogle, startWhatsAppAuthChallenge, completeWhatsAppAuthChallenge } = useAuth();
  const [method, setMethod] = useState('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openLegalUrl = (url) => Linking.openURL(url).catch(() => null);

  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (method === 'whatsapp' && challengeId) {
        await completeWhatsAppAuthChallenge({ challengeId, code: verificationCode });
      } else if (method === 'whatsapp') {
        const result = await startWhatsAppAuthChallenge({ phoneNumber, mode: 'signup', name, email });
        setChallengeId(String(result?.challengeId || ''));
        setNotice('If this number and email can register, a verification code has been sent on WhatsApp.');
      } else {
        await signup({ name, email, password });
      }
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  const handleSocialPress = async (label) => {
    setError('');
    if (label === 'WhatsApp') {
      setMethod('whatsapp');
      setChallengeId('');
      setVerificationCode('');
      return;
    }
    if (label === 'Google') {
      setBusy(true);
      try { await loginWithGoogle(); } catch (nextError) { setError(nextError.message || 'Unable to continue with Google.'); } finally { setBusy(false); }
      return;
    }
    setNotice(`${label} sign-up is coming soon.`);
  };

  return (
    <AuthScaffold
      brandName="Uncedo"
      footerLinks={[
        { label: 'Sign in', onPress: () => navigate('Login') },
        { label: 'Need help?', onPress: () => setNotice('Customer support onboarding is coming soon.') },
      ]}
      legalContent={(
        <Text style={styles.legalText}>
          By signing up, you agree to our{' '}
          <Text style={styles.legalLink} onPress={() => openLegalUrl(LEGAL_URLS.privacy)}>Privacy Policy</Text>{' '}
          and{' '}
          <Text style={styles.legalLink} onPress={() => openLegalUrl(LEGAL_URLS.terms)}>Terms of Use</Text>.
        </Text>
      )}
      mode="signup"
      onPrimaryPress={submit}
      primaryDisabled={busy || (method === 'email'
        ? (!name.trim() || !email.trim() || password.length < 6)
        : (!name.trim() || !email.trim() || !phoneNumber.trim() || (Boolean(challengeId) && !verificationCode.trim())))}
      primaryLabel={busy ? 'Please wait...' : method === 'whatsapp' ? challengeId ? 'Verify and create account' : 'Send WhatsApp code' : 'Sign up'}
      socialButtons={socialButtons.map((button) => ({
        ...button,
        onPress: () => {
          handleSocialPress(button.label);
        },
      }))}
      subtitle="Welcome to Uncedo. Create your account to request help, upload details, and get matched faster."
      title={'Create\nAccount'}
    >
      <View style={styles.formBlock}>
        <AuthMessage inverted text={error} />
        <AuthMessage inverted text={notice} tone="info" />
        <AuthField autoCapitalize="words" inverted label="Name" onChangeText={setName} placeholder="Your full name" value={name} />
        <AuthField autoCapitalize="none" inverted keyboardType="email-address" label="Real email address" onChangeText={setEmail} placeholder="name@example.com" value={email} />
        {method === 'email' ? <AuthField autoCapitalize="none" inverted label="Password" onChangeText={setPassword} placeholder="Minimum 6 characters" secureTextEntry value={password} /> : <>
          <AuthField autoCapitalize="none" inverted keyboardType="phone-pad" label="WhatsApp number" onChangeText={setPhoneNumber} placeholder="+27 71 234 5678" value={phoneNumber} editable={!challengeId} />
          {challengeId ? <AuthField autoCapitalize="none" inverted keyboardType="number-pad" label="WhatsApp verification code" onChangeText={setVerificationCode} placeholder="Enter code" value={verificationCode} /> : null}
          {process.env.EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED !== 'true' ? <Text style={styles.notice}>WhatsApp sign-up is awaiting Meta authentication configuration.</Text> : null}
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
