import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import { ErrorState } from '../../components/ui/States';
import { LEGAL_URLS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';
import { TUTOR_LOGIN_BLOCKED_CODE } from '../../services/authService';
import { colors } from '../../theme/colors';

export function LoginScreen({ navigate }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tutorBlocked, setTutorBlocked] = useState(false);
  const openLegalUrl = (url) => Linking.openURL(url).catch(() => null);

  async function submit() {
    setBusy(true);
    setError('');
    setTutorBlocked(false);
    try {
      await login({ email, password });
    } catch (nextError) {
      if (nextError?.code === TUTOR_LOGIN_BLOCKED_CODE) {
        setTutorBlocked(true);
      }
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.glowLeft} />
      <View style={styles.glowRight} />
      <View style={styles.header}>
        <Pressable onPress={() => navigate('Home')} style={styles.backLink}>
          <Text style={styles.backText}>← Back to home</Text>
        </Pressable>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Don&apos;t have an account? <Text style={styles.link} onPress={() => navigate('Signup')}>Create a customer account</Text>
        </Text>
      </View>
      <Card style={styles.form}>
        {tutorBlocked ? (
          <>
            <ErrorState title="Provider Login Not Allowed" message={error || 'Providers should use the Uncedo Helpers app.'} />
            <Button variant="secondary" onPress={() => navigate('Home')}>
              Go Back
            </Button>
          </>
        ) : (
          <>
            {error ? <ErrorState title="Sign in failed" message={error} /> : null}
            <FormField label="Email address" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="name@company.com" />
            <FormField label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
            <View style={styles.utilityRow}>
              <Text style={styles.muted}>Remember me</Text>
              <Text style={styles.link}>Forgot password?</Text>
            </View>
            <Text style={styles.policy}>
              By signing in, you agree to Uncedo&apos;s{' '}
              <Text style={styles.policyLink} onPress={() => openLegalUrl(LEGAL_URLS.terms)}>Terms of Service</Text>,{' '}
              <Text style={styles.policyLink} onPress={() => openLegalUrl(LEGAL_URLS.privacy)}>Privacy Policy</Text>,{' '}
              <Text style={styles.policyLink} onPress={() => openLegalUrl(LEGAL_URLS.payment)}>Payment Policy</Text>,{' '}
              <Text style={styles.policyLink} onPress={() => openLegalUrl(LEGAL_URLS.refund)}>Refund Policy</Text>, and{' '}
              <Text style={styles.policyLink} onPress={() => openLegalUrl(LEGAL_URLS.dataVoice)}>Data and Voice Policy</Text>.
            </Text>
            <Button disabled={busy || !email || !password} onPress={submit}>
              {busy ? 'Signing in...' : 'Sign in'}
            </Button>
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#f4f4f5',
    flex: 1,
    gap: 20,
    justifyContent: 'center',
    padding: 16,
  },
  glowLeft: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 160,
    height: 230,
    left: -94,
    position: 'absolute',
    top: 0,
    width: 230,
  },
  glowRight: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 160,
    bottom: 0,
    height: 230,
    position: 'absolute',
    right: -94,
    width: 230,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  backLink: {
    marginBottom: 16,
  },
  backText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  link: {
    color: colors.brand,
    fontWeight: '900',
  },
  form: {
    borderColor: 'rgba(16,185,129,0.2)',
    borderRadius: 32,
    gap: 16,
    padding: 24,
  },
  utilityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
  },
  policy: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderColor: 'rgba(16,185,129,0.2)',
    borderRadius: 16,
    borderWidth: 1,
    color: '#3f3f46',
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  policyLink: {
    color: colors.brandDark,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
