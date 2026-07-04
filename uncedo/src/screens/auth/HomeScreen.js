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

export function HomeScreen() {
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
  const title = isSignup ? 'Create account' : 'Welcome';
  const subtitle = isSignup
    ? 'Welcome to Uncedo. Create your account and request trusted local help when you need it.'
    : 'Sign in to continue your requests, quotes, and service updates.';
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
      <View style={styles.sky} />
      <View style={[styles.waveBack, { top: Math.max(360, height * 0.48) }]} />
      <View style={[styles.waveMid, { top: Math.max(430, height * 0.57) }]} />
      <View style={[styles.waveFront, { top: Math.max(560, height * 0.74) }]} />

      <ScrollView
        contentContainerStyle={[styles.content, { minHeight: height }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandWrap}>
          <Text style={styles.brand}>Uncedo</Text>
          <Text style={styles.brandCopy}>Customer app</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelGlow} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.modeSwitch}>
            <Pressable
              accessibilityRole="button"
              onPress={() => switchMode('login')}
              style={[styles.modeButton, !isSignup && styles.modeButtonActive]}
            >
              <Text style={[styles.modeLabel, !isSignup && styles.modeLabelActive]}>Login</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => switchMode('signup')}
              style={[styles.modeButton, isSignup && styles.modeButtonActive]}
            >
              <Text style={[styles.modeLabel, isSignup && styles.modeLabelActive]}>Sign up</Text>
            </Pressable>
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
                icon="person-outline"
                onChangeText={setName}
                placeholder="Full name"
                value={name}
              />
            ) : null}
            <AuthInput
              autoCapitalize="none"
              icon="mail-outline"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email address"
              value={email}
            />
            <AuthInput
              autoCapitalize="none"
              icon="lock-closed-outline"
              onChangeText={setPassword}
              placeholder={isSignup ? 'Password, minimum 6 characters' : 'Password'}
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
                {busy ? (isSignup ? 'Creating account...' : 'Signing in...') : (isSignup ? 'Create account' : 'Login')}
              </Text>
              <Ionicons color="#ffffff" name="arrow-forward" size={18} />
            </Pressable>

            {!isSignup ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setNotice('Password recovery is coming soon.')}
                style={styles.forgotButton}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.socialSection}>
            <Text style={styles.socialHeading}>Continue with</Text>
            <View style={styles.socialRow}>
              {socialButtons.map((button) => (
                <Pressable
                  accessibilityRole="button"
                  key={button.label}
                  onPress={() => null}
                  style={styles.socialButton}
                >
                  <Ionicons color="#ffffff" name={button.icon} size={18} />
                  <Text style={styles.socialLabel}>{button.label}</Text>
                </Pressable>
              ))}
            </View>
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

function AuthInput({ icon, style, ...props }) {
  return (
    <View style={[styles.inputWrap, style]}>
      <Ionicons color="rgba(255,255,255,0.78)" name={icon} size={18} />
      <TextInput
        placeholderTextColor="rgba(255,255,255,0.74)"
        style={styles.input}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#3520a8',
    flex: 1,
  },
  sky: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#3520a8',
  },
  waveBack: {
    backgroundColor: 'rgba(244,63,184,0.78)',
    borderTopLeftRadius: 220,
    borderTopRightRadius: 260,
    height: 360,
    left: -120,
    position: 'absolute',
    right: -80,
    transform: [{ rotate: '-7deg' }],
  },
  waveMid: {
    backgroundColor: 'rgba(168,85,247,0.82)',
    borderTopLeftRadius: 280,
    borderTopRightRadius: 190,
    height: 330,
    left: -160,
    position: 'absolute',
    right: -180,
    transform: [{ rotate: '8deg' }],
  },
  waveFront: {
    backgroundColor: 'rgba(236,72,153,0.86)',
    borderTopLeftRadius: 260,
    borderTopRightRadius: 220,
    height: 280,
    left: -110,
    position: 'absolute',
    right: -130,
    transform: [{ rotate: '5deg' }],
  },
  content: {
    justifyContent: 'center',
    padding: 20,
    paddingBottom: 30,
    paddingTop: 32,
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  brand: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  brandCopy: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  panel: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderColor: 'rgba(255,255,255,0.26)',
    borderRadius: 38,
    borderWidth: 1,
    maxWidth: 430,
    minHeight: 660,
    overflow: 'hidden',
    padding: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.25,
    shadowRadius: 34,
    width: '100%',
    elevation: 18,
  },
  panelGlow: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 220,
    height: 250,
    left: -40,
    position: 'absolute',
    right: -40,
    top: -80,
  },
  title: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
    marginTop: 28,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  modeSwitch: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 28,
    padding: 5,
  },
  modeButton: {
    borderRadius: 999,
    minWidth: 112,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
  },
  modeLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  modeLabelActive: {
    color: colors.brandDark,
  },
  form: {
    gap: 14,
    marginTop: 30,
  },
  inputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.74)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 18,
    shadowColor: '#1e1b4b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  input: {
    color: '#ffffff',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    minHeight: 52,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.brandDark,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
    minWidth: 188,
    paddingHorizontal: 24,
  },
  primaryButtonDisabled: {
    opacity: 0.58,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  forgotButton: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  forgotText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  socialSection: {
    marginTop: 24,
  },
  socialHeading: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  socialButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  socialLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  legalText: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    textAlign: 'center',
  },
  legalLink: {
    color: '#ffffff',
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  messageError: {
    backgroundColor: 'rgba(255,241,242,0.16)',
    borderColor: 'rgba(254,205,211,0.32)',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageErrorText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  messageInfo: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageInfoText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
});
