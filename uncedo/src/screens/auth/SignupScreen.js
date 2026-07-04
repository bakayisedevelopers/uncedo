import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AuthField, AuthMessage, AuthScaffold } from '../../components/auth/AuthScaffold';
import { LEGAL_URLS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';

const socialButtons = [
  { label: 'Apple', icon: 'logo-apple' },
  { label: 'Google', icon: 'logo-google' },
  { label: 'Facebook', icon: 'logo-facebook' },
];

export function SignupScreen({ navigate }) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openLegalUrl = (url) => Linking.openURL(url).catch(() => null);

  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await signup({ name, email, password });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  const handleSocialPress = async (label) => {
    setError('');

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
      onBack={() => navigate('Home')}
      onPrimaryPress={submit}
      primaryDisabled={busy || !name.trim() || !email.trim() || password.length < 6}
      primaryLabel={busy ? 'Creating account...' : 'Sign up'}
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
        <AuthField
          autoCapitalize="words"
          inverted
          label="Name"
          onChangeText={setName}
          placeholder="Your full name"
          value={name}
        />
        <AuthField
          autoCapitalize="none"
          inverted
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="name@example.com"
          value={email}
        />
        <AuthField
          autoCapitalize="none"
          inverted
          label="Password"
          onChangeText={setPassword}
          placeholder="Minimum 6 characters"
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
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    color: '#ffffff',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
