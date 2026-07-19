import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading } from '../../components/app/HelperUi';
import { useAuth } from '../../context/AuthContext';
import { ensureMyReferralCode, getMyReferralSummary } from '../../services/rewards/rewardClientService';
import { buildReferralLink, formatShortDate, maskReferralDisplay } from '../../services/rewards/rewardPresentation';
import { ACCOUNT_TYPES } from '../../shared/rewards';
import { colors } from '../../theme/colors';

async function copyText(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  if (Platform.OS === 'web' && globalThis?.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  }

  return false;
}

export function HelperReferralsScreen({ goBack }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async ({ forceCode = false } = {}) => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      if (forceCode) {
        await ensureMyReferralCode(ACCOUNT_TYPES.HELPER);
      }

      setSummary(await getMyReferralSummary(ACCOUNT_TYPES.HELPER));
    } catch (nextError) {
      setError(nextError.message || 'Unable to load helper referrals.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    load({ forceCode: true });
  }, [load]);

  const customerLink = useMemo(() => buildReferralLink(summary?.code || '', 'customer'), [summary?.code]);
  const helperLink = useMemo(() => buildReferralLink(summary?.code || '', 'helper'), [summary?.code]);
  const helperReferralActive = Number(summary?.stageOnePoints || 0) > 0 || Number(summary?.stageTwoPoints || 0) > 0;

  const handleCopy = async (value, label) => {
    try {
      const copied = await copyText(value);
      if (copied) {
        setMessage(`${label} copied.`);
        return;
      }
      setMessage(`${label} is ready to share.`);
    } catch (nextError) {
      setMessage(nextError.message || `Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const handleShare = async (link, audience) => {
    try {
      await Share.share({
        title: 'Join Uncedo',
        message: audience === 'helper'
          ? `Join Uncedo as a helper with my referral link.\n${link}`
          : `Need trusted local help? Join Uncedo with my referral link.\n${link}`,
        url: link,
      });
      setMessage('Referral link ready to share.');
    } catch (nextError) {
      Alert.alert('Share unavailable', nextError.message || 'Unable to open the share sheet right now.');
    }
  };

  return (
    <Screen
      title="Referrals"
      description="Share one public helper referral code for customer or helper invites without exposing your UID or any private referred-user information."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
    >
      {message ? (
        <Card style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </Card>
      ) : null}

      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      <Card>
        <SectionHeading title="Your referral code" subtitle="Use one public code for both customer and helper invites." />
        {loading ? (
          <EmptyState title="Loading referral code" description="Generating or reading your public helper referral code." />
        ) : (
          <>
            <Text style={styles.codeValue}>{summary?.code || 'Unavailable'}</Text>
            <Text style={styles.copy}>Self-referral, duplicate accounts, link clicks alone, unpaid bookings, and policy abuse do not qualify for rewards.</Text>
            <View style={styles.actionColumn}>
              <ActionButton label="Copy referral code" onPress={() => handleCopy(summary?.code || '', 'Referral code')} />
              <ActionButton label="Copy customer link" tone="secondary" onPress={() => handleCopy(customerLink, 'Customer referral link')} />
              <ActionButton label="Share customer link" tone="secondary" onPress={() => handleShare(customerLink, 'customer')} />
              <ActionButton label="Copy helper link" tone="secondary" onPress={() => handleCopy(helperLink, 'Helper referral link')} />
              <ActionButton label="Share helper link" tone="secondary" onPress={() => handleShare(helperLink, 'helper')} />
            </View>
          </>
        )}
      </Card>

      <Card>
        <SectionHeading title="Customer referrals" subtitle="Only genuinely new customers qualify." />
        <Text style={styles.copy}>Stage One: the referred customer completes the required profile and verifies a valid payment method where configured.</Text>
        <Text style={styles.copy}>Stage Two: that customer completes and pays for a first eligible booking.</Text>
        <Text style={styles.copy}>Configured Stage One points: {summary?.stageOnePoints || 0} - Stage Two points: {summary?.stageTwoPoints || 0}</Text>
      </Card>

      <Card>
        <SectionHeading title="Helper referrals" subtitle="Only show active qualification rules that backend supports." />
        <Text style={styles.copy}>
          {helperReferralActive
            ? 'Helper-referral qualification is active in backend configuration for this environment.'
            : 'Helper-referral qualification rewards are still planned in backend configuration, so this app only exposes safe sharing today.'}
        </Text>
        <Text style={styles.copy}>Do not promise guaranteed work, guaranteed income, or automatic approval when sharing helper referral links.</Text>
      </Card>

      <Card>
        <SectionHeading title="Referral progress" subtitle="Counts are privacy-safe and identity-masked." />
        <Text style={styles.copy}>Attributed: {summary?.totals?.totalAttributed || 0}</Text>
        <Text style={styles.copy}>Stage One: {summary?.totals?.stageOneQualified || 0}</Text>
        <Text style={styles.copy}>Stage Two: {summary?.totals?.stageTwoQualified || 0}</Text>
        <Text style={styles.copy}>Completed: {summary?.totals?.completed || 0}</Text>
      </Card>

      <Card>
        <SectionHeading title="Referral activity" subtitle="Private names, emails, phone numbers, and addresses are not shown here." />
        {!summary?.referrals?.length ? (
          <EmptyState title="No referrals yet" description="Masked referral progress will appear here as backend milestones are reached." />
        ) : (
          summary.referrals.map((item, index) => (
            <View key={item.referralId} style={styles.activityRow}>
              <Text style={styles.activityTitle}>{maskReferralDisplay(item, index)}</Text>
              <Text style={styles.activityCopy}>
                {item.stageTwoAwardedAt
                  ? 'Final qualified milestone completed.'
                  : item.stageOneAwardedAt
                    ? 'Stage One completed.'
                    : 'Referral attributed and waiting for qualification.'}
              </Text>
              <Text style={styles.activityDate}>{formatShortDate(item.stageTwoAwardedAt || item.stageOneAwardedAt || item.attributedAt)}</Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  messageCard: {
    backgroundColor: '#ecfeff',
    borderColor: '#67e8f9',
  },
  messageText: {
    color: '#155e75',
    fontSize: 13,
    fontWeight: '700',
  },
  warningCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  warningText: {
    color: '#9a3412',
    fontSize: 13,
    fontWeight: '700',
  },
  codeValue: {
    color: colors.brandDark,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  copy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  actionColumn: {
    gap: 10,
  },
  activityRow: {
    gap: 4,
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
