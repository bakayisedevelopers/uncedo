import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { submitSessionRating } from '../../services/sessionService';

const STAR_VALUES = [1, 2, 3, 4, 5];

export function SessionRatingPrompt({ session, role = 'student', onHandled }) {
  const [selectedRating, setSelectedRating] = useState(5);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedRating(5);
  }, [session?.id]);

  if (!session) {
    return null;
  }

  const statusCopy = session.status === 'completed' ? 'Job ended' : 'Job canceled';
  const counterpart = role === 'student'
    ? (session.tutorName || session.tutorId || 'your helper')
    : (session.studentName || session.studentId || 'your customer');

  const handleSubmit = async (rating) => {
    if (isSaving) {
      return;
    }

    setSelectedRating(rating);
    setIsSaving(true);
    try {
      await submitSessionRating(session, role, { overall: rating });
      onHandled?.(session.id);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDismiss = async () => {
    if (isSaving) {
      return;
    }

    onHandled?.(session.id);
  };

  return (
    <View pointerEvents="box-none" style={styles.portal}>
      <View pointerEvents="none" style={styles.overlay} />
      <View style={styles.modal}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>{statusCopy}</Text>
            <Text style={styles.title}>Rate this job</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={handleDismiss} style={styles.closeButton}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>

        <Text style={styles.copy}>
          Share a quick rating for {counterpart}. Tap a star to submit immediately.
        </Text>

        <View style={styles.stars}>
          {STAR_VALUES.map((starValue) => (
            <Pressable
              accessibilityRole="button"
              key={starValue}
              onPress={() => handleSubmit(starValue)}
              style={styles.starButton}
            >
              <Text style={[styles.star, starValue <= selectedRating && styles.starActive]}>*</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.footer}>
          {isSaving ? <ActivityIndicator color={colors.brand} /> : null}
          <Text style={styles.footerCopy}>
            {isSaving ? 'Saving rating...' : 'Close to dismiss this rating prompt.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  portal: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 80,
    elevation: 80,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  modal: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 420,
    padding: 20,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  kicker: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  closeButton: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  closeLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  starButton: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  star: {
    color: '#d4d4d8',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
  },
  starActive: {
    color: '#f59e0b',
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  footerCopy: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
});
