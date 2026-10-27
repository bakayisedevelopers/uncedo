import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import {
  acceptWhatsAppHelperAgreement,
  formatAgreementDate,
  getHelperAgreementBundle,
  getHelperAgreementPdfUrl,
  getWhatsAppHelperAgreementSession,
} from '../../services/legalAgreementService';
import { colors } from '../../theme/colors';

function formatTimestamp(value) {
  if (!value) return 'Not available';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

function normalizeMarkdownLine(line = '') {
  return String(line || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();
}

function renderAgreementMarkdown(markdown = '') {
  return String(markdown || '')
    .split('\n')
    .map((rawLine) => rawLine.trimEnd())
    .filter((line, index, array) => {
      if (line.trim()) return true;
      return Boolean(array[index - 1]?.trim());
    })
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return <View key={`space-${index}`} style={styles.paragraphGap} />;
      }

      if (trimmed.startsWith('# ')) {
        return <Text key={`h1-${index}`} style={styles.contractHeading}>{normalizeMarkdownLine(trimmed.slice(2))}</Text>;
      }

      if (trimmed.startsWith('## ')) {
        return <Text key={`h2-${index}`} style={styles.contractSubheading}>{normalizeMarkdownLine(trimmed.slice(3))}</Text>;
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (
          <View key={`bullet-${index}`} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>-</Text>
            <Text style={styles.contractBullet}>{normalizeMarkdownLine(trimmed.slice(2))}</Text>
          </View>
        );
      }

      return <Text key={`p-${index}`} style={styles.contractParagraph}>{normalizeMarkdownLine(trimmed)}</Text>;
    });
}

export function AgreementScreen({ goBack, route }) {
  const { logout } = useAuth();
  const { profile, actions, saving, saveError } = useHelpersApp();
  const isWhatsAppAgreementFlow = Boolean(route?.params?.whatsappAgreementFlow);
  const whatsappAgreementToken = String(route?.params?.whatsappAgreementToken || '').trim();
  const [bundle, setBundle] = useState({ activeVersion: null, document: null, versions: [], acceptances: [] });
  const [whatsappSession, setWhatsAppSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [checkboxAccepted, setCheckboxAccepted] = useState(false);
  const [typedSignatureName, setTypedSignatureName] = useState(profile.fullName || profile.displayName || profile.email || '');

  const activeVersion = bundle.activeVersion || null;
  const versions = Array.isArray(bundle.versions) ? bundle.versions : [];
  const acceptances = Array.isArray(bundle.acceptances) ? bundle.acceptances : [];
  const currentAcceptance = acceptances[0] || null;
  const latestPdfUrl = useMemo(() => (
    getHelperAgreementPdfUrl({
      acceptance: currentAcceptance,
      versionRecord: activeVersion,
    }) || String(profile?.agreement?.latestAcceptancePdfUrl || '').trim()
  ), [activeVersion, currentAcceptance, profile?.agreement?.latestAcceptancePdfUrl]);
  const hasSignedPdf = Boolean(latestPdfUrl);
  const hasSignedActiveVersion = Boolean(
    activeVersion?.version && (isWhatsAppAgreementFlow
      ? whatsappSession?.accepted === true
      : (
        profile?.agreement?.acceptedVersion === activeVersion.version
        || currentAcceptance?.version === activeVersion.version
      )),
  );
  const isCurrent = Boolean(
    activeVersion?.version && (isWhatsAppAgreementFlow
      ? whatsappSession?.accepted === true
      : profile?.agreement?.acceptedVersion === activeVersion.version
        && (
        profile?.agreement?.currentVersionAccepted === true
        || profile?.agreement?.acceptedCurrentVersion === true
        || hasSignedActiveVersion
        )),
  );
  const canSubmit = Boolean(activeVersion && checkboxAccepted && String(typedSignatureName || '').trim() && !hasSignedActiveVersion);

  const statusTone = useMemo(() => (isCurrent ? 'success' : 'warning'), [isCurrent]);
  const historyPdfUrls = useMemo(() => {
    const byVersion = new Map(
      versions.map((item) => [String(item?.version || '').trim(), item]),
    );

    return acceptances.reduce((result, acceptance) => {
      const versionKey = String(acceptance?.version || '').trim();
      const pdfUrl = getHelperAgreementPdfUrl({
        acceptance,
        versionRecord: byVersion.get(versionKey) || null,
      });

      if (pdfUrl) {
        result[String(acceptance.id || versionKey)] = pdfUrl;
      }
      return result;
    }, {});
  }, [acceptances, versions]);

  useEffect(() => {
    setTypedSignatureName(profile.fullName || profile.displayName || profile.email || '');
  }, [profile.displayName, profile.email, profile.fullName]);

  useEffect(() => {
    if (hasSignedActiveVersion) {
      setCheckboxAccepted(true);
    }
  }, [hasSignedActiveVersion]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        if (isWhatsAppAgreementFlow) {
          if (!whatsappAgreementToken) {
            throw new Error('This WhatsApp agreement link is missing or invalid. Request a new link in your WhatsApp chat.');
          }
          const session = await getWhatsAppHelperAgreementSession(whatsappAgreementToken);
          if (!cancelled) {
            setWhatsAppSession(session);
            setBundle({
              activeVersion: session?.activeVersion || null,
              document: null,
              versions: [],
              acceptances: [],
            });
            setTypedSignatureName(profile.fullName || profile.displayName || profile.email || '');
            setCheckboxAccepted(session?.accepted === true);
            setMessage('');
          }
          return;
        }

        const result = await getHelperAgreementBundle();
        if (!cancelled) {
          setBundle({
            activeVersion: result?.activeVersion || null,
            document: result?.document || null,
            versions: Array.isArray(result?.versions) ? result.versions : [],
            acceptances: Array.isArray(result?.acceptances) ? result.acceptances : [],
          });
          setMessage('');
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || 'Unable to load the Helper Agreement.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isWhatsAppAgreementFlow, profile.displayName, profile.email, profile.fullName, whatsappAgreementToken]);

  const openUrl = async (url) => {
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) return;
    await Linking.openURL(normalizedUrl).catch(() => {
      setMessage('Unable to open that agreement file right now.');
    });
  };

  const handleAccept = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      if (isWhatsAppAgreementFlow) {
        const result = await acceptWhatsAppHelperAgreement({
          token: whatsappAgreementToken,
          typedSignatureName,
          checkboxAccepted,
          expectedVersion: activeVersion?.version,
        });
        setWhatsAppSession((current) => ({
          ...(current || {}),
          accepted: true,
          acceptedVersion: result?.acceptedVersion || activeVersion?.version || '',
          acceptedAt: new Date().toISOString(),
        }));
        setMessage('Your Helper Agreement was signed and saved to the helper account linked to this WhatsApp number. Return to WhatsApp to continue your profile setup.');
        const returnUrl = /^https:\/\/wa\.me\/\d{8,15}$/.test(String(result?.returnUrl || ''))
          ? String(result.returnUrl)
          : 'https://wa.me/27605239926';
        setTimeout(() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.location.assign(returnUrl);
          } else {
            Linking.openURL(returnUrl).catch(() => null);
          }
        }, 900);
      } else {
        const result = await actions.acceptAgreement({ typedSignatureName, checkboxAccepted });
        if (!result?.success) {
          setMessage(result?.message || 'Unable to accept the Helper Agreement. Please try again.');
          return;
        }
        setMessage(result?.message || 'Helper Agreement accepted successfully.');
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
      }

      if (!isWhatsAppAgreementFlow) {
        try {
          const refreshed = await getHelperAgreementBundle();
          setBundle({
            activeVersion: refreshed?.activeVersion || null,
            document: refreshed?.document || null,
            versions: Array.isArray(refreshed?.versions) ? refreshed.versions : [],
            acceptances: Array.isArray(refreshed?.acceptances) ? refreshed.acceptances : [],
          });
        } catch (_error) {
          // The profile subscription still updates agreement state if the refresh fails.
        }
      }
    } catch (error) {
      setMessage(error?.message || 'Unable to sign the Helper Agreement. Request a fresh link or sign in with the matching helper account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      {!isWhatsAppAgreementFlow ? <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable> : null}

      <View style={styles.header}>
        <Text style={styles.title}>{isWhatsAppAgreementFlow ? 'Sign your Helper Agreement' : 'Helper Agreement'}</Text>
        <Text style={styles.copy}>{isWhatsAppAgreementFlow
          ? 'Review the current agreement. Sign in with the helper email account linked to the WhatsApp number that received this link. Acceptance is recorded against that verified helper account.'
          : 'Read the latest contract version in full before you acknowledge it. Publishing a new version will block profile completion until you accept it.'}</Text>
      </View>

      {message ? (
        <View style={styles.messageBanner}>
          <Text style={styles.messageText}>{message}</Text>
          {isWhatsAppAgreementFlow && /linked helper account|sign in with the matching helper account|not valid for the signed-in helper account/i.test(message) ? (
            <Pressable accessibilityRole="button" onPress={() => logout?.().catch?.(() => null)}>
              <Text style={styles.switchAccount}>Sign out and use another helper account</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isWhatsAppAgreementFlow && whatsappSession?.maskedWhatsAppNumber ? (
        <View style={styles.linkedNumberNotice}>
          <Text style={styles.linkedNumberLabel}>Linked WhatsApp</Text>
          <Text style={styles.linkedNumberValue}>{whatsappSession.maskedWhatsAppNumber}</Text>
        </View>
      ) : null}

      <Card>
        <SectionHeading
          title="Active contract"
          subtitle="The current agreement version that gates helper activation and profile completion."
          action={<StatusBadge label={isCurrent ? 'Current' : 'Pending'} tone={statusTone} />}
        />

        <View style={styles.metaGrid}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Version</Text>
            <Text style={styles.metaValue}>{activeVersion?.version || profile?.agreement?.requiredVersion || 'Loading...'}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Effective date</Text>
            <Text style={styles.metaValue}>{formatAgreementDate(activeVersion?.effectiveDate)}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Accepted version</Text>
            <Text style={styles.metaValue}>{(isWhatsAppAgreementFlow ? whatsappSession?.acceptedVersion : profile?.agreement?.acceptedVersion) || 'Not accepted yet'}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Accepted at</Text>
            <Text style={styles.metaValue}>{formatTimestamp(isWhatsAppAgreementFlow ? whatsappSession?.acceptedAt : profile?.agreement?.acceptedAt)}</Text>
          </View>
        </View>

        {!isWhatsAppAgreementFlow && hasSignedPdf ? (
          <ActionButton
            label="Open signed PDF"
            tone="secondary"
            onPress={() => openUrl(latestPdfUrl)}
          />
        ) : null}
      </Card>

      <Card>
        <SectionHeading
          title="Agreement text"
          subtitle="This is the actual contract content that the helper must read and accept."
        />
        <View style={styles.contractSurface}>
          {isLoading ? (
            <Text style={styles.contractLoading}>Loading agreement...</Text>
          ) : activeVersion?.contentMarkdown ? (
            renderAgreementMarkdown(activeVersion.contentMarkdown)
          ) : (
            <Text style={styles.contractLoading}>No active Helper Agreement found.</Text>
          )}
        </View>
      </Card>

      <Card>
        <SectionHeading
          title="Electronic acceptance"
          subtitle="Checking the box and typing your full legal name records your acceptance of the current helper agreement."
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checkboxAccepted }}
          onPress={() => {
            if (hasSignedActiveVersion) return;
            setCheckboxAccepted((current) => !current);
          }}
          style={[styles.checkboxRow, hasSignedActiveVersion && styles.checkboxRowDisabled]}
        >
          <View style={[styles.checkbox, checkboxAccepted && styles.checkboxChecked]}>
            {checkboxAccepted ? <Ionicons color="#ffffff" name="checkmark" size={14} /> : null}
          </View>
          <Text style={styles.checkboxLabel}>I have read and agree to the latest Helper Agreement.</Text>
        </Pressable>

        <TextInput
          placeholder="Type your full legal name"
          placeholderTextColor={colors.muted}
          value={typedSignatureName}
          onChangeText={setTypedSignatureName}
          editable={!hasSignedActiveVersion}
          style={[styles.input, hasSignedActiveVersion && styles.inputDisabled]}
        />

        {!isWhatsAppAgreementFlow && saveError ? <Text style={styles.error}>{saveError}</Text> : null}

        <ActionButton
          label={hasSignedActiveVersion ? 'Agreement accepted' : isSubmitting || saving ? 'Submitting...' : 'Accept and sign'}
          onPress={handleAccept}
          disabled={!canSubmit || isSubmitting || saving || isLoading}
        />
      </Card>

      {!isWhatsAppAgreementFlow ? <Card>
        <SectionHeading
          title="Signed versions"
          subtitle="Your previous acceptance records remain available for review."
        />
        {acceptances.length ? acceptances.map((acceptance) => (
          <View key={acceptance.id} style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <View style={styles.historyCopy}>
                <Text style={styles.historyVersion}>Version {acceptance.version}</Text>
                <Text style={styles.historyDate}>{formatTimestamp(acceptance.acceptedAt)}</Text>
              </View>
              {historyPdfUrls[String(acceptance.id || acceptance.version)] ? (
                <Pressable accessibilityRole="button" onPress={() => openUrl(historyPdfUrls[String(acceptance.id || acceptance.version)])} style={styles.historyLink}>
                  <Ionicons color={colors.brandDark} name="document-text-outline" size={16} />
                  <Text style={styles.historyLinkText}>PDF</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )) : (
          <Text style={styles.emptyText}>No signed versions yet.</Text>
        )}
      </Card> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingBottom: 32,
  },
  backRow: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  backText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  header: {
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  messageBanner: {
    backgroundColor: '#fdf2f8',
    borderColor: '#f9a8d4',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  switchAccount: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 10,
    textDecorationLine: 'underline',
  },
  linkedNumberNotice: {
    backgroundColor: '#eef7ff',
    borderColor: '#b7d8f4',
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  linkedNumberLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  linkedNumberValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaCard: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: '47%',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  contractSurface: {
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  contractLoading: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  contractHeading: {
    color: colors.brandDark,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
  },
  contractSubheading: {
    color: colors.brandDark,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 10,
  },
  contractParagraph: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 22,
  },
  paragraphGap: {
    height: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  bulletDot: {
    color: colors.brandDark,
    fontSize: 16,
    lineHeight: 22,
  },
  contractBullet: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    lineHeight: 22,
  },
  checkboxRow: {
    alignItems: 'flex-start',
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  checkboxRowDisabled: {
    opacity: 0.75,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  checkboxLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
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
  inputDisabled: {
    backgroundColor: '#fdf2f8',
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  historyCard: {
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  historyCopy: {
    flex: 1,
    gap: 3,
  },
  historyVersion: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  historyDate: {
    color: colors.muted,
    fontSize: 12,
  },
  historyLink: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  historyLinkText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
});
