import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { AuthField, AuthMessage, AuthScaffold } from '../../components/auth/AuthScaffold';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

const LEGAL_URLS = {
  terms: 'https://uncedo.com/terms',
  privacy: 'https://uncedo.com/privacy',
};

const nativeSocialButtons = [
  { label: 'Apple', icon: 'logo-apple' },
  { label: 'Google', icon: 'logo-google' },
  { label: 'Facebook', icon: 'logo-facebook' },
  { label: 'WhatsApp', icon: 'logo-whatsapp' },
];
const webSocialButtons = [
  { label: 'Google', icon: 'logo-google' },
  { label: 'WhatsApp', icon: 'logo-whatsapp' },
];

export function ProviderLoginScreen({ initialMode = 'login', onRouteChange, onHome }) {
  const {
    authError,
    login,
    loginWithGoogle,
    signup,
    startWhatsAppAuthChallenge,
    completeWhatsAppAuthChallenge,
  } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [method, setMethod] = useState('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const openLegalUrl = (url) => Linking.openURL(url).catch(() => null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const submit = async () => {
    const trimmedEmail = String(email || '').trim();
    const trimmedPassword = String(password || '').trim();
    const trimmedName = String(name || '').trim();
    setSubmitting(true);
    setFormError('');
    setNotice('');

    try {
      if (method === 'whatsapp' && challengeId) {
        await completeWhatsAppAuthChallenge({ challengeId, code: verificationCode });
      } else if (method === 'whatsapp') {
        if (!phoneNumber.trim()) throw new Error('WhatsApp number is required.');
        if (mode === 'signup' && (!trimmedName || !trimmedEmail)) {
          throw new Error('Full name and a real email address are required for helper signup.');
        }
        const result = await startWhatsAppAuthChallenge({
          phoneNumber,
          mode,
          name: trimmedName,
          email: trimmedEmail,
        });
        setChallengeId(String(result?.challengeId || ''));
        setNotice('If this number can sign in or register, a verification code has been sent on WhatsApp.');
      } else if (!trimmedEmail || !trimmedPassword) {
        throw new Error('Email and password are required.');
      } else if (mode === 'signup' && !trimmedName) {
        throw new Error('Full name is required for helper signup.');
      } else if (mode === 'signup') {
        await signup({ name: trimmedName, email: trimmedEmail, password: trimmedPassword });
      } else {
        await login({ email: trimmedEmail, password: trimmedPassword });
      }
    } catch (error) {
      setFormError(error.message || 'Unable to continue.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialPress = async (label) => {
    setFormError('');
    setNotice('');
    if (Platform.OS === 'web' && label === 'Google') {
      setSubmitting(true);
      try {
        await loginWithGoogle();
      } catch (error) {
        setFormError(error.message || 'Unable to sign in with Google.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (label === 'WhatsApp') {
      if (process.env.EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED !== 'true') {
        setNotice('WhatsApp sign-in is awaiting Meta authentication configuration.');
        return;
      }
      setMethod('whatsapp');
      setChallengeId('');
      setVerificationCode('');
      return;
    }
    setNotice(`${label} sign-${mode === 'signup' ? 'up' : 'in'} is coming soon for Helpers.`);
  };

  const isSignup = mode === 'signup';
  const whatsappEnabled = process.env.EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED === 'true';
  const googleEnabled = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';
  const socialButtons = Platform.OS === 'web' ? webSocialButtons : nativeSocialButtons;

  return (
    <AuthScaffold
      brandName="Uncedo Helpers"
      footerLinks={[
        {
          label: isSignup ? 'Sign in' : 'Sign up',
          onPress: () => {
            const nextMode = isSignup ? 'login' : 'signup';
            setFormError('');
            setNotice('');
            setMode(nextMode);
            onRouteChange?.(nextMode === 'signup' ? '/sign-up' : '/sign-in');
          },
        },
        {
          label: isSignup ? 'Helper terms' : 'Forgot password?',
          onPress: () => {
            if (isSignup) {
              openLegalUrl(LEGAL_URLS.terms);
              return;
            }
            setNotice('Password recovery is coming soon for Helpers.');
          },
        },
      ]}
      legalContent={(
        <Text style={[styles.legalText, Platform.OS === 'web' && styles.webLegalText, isSignup && styles.legalTextSignup]}>
          By {isSignup ? 'signing up' : 'signing in'}, you agree to our{' '}
          <Text style={[styles.legalLink, Platform.OS === 'web' && styles.webLegalLink, isSignup && styles.legalLinkSignup]} onPress={() => openLegalUrl(LEGAL_URLS.privacy)}>Privacy Policy</Text>{' '}
          and{' '}
          <Text style={[styles.legalLink, Platform.OS === 'web' && styles.webLegalLink, isSignup && styles.legalLinkSignup]} onPress={() => openLegalUrl(LEGAL_URLS.terms)}>Terms of Use</Text>.
        </Text>
      )}
      onBack={onHome}
      backLabel="Helper home"
      mode={isSignup ? 'signup' : 'login'}
      onPrimaryPress={submit}
      primaryDisabled={submitting || (method === 'email' && (!email.trim() || !password.trim() || (isSignup && !name.trim()))) || (method === 'whatsapp' && (!phoneNumber.trim() || (isSignup && (!name.trim() || !email.trim())) || (Boolean(challengeId) && !verificationCode.trim())))}
      primaryLabel={submitting ? 'Please wait...' : method === 'whatsapp' ? challengeId ? 'Verify WhatsApp code' : 'Send WhatsApp code' : isSignup ? 'Sign up' : 'Sign in'}
      socialButtons={socialButtons.map((button) => ({
        ...button,
        disabled: (button.label === 'Google' && !googleEnabled) || (button.label === 'WhatsApp' && !whatsappEnabled),
        onPress: () => handleSocialPress(button.label),
      }))}
      subtitle={isSignup
        ? 'Welcome to Helpers. Create your account, complete your profile, and finish verification before accepting work.'
        : 'Welcome back to Helpers. Sign in to manage availability, offers, and active work.'}
      title={isSignup ? 'Create\nAccount' : 'Welcome\nBack'}
    >
      <View style={styles.formBlock}>
        <AuthMessage inverted={isSignup} text={formError || authError || ''} />
        <AuthMessage inverted={isSignup} text={notice} tone="info" />
        {Platform.OS === 'web' && !googleEnabled ? <Text style={[styles.whatsappNotice, styles.webNotice]}>Google sign-in is awaiting Firebase OAuth provider setup.</Text> : null}
        {isSignup ? (
          <AuthField autoCapitalize="words" inverted label="Name" onChangeText={setName} placeholder="Your full name" value={name} />
        ) : null}
        {method === 'email' ? (
          <>
            <AuthField autoCapitalize="none" inverted={isSignup} keyboardType="email-address" label="Email" onChangeText={setEmail} placeholder="name@example.com" value={email} />
            <AuthField autoCapitalize="none" inverted={isSignup} label="Password" onChangeText={setPassword} placeholder={isSignup ? 'Minimum 6 characters' : 'Enter your password'} secureTextEntry value={password} />
          </>
        ) : (
          <>
            <AuthField autoCapitalize="none" inverted={isSignup} keyboardType="phone-pad" label="WhatsApp number" onChangeText={setPhoneNumber} placeholder="+27 71 234 5678" value={phoneNumber} editable={!challengeId} />
            {isSignup ? <AuthField autoCapitalize="none" inverted keyboardType="email-address" label="Real email address" onChangeText={setEmail} placeholder="name@example.com" value={email} /> : null}
            {challengeId ? <AuthField autoCapitalize="none" inverted keyboardType="number-pad" label="WhatsApp verification code" onChangeText={setVerificationCode} placeholder="Enter code" value={verificationCode} /> : null}
            {!whatsappEnabled ? <Text style={[styles.whatsappNotice, Platform.OS === 'web' && styles.webNotice]}>WhatsApp sign-in is awaiting Meta authentication configuration.</Text> : null}
            {challengeId ? <Text accessibilityRole="button" onPress={() => { setChallengeId(''); setVerificationCode(''); }} style={[styles.switchMethod, Platform.OS === 'web' && styles.webSwitchMethod]}>Use a different number</Text> : null}
          </>
        )}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  formBlock: { gap: 16 },
  legalText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  legalTextSignup: { color: colors.muted },
  legalLink: { color: colors.brandDark, fontWeight: '800', textDecorationLine: 'underline' },
  legalLinkSignup: { color: colors.brandDark },
  whatsappNotice: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  switchMethod: { color: colors.brandDark, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  webLegalText: { color: '#b0bdb2' },
  webLegalLink: { color: '#c8f169' },
  webNotice: { color: '#ffb178' },
  webSwitchMethod: { color: '#c8f169' },
});
