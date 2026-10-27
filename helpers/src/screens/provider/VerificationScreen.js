import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getMyPoliceClearanceReview, getMyPoliceClearanceViewUrl } from '../../services/policeClearanceService';
import { colors } from '../../theme/colors';

export function VerificationScreen({ navigate, goBack }) {
  const { profile } = useHelpersApp();
  const isVerified = profile.verificationStatus === 'verified';
  const clearanceStatus = String(profile.policeClearanceStatus || 'missing').toLowerCase();
  const [clearanceReview, setClearanceReview] = useState(null);
  const [clearanceBusyId, setClearanceBusyId] = useState('');
  const [clearanceError, setClearanceError] = useState('');

  useEffect(() => {
    let active = true;
    if (profile.policeClearanceRequired !== true) return () => { active = false; };
    getMyPoliceClearanceReview()
      .then((result) => { if (active) setClearanceReview(result); })
      .catch((error) => { if (active) setClearanceError(error?.message || 'Your police-clearance records are unavailable.'); });
    return () => { active = false; };
  }, [profile.uid, profile.policeClearanceRequired]);

  const openClearanceDocument = async (submissionId) => {
    setClearanceBusyId(submissionId);
    setClearanceError('');
    try {
      const result = await getMyPoliceClearanceViewUrl(submissionId);
      if (!result?.url) throw new Error('This document is not currently available.');
      await Linking.openURL(result.url);
    } catch (error) {
      setClearanceError(error?.message || 'Unable to open your police-clearance document.');
    } finally {
      setClearanceBusyId('');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Verification</Text>
        <Text style={styles.copy}>Verification remains a dedicated trust checkpoint for helpers before full activation.</Text>
      </View>

      <Card>
        <SectionHeading
          title="Verification status"
          subtitle={profile.policeClearanceRequired === true
            ? 'Uncedo verification and police-clearance review are separate checks. Both must be complete before helper activation.'
            : 'Uncedo verification is a trust checkpoint before full helper activation.'}
          action={<StatusBadge label={profile.verificationStatus} tone={isVerified ? 'success' : 'warning'} />}
        />

        <View style={styles.list}>
          <Text style={styles.item}>1. Agreement accepted for current helper version</Text>
          <Text style={styles.item}>2. Profile selfie captured for helper identity</Text>
          <Text style={styles.item}>3. ServiceOfferings include uploaded work photos</Text>
          <Text style={styles.item}>4. Payout destination verified for weekly disbursement</Text>
          {profile.policeClearanceRequired === true ? <Text style={styles.item}>5. Police clearance: {clearanceStatus}</Text> : null}
        </View>

        <View style={styles.buttonRow}>
          <Text style={styles.item}>{profile.policeClearanceRequired === true
            ? 'Verification and police-clearance statuses are updated by Uncedo after review. You cannot change them from this screen. When requested, upload the clearance in your linked WhatsApp chat; it is not uploaded from this screen.'
            : 'Your verification status is updated by Uncedo after review. You cannot change it from this screen.'}</Text>
          <ActionButton label="Review agreement" tone="secondary" onPress={() => navigate({ key: 'Agreement', params: { parentTab: 'Profile' } })} />
        </View>
      </Card>

      {profile.policeClearanceRequired === true ? (
        <Card>
          <SectionHeading
            title="Police-clearance records"
            subtitle="Submitted files remain in your private helper record. Only you and authorised Uncedo administrators can open them."
            action={<StatusBadge label={clearanceReview?.status || clearanceStatus} tone={clearanceStatus === 'approved' ? 'success' : 'warning'} />}
          />
          {clearanceError ? <Text style={styles.error}>{clearanceError}</Text> : null}
          {(Array.isArray(clearanceReview?.submissions) ? clearanceReview.submissions : []).map((submission) => (
            <View key={submission.id} style={styles.documentRow}>
              <View style={styles.documentCopy}>
                <Text style={styles.documentStatus}>{String(submission.status || 'submitted').replaceAll('_', ' ')}</Text>
                <Text style={styles.archiveCopy}>{submission.uploadedAtMs ? `Submitted ${new Date(submission.uploadedAtMs).toLocaleDateString()}` : 'Submitted document'}</Text>
              </View>
              {submission.canView ? <ActionButton
                label={clearanceBusyId === submission.id ? 'Opening…' : 'View file'}
                tone="secondary"
                disabled={Boolean(clearanceBusyId)}
                onPress={() => openClearanceDocument(submission.id)}
              /> : null}
            </View>
          ))}
        </Card>
      ) : null}
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
  list: {
    gap: 6,
  },
  item: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  archiveCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  documentRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 12, paddingTop: 12 },
  documentCopy: { flex: 1, gap: 3 },
  documentStatus: { color: colors.text, fontSize: 13, fontWeight: '800', textTransform: 'capitalize' },
});
