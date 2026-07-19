import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../ui/Card';
import { colors } from '../../../theme/colors';
import {
  formatPoints,
  formatPointsToRand,
  pointsToRandValue,
} from '../../../services/rewards/rewardPresentation';
import { MembershipBadge } from './MembershipBadge';
import uncedoMark from '../../../../assets/branding/uncedo-mark.png';

export function CustomerRewardsPreviewCard({
  rewardAccount = null,
  ratingSummary = null,
  globalConfig = null,
  onPress,
  title = 'Uncedo Points',
  subtitle = 'Track points, referrals, membership, and ratings.',
}) {
  const pointsPerRand = Number(globalConfig?.pointsPerRand || 10) || 10;
  const availablePoints = Number(rewardAccount?.availablePoints || 0);
  const ratingAverage = Number(ratingSummary?.overallAverage || 0);
  const ratingCount = Number(ratingSummary?.overallCount || 0);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      <Card style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={uncedoMark}
            style={styles.brandMark}
          />
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Available</Text>
            <Text style={styles.metricValue}>{formatPoints(availablePoints)}</Text>
            <Text style={styles.metricSubValue}>{formatPointsToRand(availablePoints, pointsPerRand)}</Text>
          </View>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Rating</Text>
            <Text style={styles.metricValue}>{ratingAverage > 0 ? ratingAverage.toFixed(1) : '0.0'}</Text>
            <Text style={styles.metricSubValue}>{ratingCount} received ratings</Text>
          </View>
        </View>

        <View style={styles.bottomRow}>
          <MembershipBadge
            level={rewardAccount?.membership?.currentLevel}
            subtitle="Current membership"
            variant="expanded"
          />
          <Text style={styles.creditHint}>
            {formatPoints(Math.round(pointsPerRand))} = {pointsToRandValue(pointsPerRand, pointsPerRand).toFixed(0)} rand service credit
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  pressed: {
    opacity: 0.85,
  },
  card: {
    gap: 14,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  brandMark: {
    height: 34,
    width: 34,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricBlock: {
    backgroundColor: '#faf5ff',
    borderColor: '#f5d0fe',
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
    letterSpacing: 1.2,
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
  bottomRow: {
    gap: 10,
  },
  creditHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
});
