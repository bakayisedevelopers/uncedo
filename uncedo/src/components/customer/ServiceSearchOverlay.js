import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export function ServiceSearchOverlay({
  results = [],
  value = '',
  visible = false,
  onChangeText,
  onClose,
  onSelect,
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <Ionicons color={colors.brand} name="search-outline" size={18} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onChangeText={onChangeText}
                placeholder="Search available services"
                placeholderTextColor="#c084fc"
                style={styles.searchInput}
                value={value}
              />
            </View>

            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={colors.text} name="close" size={18} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.resultsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {results.length ? (
              results.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => onSelect?.(item)}
                  style={({ pressed }) => [styles.resultCard, pressed && styles.resultCardPressed]}
                >
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultTitle}>{item.title}</Text>
                    <Text style={styles.resultMeta}>
                      {item.kind === 'package' ? 'Package' : 'Service'} - {item.categoryLabel}
                    </Text>
                    {item.includedLabels?.length ? (
                      <Text numberOfLines={1} style={styles.resultDescription}>
                        {item.includedLabels.join(', ')}
                      </Text>
                    ) : (
                      <Text numberOfLines={1} style={styles.resultDescription}>
                        {item.description}
                      </Text>
                    )}
                  </View>

                  <View style={styles.resultAside}>
                    <Text style={styles.resultPrice}>{item.priceLabel}</Text>
                    <Ionicons color={colors.brand} name="chevron-forward" size={16} />
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons color={colors.brand} name="search-outline" size={22} />
                <Text style={styles.emptyTitle}>No matching services</Text>
                <Text style={styles.emptyCopy}>Try another service name or category.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(15,23,42,0.18)',
    flex: 1,
    justifyContent: 'flex-start',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#fff7fd',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    maxHeight: '82%',
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 18,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(217,70,239,0.14)',
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    minHeight: 46,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(217,70,239,0.12)',
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  resultsContent: {
    gap: 10,
    paddingTop: 16,
  },
  resultCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(217,70,239,0.12)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  resultCardPressed: {
    transform: [{ scale: 0.992 }],
  },
  resultCopy: {
    flex: 1,
    gap: 3,
  },
  resultTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  resultMeta: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '700',
  },
  resultDescription: {
    color: colors.muted,
    fontSize: 13,
  },
  resultAside: {
    alignItems: 'flex-end',
    gap: 8,
  },
  resultPrice: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 36,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
});
