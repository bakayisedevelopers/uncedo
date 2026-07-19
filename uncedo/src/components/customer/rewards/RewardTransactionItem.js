import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { buildTransactionDisplayModel } from '../../../services/rewards/rewardPresentation';

function getAmountColor(direction) {
  if (direction === 'Credit') return '#15803d';
  if (direction === 'Expired' || direction === 'Reversal' || direction === 'Debit') return '#b91c1c';
  return colors.text;
}

export function RewardTransactionItem({ transaction, onPress = null }) {
  const viewModel = buildTransactionDisplayModel(transaction);
  const content = (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons color={colors.brandDark} name={viewModel.icon} size={18} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>{viewModel.title}</Text>
          <Text style={[styles.amount, { color: getAmountColor(viewModel.directionLabel) }]}>{viewModel.signedAmount}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{viewModel.statusLabel}</Text>
          {viewModel.createdAtLabel ? <Text style={styles.metaText}>{viewModel.createdAtLabel}</Text> : null}
          {viewModel.expiresAtLabel ? <Text style={styles.metaText}>Expires {viewModel.expiresAtLabel}</Text> : null}
        </View>
      </View>
    </View>
  );

  if (!onPress) {
    return <View style={styles.card}>{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(transaction)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  cardPressed: {
    opacity: 0.8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.10)',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  body: {
    flex: 1,
    gap: 6,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  amount: {
    fontSize: 16,
    fontWeight: '900',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
});

