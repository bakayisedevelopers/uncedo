import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/colors';

function getSocialIconColor(iconName) {
  const name = String(iconName || '').toLowerCase();
  if (name.includes('google')) return '#ea4335';
  if (name.includes('facebook')) return '#1877f2';
  if (name.includes('whatsapp')) return '#25d366';
  return '#000000'; // apple or default
}

export function AuthScaffold({
  mode = 'login',
  brandName = 'Helpers',
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
      style={[styles.screen, Platform.OS === 'web' && webStyles.screen]}
    >
      <View style={[styles.background, Platform.OS === 'web' && webStyles.background]} />
      <View style={[styles.glow1, Platform.OS === 'web' && webStyles.glow1]} />
      <View style={[styles.glow2, Platform.OS === 'web' && webStyles.glow2]} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, Platform.OS === 'web' && webStyles.scrollContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, Platform.OS === 'web' && webStyles.container]}>
          <View style={[styles.header, Platform.OS === 'web' && webStyles.header]}>
            {onBack ? (
              <Pressable accessibilityRole="button" onPress={onBack} style={[styles.backButton, Platform.OS === 'web' && webStyles.backButton]}>
                <Ionicons color={Platform.OS === 'web' ? webPalette.lime : colors.brandDark} name="arrow-back-outline" size={17} />
                <Text style={[styles.backButtonText, Platform.OS === 'web' && webStyles.backButtonText]}>{backLabel}</Text>
              </Pressable>
            ) : null}
            {brandName ? <Text style={[styles.brandName, Platform.OS === 'web' && webStyles.brandName]}>{brandName}</Text> : null}
            <Text style={[styles.title, Platform.OS === 'web' && webStyles.title]}>{resolvedTitle}</Text>
            <Text style={[styles.subtitle, Platform.OS === 'web' && webStyles.subtitle]}>{resolvedSubtitle}</Text>
          </View>

          <View style={[styles.formContainer, Platform.OS === 'web' && webStyles.formContainer]}>
            {children}

            {primaryLabel ? (
              <Pressable
                accessibilityRole="button"
                disabled={primaryDisabled}
                onPress={onPrimaryPress}
                style={[styles.primaryButton, Platform.OS === 'web' && webStyles.primaryButton, primaryDisabled && styles.primaryButtonDisabled]}
              >
                <Text style={[styles.primaryButtonText, Platform.OS === 'web' && webStyles.primaryButtonText]}>{primaryLabel}</Text>
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
                      <Text style={[styles.footerLinkText, Platform.OS === 'web' && webStyles.footerLinkText]}>
                        {isModeToggle ? (
                          isSignup ? (
                            <Text>Already have an account? <Text style={[styles.footerLinkHighlight, Platform.OS === 'web' && webStyles.footerLinkHighlight]}>Log In</Text></Text>
                          ) : (
                            <Text>Don't have any account? <Text style={[styles.footerLinkHighlight, Platform.OS === 'web' && webStyles.footerLinkHighlight]}>Sign Up</Text></Text>
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
                <View style={[styles.socialRow, Platform.OS === 'web' && webStyles.socialRow]}>
                {socialButtons.map((button) => (
                  <View key={button.label} style={styles.socialChoice}>
                    <Pressable
                      accessibilityLabel={`${button.label} sign-in`}
                      accessibilityRole="button"
                      disabled={button.disabled}
                      onPress={button.onPress}
                      style={[styles.socialButton, Platform.OS === 'web' && webStyles.socialButton, button.disabled && styles.socialButtonDisabled]}
                    >
                      <Ionicons
                        color={getSocialIconColor(button.icon)}
                        name={button.icon}
                        size={26}
                      />
                    </Pressable>
                    <Text style={[styles.socialLabel, Platform.OS === 'web' && webStyles.socialLabel]}>{button.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {legalContent ? <View style={[styles.legalWrap, Platform.OS === 'web' && webStyles.legalWrap]}>{legalContent}</View> : null}
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
      {label ? <Text style={[styles.fieldLabel, Platform.OS === 'web' && webStyles.fieldLabel]}>{label}</Text> : null}
      <View style={[styles.inputContainer, Platform.OS === 'web' && webStyles.inputContainer, error ? styles.inputContainerError : null]}>
        <TextInput
          placeholderTextColor={Platform.OS === 'web' ? webPalette.muted : '#9ca3af'}
          style={[styles.fieldInput, Platform.OS === 'web' && webStyles.fieldInput, isPasswordField && { paddingRight: 40 }, style]}
          {...props}
          secureTextEntry={secureText}
        />
        {isPasswordField ? (
          <Pressable onPress={() => setSecureText(!secureText)} style={styles.eyeButton}>
            <Ionicons name={secureText ? 'eye-off-outline' : 'eye-outline'} size={20} color={Platform.OS === 'web' ? webPalette.muted : '#6b7280'} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.fieldError, Platform.OS === 'web' && webStyles.fieldError]}>{error}</Text> : null}
    </View>
  );
}

export function AuthMessage({ text, tone = 'error', inverted = false }) {
  if (!text) return null;

  const isInfo = tone === 'info';
  return (
    <View style={[styles.message, Platform.OS === 'web' && webStyles.message, isInfo ? styles.messageInfo : styles.messageError, Platform.OS === 'web' && (isInfo ? webStyles.messageInfo : webStyles.messageError)]}>
      <Text style={[styles.messageText, isInfo ? styles.messageTextInfo : styles.messageTextError, Platform.OS === 'web' && (isInfo ? webStyles.messageTextInfo : webStyles.messageTextError)]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  glow1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.brandDark,
    opacity: 0.05,
    top: '20%',
    left: '-20%',
  },
  glow2: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.brand,
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
    color: colors.brandDark,
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
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
    paddingVertical: 6,
  },
  backButtonText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  formContainer: {
    gap: 16,
  },
  primaryButton: {
    backgroundColor: colors.brand,
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
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  footerLinkHighlight: {
    fontWeight: '900',
    textDecorationLine: 'underline',
    color: colors.brandDark,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 24,
  },
  socialChoice: {
    alignItems: 'center',
    gap: 5,
  },
  socialLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
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
    borderColor: colors.border,
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
    color: colors.text,
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
    borderColor: colors.border,
  },
  inputContainerError: {
    borderWidth: 1,
    borderColor: colors.danger,
  },
  fieldInput: {
    flex: 1,
    color: colors.text,
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
    color: colors.brandDark,
    fontWeight: '700',
  },
});

const webPalette = {
  background: '#101713',
  backgroundSoft: '#17211b',
  surface: '#202d24',
  line: '#34443a',
  text: '#f4f7f1',
  muted: '#b0bdb2',
  lime: '#c8f169',
  limeDark: '#18210f',
  orange: '#ff9b62',
};

const webStyles = StyleSheet.create({
  screen: { backgroundColor: webPalette.background },
  background: { backgroundColor: webPalette.background },
  glow1: { backgroundColor: webPalette.lime, opacity: 0.08 },
  glow2: { backgroundColor: webPalette.orange, opacity: 0.045 },
  scrollContent: { paddingHorizontal: 24, paddingVertical: 48 },
  container: { maxWidth: 480 },
  header: { marginBottom: 25 },
  brandName: { color: webPalette.lime, letterSpacing: 2 },
  title: { color: webPalette.text },
  subtitle: { color: webPalette.muted, lineHeight: 22 },
  backButton: {
    backgroundColor: webPalette.backgroundSoft,
    borderColor: webPalette.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  backButtonText: { color: webPalette.lime },
  formContainer: {
    backgroundColor: webPalette.surface,
    borderColor: webPalette.line,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 8,
  },
  primaryButton: { backgroundColor: webPalette.lime, borderRadius: 15 },
  primaryButtonText: { color: webPalette.limeDark },
  footerLinkText: { color: webPalette.muted },
  footerLinkHighlight: { color: webPalette.lime },
  socialRow: { marginTop: 10 },
  socialButton: { backgroundColor: webPalette.backgroundSoft, borderColor: webPalette.line, borderRadius: 15 },
  socialLabel: { color: webPalette.muted },
  legalWrap: { marginTop: 6 },
  fieldLabel: { color: webPalette.text },
  inputContainer: {
    backgroundColor: webPalette.backgroundSoft,
    borderColor: webPalette.line,
    borderRadius: 15,
    shadowOpacity: 0,
    elevation: 0,
  },
  fieldInput: { color: webPalette.text },
  fieldError: { color: '#ff9b9b' },
  message: { borderRadius: 13 },
  messageError: { backgroundColor: 'rgba(248, 113, 113, 0.12)', borderColor: 'rgba(248, 113, 113, 0.28)' },
  messageInfo: { backgroundColor: 'rgba(200, 241, 105, 0.10)', borderColor: 'rgba(200, 241, 105, 0.25)' },
  messageTextError: { color: '#ffb4b4' },
  messageTextInfo: { color: webPalette.lime },
});
