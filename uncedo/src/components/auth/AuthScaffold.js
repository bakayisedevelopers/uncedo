import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/colors';

export const authColors = {
  background: '#fdf2f8',
  border: '#f3d9ea',
  brand: '#ec4899',
  brandDark: '#be185d',
  muted: '#7a667a',
  text: '#1f1724',
};

function getSocialIconColor(iconName) {
  const name = String(iconName || '').toLowerCase();
  if (name.includes('google')) return '#ea4335';
  if (name.includes('facebook')) return '#1877f2';
  return '#000000'; // apple or default
}

export function AuthScaffold({
  mode = 'login',
  brandName = 'Uncedo',
  title,
  subtitle = '',
  onBack,
  backLabel = 'Back',
  primaryLabel = '',
  onPrimaryPress,
  primaryDisabled = false,
  footerLinks = [],
  socialButtons = [],
  legalContent = null,
  children,
}) {
  const isSignup = mode === 'signup';
  const resolvedTitle = title || (isSignup ? 'Create Account' : 'Welcome Back!');
  const resolvedSubtitle = subtitle || (isSignup ? 'Join our community today' : 'Sign in with your account');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      {/* Dark pink/burgundy background gradient effect with ambient glowing blurs */}
      <View style={styles.background} />
      <View style={styles.glow1} />
      <View style={styles.glow2} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            {brandName ? <Text style={styles.brandName}>{brandName}</Text> : null}
            <Text style={styles.title}>{resolvedTitle}</Text>
            <Text style={styles.subtitle}>{resolvedSubtitle}</Text>
          </View>

          <View style={styles.formContainer}>
            {children}

            {primaryLabel ? (
              <Pressable
                accessibilityRole="button"
                disabled={primaryDisabled}
                onPress={onPrimaryPress}
                style={[styles.primaryButton, primaryDisabled && styles.primaryButtonDisabled]}
              >
                <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
              </Pressable>
            ) : null}

            {footerLinks.length ? (
              <View style={styles.footerLinkContainer}>
                {footerLinks.map((link) => {
                  const isModeToggle = link.label.toLowerCase().includes('sign up') || link.label.toLowerCase().includes('sign in');
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={link.label}
                      onPress={link.onPress}
                      style={styles.footerLinkButton}
                    >
                      <Text style={styles.footerLinkText}>
                        {isModeToggle ? (
                          isSignup ? (
                            <Text>Already have an account? <Text style={styles.footerLinkHighlight}>Log In</Text></Text>
                          ) : (
                            <Text>Don't have any account? <Text style={styles.footerLinkHighlight}>Sign Up</Text></Text>
                          )
                        ) : (
                          link.label
                        )}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {socialButtons.length ? (
              <View style={styles.socialRow}>
                {socialButtons.map((button) => (
                  <Pressable
                    accessibilityRole="button"
                    disabled={button.disabled}
                    key={button.label}
                    onPress={button.onPress}
                    style={[styles.socialButton, button.disabled && styles.socialButtonDisabled]}
                  >
                    <Ionicons
                      color={getSocialIconColor(button.icon)}
                      name={button.icon}
                      size={26}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {legalContent ? <View style={styles.legalWrap}>{legalContent}</View> : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthField({
  label,
  inverted = false,
  error = '',
  style,
  ...props
}) {
  const [secureText, setSecureText] = useState(props.secureTextEntry);
  const isPasswordField = props.secureTextEntry;

  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={[styles.inputContainer, error ? styles.inputContainerError : null]}>
        <TextInput
          placeholderTextColor="#9ca3af"
          style={[styles.fieldInput, isPasswordField && { paddingRight: 40 }, style]}
          {...props}
          secureTextEntry={secureText}
        />
        {isPasswordField ? (
          <Pressable onPress={() => setSecureText(!secureText)} style={styles.eyeButton}>
            <Ionicons name={secureText ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function AuthMessage({ text, tone = 'error', inverted = false }) {
  if (!text) return null;

  const isInfo = tone === 'info';
  return (
    <View style={[styles.message, isInfo ? styles.messageInfo : styles.messageError]}>
      <Text style={[styles.messageText, isInfo ? styles.messageTextInfo : styles.messageTextError]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: authColors.background,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: authColors.background,
  },
  glow1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: authColors.brandDark,
    opacity: 0.05,
    top: '20%',
    left: '-20%',
  },
  glow2: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: authColors.brand,
    opacity: 0.04,
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
  brandName: {
    color: authColors.brandDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    color: authColors.text,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: authColors.muted,
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  formContainer: {
    gap: 16,
  },
  primaryButton: {
    backgroundColor: authColors.brand,
    borderRadius: 24,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#ffffff',
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
    color: authColors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  footerLinkHighlight: {
    fontWeight: '900',
    textDecorationLine: 'underline',
    color: authColors.brandDark,
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
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: authColors.border,
  },
  socialButtonDisabled: {
    opacity: 0.55,
  },
  legalWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
  fieldWrap: {
    gap: 8,
    width: '100%',
  },
  fieldLabel: {
    color: authColors.text,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 12,
  },
  inputContainer: {
    width: '100%',
    height: 54,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: authColors.border,
  },
  inputContainerError: {
    borderWidth: 1,
    borderColor: colors.danger,
  },
  fieldInput: {
    flex: 1,
    color: authColors.text,
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
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    marginLeft: 12,
  },
  message: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  messageError: {
    backgroundColor: 'rgba(220, 38, 38, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  messageInfo: {
    backgroundColor: 'rgba(236, 72, 153, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.15)',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  messageTextError: {
    color: colors.danger,
    fontWeight: '700',
  },
  messageTextInfo: {
    color: authColors.brandDark,
    fontWeight: '700',
  },
});
