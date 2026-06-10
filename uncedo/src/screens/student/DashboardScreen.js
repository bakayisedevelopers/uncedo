import { useEffect, useState } from 'react';
import { Clipboard, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/States';
import { StudentRequestComposer } from '../../components/student/StudentRequestComposer';
import { useAuth } from '../../context/AuthContext';
import { subscribeToStudentRequests } from '../../services/classRequestService';
import { subscribeToStudentSessions } from '../../services/sessionService';
import { shadows } from '../../theme/shadows';
import { getStudentOnboardingStatus } from '../../utils/onboarding';
import { colors } from '../../theme/colors';

export function DashboardScreen({ navigate }) {
  const { user } = useAuth();
  const onboardingStatus = getStudentOnboardingStatus(user);
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [composerStage, setComposerStage] = useState('input');
  const [shareFeedback, setShareFeedback] = useState('');
  const referralSlug = String(user?.referralSlug || user?.referralCode || '').trim();
  const referralLink = referralSlug ? `https://parakleo.bakayise.com/signup?ref=${encodeURIComponent(referralSlug)}` : '';
  const referralPreview = referralLink.length > 42 ? `${referralLink.slice(0, 42)}...` : referralLink;

  useEffect(() => subscribeToStudentRequests(
    user?.uid,
    (items) => {
      setRequests(items);
      setLoadingRequests(false);
    },
    () => setLoadingRequests(false),
  ), [user?.uid]);

  useEffect(() => subscribeToStudentSessions(
    user?.uid,
    (items) => {
      setSessions(items);
      setLoadingSessions(false);
    },
    () => setLoadingSessions(false),
  ), [user?.uid]);

  if (loadingRequests || loadingSessions) {
    return <LoadingState label="Loading dashboard" />;
  }

  const firstName = String(user?.displayName || 'there').trim().split(' ')[0] || 'there';

  const handleShareReferral = async () => {
    if (!referralLink) return;
    try {
      await Share.share({
        title: 'Join Parakleo',
        message: `Use my Parakleo referral link to sign up and start learning.\n${referralLink}`,
        url: referralLink,
      });
      setShareFeedback('Link shared.');
    } catch (_error) {
      setShareFeedback('Unable to share link.');
    }
  };

  const handleCopyReferral = () => {
    if (!referralLink) return;
    try {
      Clipboard.setString(referralLink);
      setShareFeedback('Link copied.');
    } catch (_error) {
      setShareFeedback('Unable to copy link.');
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.pageGlowTop} />
      <View style={styles.pageGlowBottom} />
      <View style={styles.wrap}>
        <View style={styles.heroSection}>
          <View style={styles.heroGlowTopLeft} />
          <View style={styles.heroGlowBottomRight} />
          <View style={styles.heroContent}>
            <View>
              <Text style={styles.kicker}>Student request</Text>
              <Text style={styles.title}>Hi {firstName}</Text>
            </View>
            <StudentRequestComposer navigate={navigate} requests={requests} sessions={sessions} user={user} onStageChange={setComposerStage} />
          </View>
        </View>
        {referralLink && composerStage !== 'review' ? (
          <Card style={styles.referralCard}>
            <Text style={styles.referralIntro}>
              Get free 15 minutes when a student joins and completes their profile using your link.
            </Text>
            <View style={styles.referralLinkCard}>
              <Text style={styles.referralLabel}>Referral link</Text>
              <Text style={styles.referralPreview} numberOfLines={2}>{referralPreview}</Text>
              <Text selectable style={styles.referralLink}>{referralLink}</Text>
            </View>
            <View style={styles.referralActions}>
              <Pressable accessibilityRole="button" onPress={handleCopyReferral} style={styles.referralGhostButton}>
                <Text style={styles.referralGhostButtonText}>Copy</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={handleShareReferral} style={styles.referralShareButton}>
                <Text style={styles.referralShareButtonText}>Share</Text>
              </Pressable>
            </View>
            {shareFeedback ? <Text style={styles.referralFeedback}>{shareFeedback}</Text> : null}
            <Text style={styles.meta}><Text style={styles.metaStrong}>Free minutes remaining:</Text> {Number(user?.freeMinutesRemaining || 0).toFixed(2)} min</Text>
          </Card>
        ) : null}
        {!onboardingStatus.complete ? (
          <Card>
            <Text style={styles.copy}>{onboardingStatus.message}</Text>
          </Card>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  pageGlowTop: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 180,
    height: 260,
    position: 'absolute',
    right: -110,
    top: 24,
    width: 260,
  },
  pageGlowBottom: {
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderRadius: 220,
    bottom: 80,
    height: 300,
    left: -140,
    position: 'absolute',
    width: 300,
  },
  wrap: {
    gap: 16,
    paddingBottom: 12,
  },
  heroSection: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: colors.border,
    borderRadius: 32,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.panel,
  },
  heroGlowTopLeft: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 220,
    height: 220,
    left: -70,
    position: 'absolute',
    top: -40,
    width: 220,
  },
  heroGlowBottomRight: {
    backgroundColor: 'rgba(59,130,246,0.14)',
    borderRadius: 200,
    bottom: -70,
    height: 220,
    position: 'absolute',
    right: -80,
    width: 220,
  },
  heroContent: {
    gap: 16,
    padding: 16,
  },
  kicker: {
    color: 'rgba(16,185,129,0.8)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 36,
    marginTop: 8,
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  meta: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  metaStrong: {
    color: colors.text,
    fontWeight: '800',
  },
  referralCard: {
    fontSize: 30,
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
    gap: 10,
  },
  referralIntro: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 22,
  },
  referralLinkCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: '#bbf7d0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  referralLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  referralPreview: {
    color: '#3f3f46',
    fontSize: 13,
    fontWeight: '700',
  },
  referralLink: {
    color: '#52525b',
    fontSize: 11,
  },
  referralActions: {
    flexDirection: 'row',
    gap: 8,
  },
  referralGhostButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  referralGhostButtonText: {
    color: '#3f3f46',
    fontSize: 13,
    fontWeight: '800',
  },
  referralShareButton: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 14,
    flex: 1,
    paddingVertical: 10,
  },
  referralShareButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  referralFeedback: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
});
