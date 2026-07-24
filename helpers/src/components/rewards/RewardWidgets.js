import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../app/HelperUi';
import { colors } from '../../theme/colors';
import { buildTransactionDisplayModel, formatPoints, formatPointsToRand, formatShortDate } from '../../services/rewards/rewardPresentation';
import { MembershipBadge, MasteryBadge } from './RewardBadges';

export function PointsBalanceCard({
  rewardAccount = {},
  globalConfig = {},
  ratingSummary = {},
  onPress,
  subtitle = 'Track points, progress, and recognition.',
}) {
  const availablePoints = Number(rewardAccount?.availablePoints || 0);
  const pendingPoints = Number(rewardAccount?.pendingPoints || 0);
  const ratingAverage = Number(ratingSummary?.overallAverage || 0);
  const ratingCount = Number(ratingSummary?.overallCount || 0);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      <Card style={styles.balanceCard}>
        <View style={styles.rowBetween}>
          <View style={styles.flexCopy}>
            <Text style={styles.cardTitle}>Uncedo Points</Text>
            <Text style={styles.cardCopy}>{subtitle}</Text>
          </View>
          <Ionicons color={colors.brandDark} name="sparkles-outline" size={22} />
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Available</Text>
            <Text style={styles.metricValue}>{formatPoints(availablePoints)}</Text>
            <Text style={styles.metricSubValue}>{formatPointsToRand(availablePoints, globalConfig?.pointsPerRand || 10)}</Text>
          </View>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Pending</Text>
            <Text style={styles.metricValue}>{formatPoints(pendingPoints)}</Text>
            <Text style={styles.metricSubValue}>{ratingAverage > 0 ? `${ratingAverage.toFixed(1)} rating` : 'No ratings yet'}</Text>
          </View>
        </View>

        <View style={styles.inlineRow}>
          <MembershipBadge
            level={rewardAccount?.membership?.currentLevel}
            subtitle={`${ratingCount} received ratings`}
            variant="expanded"
          />
        </View>
      </Card>
    </Pressable>
  );
}

export function RewardTransactionRow({ transaction, onPress = null }) {
  const display = buildTransactionDisplayModel(transaction);
  const content = (
    <View style={styles.transactionRow}>
      <View style={styles.transactionIcon}>
        <Ionicons color={colors.brandDark} name={display.icon} size={18} />
      </View>
      <View style={styles.transactionBody}>
        <Text style={styles.transactionTitle}>{display.title}</Text>
        <Text style={styles.transactionMeta}>{display.directionLabel} - {display.statusLabel}</Text>
        {display.createdAtLabel ? <Text style={styles.transactionMeta}>{display.createdAtLabel}</Text> : null}
        {display.expiresAtLabel ? <Text style={styles.transactionMeta}>Expires {display.expiresAtLabel}</Text> : null}
      </View>
      <Text style={[styles.transactionAmount, display.signedAmount.startsWith('-') && styles.transactionAmountNegative]}>
        {display.signedAmount}
      </Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function ReferralProgressCard({ summary = null }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>Referral progress</Text>
      <View style={styles.summaryGrid}>
        <SummaryCell label="Attributed" value={String(summary?.totals?.totalAttributed || 0)} />
        <SummaryCell label="Stage One" value={String(summary?.totals?.stageOneQualified || 0)} />
        <SummaryCell label="Stage Two" value={String(summary?.totals?.stageTwoQualified || 0)} />
        <SummaryCell label="Completed" value={String(summary?.totals?.completed || 0)} />
      </View>
    </Card>
  );
}

export function RatingDistributionCard({ ratingSummary = null }) {
  const distribution = ratingSummary?.distribution || ratingSummary?.overallDistribution || {};
  const total = [5, 4, 3, 2, 1].reduce((sum, score) => sum + Number(distribution?.[score] || 0), 0);

  return (
    <Card>
      <Text style={styles.cardTitle}>Rating distribution</Text>
      <View style={styles.ratingList}>
        {[5, 4, 3, 2, 1].map((score) => (
          <View key={score} style={styles.ratingRow}>
            <Text style={styles.ratingLabel}>{score} star</Text>
            <View style={styles.ratingBarTrack}>
              <View
                style={[
                  styles.ratingBarFill,
                  {
                    width: `${total ? Math.max(0, Math.min(100, (Number(distribution?.[score] || 0) / total) * 100)) : 0}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.ratingValue}>{distribution?.[score] || 0}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function ServiceMasteryRow({ serviceName, categoryName = '', mastery = {}, ratingSummary = {}, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.serviceRow, pressed && styles.pressed]}>
      <View style={styles.flexCopy}>
        <Text style={styles.serviceName}>{serviceName}</Text>
        <Text style={styles.serviceMeta}>
          {categoryName || 'Service'} - {Number(ratingSummary?.count || mastery?.ratingCount || 0)} ratings - {Number(mastery?.eligibleCompletedJobCount || mastery?.qualificationSnapshot?.eligibleCompletedJobCount || 0)} jobs
        </Text>
        <Text style={styles.serviceMeta}>
          {Number(ratingSummary?.average || mastery?.averageRating || 0) > 0
            ? `${Number(ratingSummary?.average || mastery?.averageRating || 0).toFixed(1)} average rating`
            : 'Waiting for service ratings'}
        </Text>
      </View>
      <View style={styles.serviceRight}>
        <MasteryBadge level={mastery?.level} />
      </View>
    </Pressable>
  );
}

export function RecognitionCard({ rewardAccount = {}, helperConfig = {}, topMastery = null }) {
  const annualRecognition = rewardAccount?.annualRecognition || {};
  return (
    <Card>
      <Text style={styles.cardTitle}>Recognition</Text>
      <MembershipBadge level={rewardAccount?.membership?.currentLevel} subtitle="Overall platform membership" variant="expanded" />
      {topMastery ? (
        <View style={styles.recognitionRow}>
          <Text style={styles.recognitionLabel}>Top service mastery</Text>
          <MasteryBadge level={topMastery?.level} subtitle={topMastery?.serviceName || 'Top service'} variant="expanded" />
        </View>
      ) : null}
      <Text style={styles.cardCopy}>
        Annual recognition {Array.isArray(helperConfig?.annualPointTiers) && helperConfig.annualPointTiers.length ? 'is active for configured campaigns.' : 'is still planned and not awarding tiers yet.'}
      </Text>
      {annualRecognition?.resetAt ? (
        <Text style={styles.transactionMeta}>Current cycle resets {formatShortDate(annualRecognition.resetAt)}</Text>
      ) : null}
    </Card>
  );
}

function SummaryCell({ label, value }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  pressed: {
    opacity: 0.88,
  },
  balanceCard: {
    gap: 14,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  flexCopy: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  cardCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricBlock: {
    backgroundColor: '#fff8fc',
    borderColor: 'rgba(236,72,153,0.14)',
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 12,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  metricSubValue: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  inlineRow: {
    gap: 8,
  },
  transactionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
  },
  transactionIcon: {
    alignItems: 'center',
    backgroundColor: '#fff8fc',
    borderRadius: 16,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  transactionBody: {
    flex: 1,
    gap: 2,
  },
  transactionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  transactionMeta: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  transactionAmount: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '900',
  },
  transactionAmountNegative: {
    color: '#b91c1c',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCell: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 1,
    gap: 4,
    minWidth: '40%',
    padding: 12,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  ratingList: {
    gap: 10,
  },
  ratingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  ratingLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 48,
  },
  ratingBarTrack: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  ratingBarFill: {
    backgroundColor: colors.brand,
    borderRadius: 999,
    height: '100%',
  },
  ratingValue: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'right',
  },
  serviceRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  serviceName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  serviceMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  serviceRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  recognitionRow: {
    gap: 8,
  },
  recognitionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
