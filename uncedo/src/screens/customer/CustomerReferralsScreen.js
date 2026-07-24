import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clipboard,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { useAuth } from '../../context/AuthContext';
import {
  ensureMyReferralCode,
  getMyReferralSummary,
  getReferralCaptureStatus,
} from '../../services/rewards/rewardClientService';
import { recordRewardUiEvent } from '../../services/rewards/rewardAnalyticsService';
import { buildReferralLink, formatShortDate } from '../../services/rewards/rewardPresentation';
import { colors } from '../../theme/colors';

function SummaryStat({ label, value }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryStatLabel}>{label}</Text>
      <Text style={styles.summaryStatValue}>{value}</Text>
    </View>
  );
}

export function CustomerReferralsScreen({ navigate }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [captureStatus, setCaptureStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadSummary = useCallback(async ({ forceCode = false } = {}) => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      if (forceCode) {
        await ensureMyReferralCode();
      }

      const [nextSummary, nextCaptureStatus] = await Promise.all([
        getMyReferralSummary(),
        getReferralCaptureStatus().catch(() => null),
      ]);

      setSummary(nextSummary);
      setCaptureStatus(nextCaptureStatus);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load referrals.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    recordRewardUiEvent(user?.uid, 'referral_screen_viewed');
  }, [user?.uid]);

  useEffect(() => {
    loadSummary({ forceCode: true });
  }, [loadSummary]);

  const referralLink = useMemo(
    () => buildReferralLink(summary?.code || ''),
    [summary?.code],
  );

  const shareMessage = useMemo(() => (
    `Need trusted local help? Join Uncedo with my referral link.\n${referralLink}`
  ), [referralLink]);

  const handleCopy = async (value, label) => {
    if (!value) {
      return;
    }

    Clipboard.setString(String(value));
    recordRewardUiEvent(user?.uid, label === 'Referral code' ? 'referral_code_copied' : 'referral_link_copied');
    setMessage(`${label} copied.`);
  };

  const handleShare = async () => {
    if (!referralLink) {
      return;
    }

    try {
      await Share.share({
        title: 'Join Uncedo',
        message: shareMessage,
        url: referralLink,
      });
      recordRewardUiEvent(user?.uid, 'referral_link_shared');
      setMessage('Referral link ready to share.');
    } catch (nextError) {
      setMessage(nextError.message || 'Unable to open the share sheet right now.');
    }
  };

  if (loading) {
    return <LoadingState label="Loading referrals" />;
  }

  if (error && !summary) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState title="Unable to load referrals" message={error} />
        <Button onPress={() => loadSummary({ forceCode: true })}>Retry</Button>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadSummary({ forceCode: false });
          }}
          tintColor={colors.brand}
        />
      )}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
    >
      <StickyScreenHeader
        backLabel="Back to rewards"
        onBack={() => navigate('CustomerRewardsOverview')}
        title="Referrals"
        subtitle="Share your code, track Stage One and Stage Two, and keep referral privacy intact."
      />

      {message ? (
        <Card style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </Card>
      ) : null}
      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}
      {captureStatus?.message ? (
        <Card style={styles.captureCard}>
          <Text style={styles.captureTitle}>Referral capture status</Text>
          <Text style={styles.captureText}>{captureStatus.message}</Text>
        </Card>
      ) : null}

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Your referral code</Text>
        <Text style={styles.codeValue}>{summary?.code || 'Unavailable'}</Text>
        <Text style={styles.copy}>
          Referrals only count for genuinely new eligible accounts. Self-referral, link clicks, incomplete signup, unpaid bookings, and cancelled bookings do not qualify.
        </Text>
        <View style={styles.actionColumn}>
          <Button onPress={() => handleCopy(summary?.code || '', 'Referral code')}>
            Copy referral code
          </Button>
          <Button variant="secondary" onPress={() => handleCopy(referralLink, 'Referral link')}>
            Copy referral link
          </Button>
          <Button variant="secondary" onPress={handleShare}>
            Share referral link
          </Button>
          {Platform.OS === 'web' ? (
            <Text style={styles.copy}>If sharing is unavailable on web, copy the link instead.</Text>
          ) : null}
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>How referral milestones work</Text>
        <View style={styles.milestoneBlock}>
          <Text style={styles.milestoneTitle}>Stage One</Text>
          <Text style={styles.copy}>The referred customer must complete the required profile and verify a valid payment method.</Text>
          <Text style={styles.pointsText}>Configured reward: {summary?.stageOnePoints || 0} points</Text>
        </View>
        <View style={styles.milestoneBlock}>
          <Text style={styles.milestoneTitle}>Stage Two</Text>
          <Text style={styles.copy}>That same customer must complete and pay for a first eligible booking.</Text>
          <Text style={styles.pointsText}>Configured reward: {summary?.stageTwoPoints || 0} points</Text>
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Referral progress</Text>
        <View style={styles.summaryGrid}>
          <SummaryStat label="Attributed" value={String(summary?.totals?.totalAttributed || 0)} />
          <SummaryStat label="Stage One" value={String(summary?.totals?.stageOneQualified || 0)} />
          <SummaryStat label="Stage Two" value={String(summary?.totals?.stageTwoQualified || 0)} />
          <SummaryStat label="Completed" value={String(summary?.totals?.completed || 0)} />
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Privacy-safe referral activity</Text>
        {!summary?.referrals?.length ? (
          <EmptyState title="No referred customers yet" message="Once someone qualifies from your referral, a masked activity entry will appear here." />
        ) : summary.referrals.map((item) => (
          <View key={item.referralId} style={styles.activityRow}>
            <View style={styles.activityIcon}>
              <Ionicons color={colors.brandDark} name="gift-outline" size={16} />
            </View>
            <View style={styles.activityBody}>
              <Text style={styles.activityTitle}>{item.displayLabel || 'Referred customer'}</Text>
              <Text style={styles.activityCopy}>
                {item.stageTwoAwardedAt
                  ? 'A referred customer completed Stage Two.'
                  : item.stageOneAwardedAt
                    ? 'A referred customer completed Stage One.'
                    : 'Referral captured and waiting for qualification.'}
              </Text>
              <Text style={styles.activityDate}>
                {formatShortDate(item.stageTwoAwardedAt || item.stageOneAwardedAt || item.attributedAt)}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Terms and anti-abuse notice</Text>
        <Text style={styles.copy}>Uncedo may reject or reverse referrals linked to self-referral, duplicate accounts, non-new accounts, fraud review, unpaid bookings, or policy abuse.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
    paddingBottom: 32,
  },
  stateWrap: {
    gap: 12,
    padding: 24,
  },
  messageCard: {
    backgroundColor: '#ecfeff',
    borderColor: '#67e8f9',
  },
  messageText: {
    color: '#155e75',
    fontSize: 13,
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  errorText: {
    color: '#9a3412',
    fontSize: 13,
    fontWeight: '700',
  },
  captureCard: {
    gap: 6,
  },
  captureTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  captureText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  codeValue: {
    color: colors.brandDark,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  actionColumn: {
    gap: 10,
  },
  milestoneBlock: {
    backgroundColor: '#faf5ff',
    borderColor: '#f5d0fe',
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  milestoneTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  pointsText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryStat: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 1,
    gap: 4,
    minWidth: '40%',
    padding: 12,
  },
  summaryStatLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryStatValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  activityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  activityIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.10)',
    borderRadius: 14,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  activityBody: {
    flex: 1,
    gap: 3,
  },
  activityTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  activityCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  activityDate: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
});
