import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AuthField, AuthMessage, AuthScaffold } from '../../components/auth/AuthScaffold';
import { LEGAL_URLS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';
import { HELPER_LOGIN_BLOCKED_CODE } from '../../services/authService';
import { colors } from '../../theme/colors';

const socialButtons = [
  { label: 'Apple', icon: 'logo-apple' },
  { label: 'Google', icon: 'logo-google' },
  { label: 'Facebook', icon: 'logo-facebook' },
];

export function LoginScreen({ navigate }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      await login({ email, password });
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
      onBack={() => navigate('Home')}
      onPrimaryPress={submit}
      primaryDisabled={busy || !email.trim() || !password.trim()}
      primaryLabel={busy ? 'Signing in...' : 'Sign in'}
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
        <AuthField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="name@example.com"
          value={email}
        />
        <AuthField
          autoCapitalize="none"
          label="Password"
          onChangeText={setPassword}
          placeholder="Enter your password"
          secureTextEntry
          value={password}
        />
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  formBlock: {
    gap: 16,
  },
  legalText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    color: colors.brandDark,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
