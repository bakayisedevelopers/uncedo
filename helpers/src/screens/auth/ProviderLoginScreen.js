import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export function ProviderLoginScreen() {
  const { authError, login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

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

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Uncedo Helpers</Text>
        <Text style={styles.title}>{mode === 'signup' ? 'Create helper account' : 'Log in to helpers'}</Text>
        <Text style={styles.copy}>
          Sign in with a helper account or create one now. This app only accepts helper profiles.
        </Text>

        <View style={styles.modeRow}>
          {['login', 'signup'].map((nextMode) => {
            const isActive = mode === nextMode;
            return (
              <Pressable
                key={nextMode}
                accessibilityRole="button"
                onPress={() => setMode(nextMode)}
                style={[styles.modePill, isActive && styles.modePillActive]}
              >
                <Text style={[styles.modePillLabel, isActive && styles.modePillLabelActive]}>
                  {nextMode === 'login' ? 'Login' : 'Sign up'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'signup' ? (
          <TextInput
            autoCapitalize="words"
            placeholder="Full name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={name}
            onChangeText={setName}
          />
        ) : null}

        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email address"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          autoCapitalize="none"
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        {formError ? <Text style={styles.error}>{formError}</Text> : null}
        {!formError && authError ? <Text style={styles.error}>{authError}</Text> : null}

        <Pressable accessibilityRole="button" onPress={submit} style={styles.button} disabled={submitting}>
          <Text style={styles.buttonText}>
            {submitting ? 'Please wait...' : mode === 'signup' ? 'Create helper account' : 'Log in'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: 22,
    width: '100%',
  },
  eyebrow: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modePill: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modePillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  modePillLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  modePillLabelActive: {
    color: '#ffffff',
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 18,
    opacity: 1,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
