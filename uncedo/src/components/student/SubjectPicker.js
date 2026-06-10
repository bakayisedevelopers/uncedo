import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SOUTH_AFRICAN_SUBJECTS, normalizeSubjectList } from '../../constants/subjects';
import { colors } from '../../theme/colors';

export function SubjectPicker({ value = [], onChange }) {
  const selected = normalizeSubjectList(value);
  const [open, setOpen] = useState(false);

  function addSubject(subject) {
    if (!subject || selected.includes(subject)) return;
    onChange([...selected, subject]);
  }

  function removeSubject(subject) {
    onChange(selected.filter((item) => item !== subject));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Subjects</Text>

      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.dropdownTrigger}>
        <Text style={[styles.dropdownValue, !selected.length && styles.dropdownPlaceholder]} numberOfLines={1}>
          {selected.length ? selected.join(', ') : 'Select subject'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>

      {selected.length ? (
        <View style={styles.selectedWrap}>
          {selected.map((subject) => (
            <View key={subject} style={styles.selectedPill}>
              <Text style={styles.selectedPillText}>{subject}</Text>
              <Pressable accessibilityRole="button" onPress={() => removeSubject(subject)} style={styles.selectedRemove}>
                <Ionicons name="close" size={14} color={colors.brandDark} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Subjects</Text>
            <ScrollView style={styles.dropdownList}>
              {SOUTH_AFRICAN_SUBJECTS.map((subject) => {
                const active = selected.includes(subject);
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={subject}
                    onPress={() => addSubject(subject)}
                    style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                  >
                    <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>
                      {subject}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.dropdownCloseButton}>
              <Text style={styles.dropdownCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  dropdownTrigger: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownValue: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
  },
  dropdownPlaceholder: {
    color: colors.muted,
    fontWeight: '500',
  },
  selectedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedPill: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedPillText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '700',
  },
  selectedRemove: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.28)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: 12,
    maxWidth: 440,
    padding: 18,
    width: '100%',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  dropdownList: {
    maxHeight: 320,
  },
  dropdownOption: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownOptionActive: {
    backgroundColor: '#ecfdf5',
  },
  dropdownOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownOptionTextActive: {
    color: colors.brandDark,
    fontWeight: '800',
  },
  dropdownCloseButton: {
    alignSelf: 'flex-end',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dropdownCloseText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
