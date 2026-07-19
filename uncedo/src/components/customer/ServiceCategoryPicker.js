import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../ui/Card';
import { CUSTOMER_SERVICE_CATEGORY_OPTIONS } from '../../constants/serviceCatalog';
import { colors } from '../../theme/colors';

export function ServiceCategoryPicker({
  label = 'Service categories',
  description = 'Choose at least one category so Uncedo can tailor your home screen.',
  selectedCategoryIds = [],
  onChange,
}) {
  const selectedSet = new Set((Array.isArray(selectedCategoryIds) ? selectedCategoryIds : []).map((item) => String(item || '').trim()).filter(Boolean));

  const toggleCategory = (categoryId) => {
    if (typeof onChange !== 'function') return;
    const nextSet = new Set(selectedSet);
    if (nextSet.has(categoryId)) {
      nextSet.delete(categoryId);
    } else {
      nextSet.add(categoryId);
    }
    onChange(Array.from(nextSet));
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <View style={styles.chipWrap}>
        {CUSTOMER_SERVICE_CATEGORY_OPTIONS.map((option) => {
          const isActive = selectedSet.has(option.id);
          return (
            <Pressable
              accessibilityRole="button"
              key={option.id}
              onPress={() => toggleCategory(option.id)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#faf5ff',
    borderColor: 'rgba(168,85,247,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  chipLabelActive: {
    color: '#ffffff',
  },
});
