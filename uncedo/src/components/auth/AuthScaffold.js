import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/colors';

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
  const isAccentBody = mode === 'signup';
  const isWelcome = mode === 'welcome';

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.shell}>
        <View style={styles.device}>
          <View style={[styles.hero, isAccentBody && styles.heroSignup, isWelcome && styles.heroWelcome]}>
            <View style={[styles.heroAccentTop, isAccentBody && styles.heroAccentTopSignup]} />
            <View style={[styles.heroAccentSide, isAccentBody && styles.heroAccentSideSignup]} />
            <View style={[styles.heroAccentCurve, isAccentBody && styles.heroAccentCurveSignup]} />

            {onBack ? (
              <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
                <Ionicons color="#ffffff" name="chevron-back" size={18} />
                <Text style={styles.backLabel}>{backLabel}</Text>
              </Pressable>
            ) : null}

            <View style={styles.heroCopy}>
              <Text style={styles.brandName}>{brandName}</Text>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          </View>

          <View style={[styles.body, isAccentBody && styles.bodySignup]}>
            {isAccentBody ? <View style={styles.bodyCutout} /> : null}

            <View style={styles.bodyContent}>
              {children}

              {primaryLabel ? (
                <View style={styles.primaryRow}>
                  <Text style={[styles.primaryLabel, isAccentBody && styles.primaryLabelSignup]}>
                    {primaryLabel}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={primaryDisabled}
                    onPress={onPrimaryPress}
                    style={[styles.primaryButton, primaryDisabled && styles.primaryButtonDisabled]}
                  >
                    <Ionicons color="#ffffff" name="arrow-forward" size={22} />
                  </Pressable>
                </View>
              ) : null}

              {footerLinks.length ? (
                <View style={styles.footerLinkRow}>
                  {footerLinks.map((link) => (
                    <Pressable
                      accessibilityRole="button"
                      key={link.label}
                      onPress={link.onPress}
                      style={styles.footerLinkWrap}
                    >
                      <Text style={[styles.footerLink, isAccentBody && styles.footerLinkSignup]}>
                        {link.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {socialButtons.length ? (
                <View style={styles.socialSection}>
                  <Text style={[styles.socialHeading, isAccentBody && styles.socialHeadingSignup]}>
                    Or continue with
                  </Text>
                  <View style={styles.socialRow}>
                    {socialButtons.map((button) => (
                      <Pressable
                        accessibilityRole="button"
                        disabled={button.disabled}
                        key={button.label}
                        onPress={button.onPress}
                        style={[
                          styles.socialButton,
                          isAccentBody && styles.socialButtonSignup,
                          button.disabled && styles.socialButtonDisabled,
                        ]}
                      >
                        <Ionicons
                          color={isAccentBody ? '#ffffff' : colors.text}
                          name={button.icon}
                          size={18}
                        />
                        <Text style={[styles.socialLabel, isAccentBody && styles.socialLabelSignup]}>
                          {button.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {legalContent ? <View style={styles.legalWrap}>{legalContent}</View> : null}
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export function AuthField({
  label,
  inverted = false,
  error = '',
  style,
  ...props
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, inverted && styles.fieldLabelSignup]}>{label}</Text>
      <TextInput
        placeholderTextColor={inverted ? 'rgba(255,255,255,0.78)' : colors.muted}
        style={[
          styles.fieldInput,
          inverted ? styles.fieldInputSignup : styles.fieldInputLight,
          error ? styles.fieldInputError : null,
          style,
        ]}
        {...props}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function AuthMessage({ text, tone = 'error', inverted = false }) {
  if (!text) return null;

  const isInfo = tone === 'info';
  return (
    <View
      style={[
        styles.message,
        isInfo ? styles.messageInfo : styles.messageError,
        inverted && (isInfo ? styles.messageInfoSignup : styles.messageErrorSignup),
      ]}
    >
      <Text
        style={[
          styles.messageText,
          isInfo ? styles.messageTextInfo : styles.messageTextError,
          inverted && styles.messageTextSignup,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f7f1f8',
  },
  shell: {
    alignItems: 'center',
  },
  device: {
    backgroundColor: '#ffffff',
    borderRadius: 34,
    minHeight: 760,
    maxWidth: 430,
    overflow: 'hidden',
    width: '100%',
    shadowColor: 'rgba(15,23,42,0.18)',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 16,
  },
  hero: {
    backgroundColor: '#313745',
    minHeight: 286,
    overflow: 'hidden',
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 44,
  },
  heroWelcome: {
    minHeight: 318,
  },
  heroSignup: {
    minHeight: 262,
  },
  heroAccentTop: {
    backgroundColor: '#f9a63d',
    borderBottomRightRadius: 76,
    height: 138,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 122,
  },
  heroAccentTopSignup: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomRightRadius: 96,
    height: 126,
    width: 118,
  },
  heroAccentSide: {
    backgroundColor: colors.brand,
    borderTopLeftRadius: 128,
    borderBottomLeftRadius: 128,
    bottom: -12,
    height: 248,
    position: 'absolute',
    right: -54,
    width: 182,
  },
  heroAccentSideSignup: {
    bottom: -92,
    height: 246,
    right: -44,
    width: 224,
  },
  heroAccentCurve: {
    backgroundColor: '#313745',
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 128,
    borderTopRightRadius: 120,
    height: 238,
    left: 42,
    position: 'absolute',
    top: -12,
    width: 230,
  },
  heroAccentCurveSignup: {
    borderBottomRightRadius: 160,
    height: 244,
    left: 0,
    top: 0,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    zIndex: 2,
  },
  backLabel: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '700',
  },
  heroCopy: {
    gap: 10,
    marginTop: 48,
    maxWidth: 240,
    zIndex: 2,
  },
  brandName: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 46,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    lineHeight: 22,
  },
  body: {
    backgroundColor: '#ffffff',
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 30,
    paddingBottom: 26,
  },
  bodySignup: {
    backgroundColor: colors.brand,
  },
  bodyCutout: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 120,
    bottom: -36,
    height: 198,
    position: 'absolute',
    right: -46,
    width: 198,
  },
  bodyContent: {
    gap: 18,
    zIndex: 2,
  },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    color: '#444857',
    fontSize: 13,
    fontWeight: '700',
  },
  fieldLabelSignup: {
    color: 'rgba(255,255,255,0.92)',
  },
  fieldInput: {
    fontSize: 17,
    minHeight: 42,
    paddingBottom: 10,
  },
  fieldInputLight: {
    borderBottomColor: '#e7e5e4',
    borderBottomWidth: 1,
    color: colors.text,
  },
  fieldInputSignup: {
    borderBottomColor: 'rgba(255,255,255,0.35)',
    borderBottomWidth: 1,
    color: '#ffffff',
  },
  fieldInputError: {
    borderBottomColor: '#fecaca',
  },
  fieldError: {
    color: '#be123c',
    fontSize: 12,
    fontWeight: '700',
  },
  message: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageError: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
  },
  messageInfo: {
    backgroundColor: '#faf5ff',
    borderColor: '#f0abfc',
    borderWidth: 1,
  },
  messageErrorSignup: {
    backgroundColor: 'rgba(255,241,242,0.14)',
    borderColor: 'rgba(254,205,211,0.28)',
  },
  messageInfoSignup: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
  },
  messageTextError: {
    color: '#be123c',
    fontWeight: '700',
  },
  messageTextInfo: {
    color: colors.brandDark,
    fontWeight: '700',
  },
  messageTextSignup: {
    color: '#ffffff',
  },
  primaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  primaryLabel: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  primaryLabelSignup: {
    color: '#ffffff',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#313745',
    borderRadius: 999,
    height: 66,
    justifyContent: 'center',
    width: 66,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  footerLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerLinkWrap: {
    flex: 1,
  },
  footerLink: {
    color: '#444857',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footerLinkSignup: {
    color: 'rgba(255,255,255,0.9)',
  },
  socialSection: {
    gap: 12,
    marginTop: 6,
  },
  socialHeading: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  socialHeadingSignup: {
    color: 'rgba(255,255,255,0.84)',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
  },
  socialButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#ebe5ec',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  socialButtonSignup: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  socialButtonDisabled: {
    opacity: 0.55,
  },
  socialLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  socialLabelSignup: {
    color: '#ffffff',
  },
  legalWrap: {
    marginTop: 6,
  },
});
