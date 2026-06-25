import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LEGAL_URLS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';
import { HELPER_LOGIN_BLOCKED_CODE } from '../../services/authService';
import { colors } from '../../theme/colors';

const socialButtons = [
  { label: 'Apple', icon: 'logo-apple' },
  { label: 'Google', icon: 'logo-google' },
  { label: 'Facebook', icon: 'logo-facebook' },
];

function getSocialIconColor(iconName) {
  const name = String(iconName || '').toLowerCase();
  if (name.includes('google')) return '#ea4335';
  if (name.includes('facebook')) return '#1877f2';
  return '#000000'; // apple or default
}

export function HomeScreen({ navigate }) {
  const { login, signup } = useAuth();
  const { height } = useWindowDimensions();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isSignup = mode === 'signup';
  const title = isSignup ? 'Create Account' : 'Welcome Back!';
  const subtitle = isSignup ? 'Join our community today' : 'Sign in with your account';
  const canSubmit = isSignup
    ? name.trim() && email.trim() && password.length >= 6
    : email.trim() && password.trim();

  const openLegalUrl = (url) => Linking.openURL(url).catch(() => null);

  async function submit() {
    if (!canSubmit || busy) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (isSignup) {
        await signup({ name, email, password });
      } else {
        await login({ email, password });
      }
    } catch (nextError) {
      const fallback = isSignup ? 'Unable to create your account.' : 'Unable to sign in.';
      const blockedMessage = 'Helpers are not allowed to log in on this app. Please use the Uncedo Helpers app.';
      setError(nextError?.code === HELPER_LOGIN_BLOCKED_CODE ? blockedMessage : (nextError?.message || fallback));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setNotice('');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      {/* Dark purple/indigo background gradient effect with ambient glowing blurs */}
      <View style={styles.background} />
      <View style={styles.glow1} />
      <View style={styles.glow2} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { minHeight: height }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <View style={styles.messageError}>
                <Text style={styles.messageErrorText}>{error}</Text>
              </View>
            ) : null}
            {notice ? (
              <View style={styles.messageInfo}>
                <Text style={styles.messageInfoText}>{notice}</Text>
              </View>
            ) : null}

            {isSignup ? (
              <AuthInput
                autoCapitalize="words"
                onChangeText={setName}
                placeholder="Full Name"
                value={name}
              />
            ) : null}
            <AuthInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email Address"
              value={email}
            />
            <AuthInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder={isSignup ? 'Create Password' : 'Password'}
              secureTextEntry
              value={password}
            />

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit || busy}
              onPress={submit}
              style={[styles.primaryButton, (!canSubmit || busy) && styles.primaryButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? 'Please wait...' : isSignup ? 'Sign Up' : 'Login'}
              </Text>
            </Pressable>

            {isSignup ? (
              <View style={styles.footerLinkContainer}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => switchMode('login')}
                  style={styles.footerLinkButton}
                >
                  <Text style={styles.footerLinkText}>
                    Already have an account? <Text style={styles.footerLinkHighlight}>Log In</Text>
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.footerLinkContainer}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => switchMode('signup')}
                  style={styles.footerLinkButton}
                >
                  <Text style={styles.footerLinkText}>
                    Don't have any account? <Text style={styles.footerLinkHighlight}>Sign Up</Text>
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setNotice('Password recovery is coming soon.')}
                  style={styles.footerLinkButton}
                >
                  <Text style={styles.footerLinkText}>Forgot Password?</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.socialRow}>
            {socialButtons.map((button) => (
              <Pressable
                accessibilityRole="button"
                key={button.label}
                onPress={() => setNotice(`${button.label} sign-${isSignup ? 'up' : 'in'} is coming soon.`)}
                style={styles.socialButton}
              >
                <Ionicons
                  color={getSocialIconColor(button.icon)}
                  name={button.icon}
                  size={26}
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.legalText}>
            By continuing, you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => openLegalUrl(LEGAL_URLS.privacy)}>Privacy Policy</Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={() => openLegalUrl(LEGAL_URLS.terms)}>Terms of Use</Text>.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthInput({ style, ...props }) {
  const [secureText, setSecureText] = useState(props.secureTextEntry);
  const isPasswordField = props.secureTextEntry;

  return (
    <View style={[styles.inputWrap, style]}>
      <TextInput
        placeholderTextColor="#9ca3af"
        style={[styles.input, isPasswordField && { paddingRight: 40 }]}
        {...props}
        secureTextEntry={secureText}
      />
      {isPasswordField ? (
        <Pressable onPress={() => setSecureText(!secureText)} style={styles.eyeButton}>
          <Ionicons name={secureText ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1b0227', // Dark purple/indigo base color
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#12011b', // Very dark purple/black
  },
  glow1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#a21caf', // BrandDark glow
    opacity: 0.22,
    top: '20%',
    left: '-20%',
  },
  glow2: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#d946ef', // Brand glow
    opacity: 0.18,
    bottom: '25%',
    right: '-15%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  container: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 380,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  form: {
    gap: 16,
  },
  inputWrap: {
    width: '100%',
    height: 54,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  input: {
    flex: 1,
    color: '#18181b',
    fontSize: 16,
    fontWeight: '600',
    height: '100%',
  },
  eyeButton: {
    position: 'absolute',
    right: 18,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#ccff00', // Neon yellow/lime-green button
    borderRadius: 24,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  footerLinkContainer: {
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  footerLinkButton: {
    paddingVertical: 4,
  },
  footerLinkText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  footerLinkHighlight: {
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 24,
  },
  socialButton: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  legalText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 24,
    textAlign: 'center',
  },
  legalLink: {
    color: '#ffffff',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  messageError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.28)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageErrorText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  messageInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageInfoText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
