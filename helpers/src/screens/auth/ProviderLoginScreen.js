import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AuthField, AuthMessage, AuthScaffold } from '../../components/auth/AuthScaffold';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

const LEGAL_URLS = {
  terms: 'https://uncedo.com/terms',
  privacy: 'https://uncedo.com/privacy',
};

const socialButtons = [
  { label: 'Apple', icon: 'logo-apple' },
  { label: 'Google', icon: 'logo-google' },
  { label: 'Facebook', icon: 'logo-facebook' },
];

export function ProviderLoginScreen() {
  const { authError, login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const openLegalUrl = (url) => Linking.openURL(url).catch(() => null);

  const submit = async () => {
    const trimmedEmail = String(email || '').trim();
    const trimmedPassword = String(password || '').trim();
    const trimmedName = String(name || '').trim();

    if (!trimmedEmail || !trimmedPassword) {
      setFormError('Email and password are required.');
      return;
    }

    if (mode === 'signup' && !trimmedName) {
      setFormError('Full name is required for helper signup.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setNotice('');

    try {
      if (mode === 'signup') {
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

  const handleSocialPress = (label) => {
    setFormError('');
    setNotice(`${label} sign-${mode === 'signup' ? 'up' : 'in'} is coming soon for Helpers.`);
  };

  const isSignup = mode === 'signup';

  return (
    <AuthScaffold
      brandName="Uncedo Helpers"
      footerLinks={[
        {
          label: isSignup ? 'Sign in' : 'Sign up',
          onPress: () => {
            setFormError('');
            setNotice('');
            setMode(isSignup ? 'login' : 'signup');
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
        <Text style={[styles.legalText, isSignup && styles.legalTextSignup]}>
          By {isSignup ? 'signing up' : 'signing in'}, you agree to our{' '}
          <Text
            style={[styles.legalLink, isSignup && styles.legalLinkSignup]}
            onPress={() => openLegalUrl(LEGAL_URLS.privacy)}
          >
            Privacy Policy
          </Text>{' '}
          and{' '}
          <Text
            style={[styles.legalLink, isSignup && styles.legalLinkSignup]}
            onPress={() => openLegalUrl(LEGAL_URLS.terms)}
          >
            Terms of Use
          </Text>.
        </Text>
      )}
      mode={isSignup ? 'signup' : 'login'}
      onPrimaryPress={submit}
      primaryDisabled={submitting || !email.trim() || !password.trim() || (isSignup && !name.trim())}
      primaryLabel={submitting ? 'Please wait...' : isSignup ? 'Sign up' : 'Sign in'}
      socialButtons={socialButtons.map((button) => ({
        ...button,
        onPress: () => handleSocialPress(button.label),
      }))}
      subtitle={
        isSignup
          ? 'Welcome to Helpers. Create your account, complete your profile, and start taking jobs.'
          : 'Welcome back to Helpers. Sign in to manage availability, offers, and active work.'
      }
      title={isSignup ? 'Create\nAccount' : 'Welcome\nBack'}
    >
      <View style={styles.formBlock}>
        <AuthMessage inverted={isSignup} text={formError || authError || ''} />
        <AuthMessage inverted={isSignup} text={notice} tone="info" />
        {isSignup ? (
          <AuthField
            autoCapitalize="words"
            inverted
            label="Name"
            onChangeText={setName}
            placeholder="Your full name"
            value={name}
          />
        ) : null}
        <AuthField
          autoCapitalize="none"
          inverted={isSignup}
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="name@example.com"
          value={email}
        />
        <AuthField
          autoCapitalize="none"
          inverted={isSignup}
          label="Password"
          onChangeText={setPassword}
          placeholder={isSignup ? 'Minimum 6 characters' : 'Enter your password'}
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
  legalTextSignup: {
    color: colors.muted,
  },
  legalLink: {
    color: colors.brandDark,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  legalLinkSignup: {
    color: colors.brandDark,
  },
});
