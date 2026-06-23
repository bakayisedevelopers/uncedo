import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';
import { formatCurrency } from '../../utils/payouts';
import { ActionButton } from './HelperUi';

function getCountdownColor(secondsLeft) {
  if (secondsLeft <= 10) return '#ef4444';
  if (secondsLeft <= 20) return '#f59e0b';
  return '#22c55e';
}

export function HelperOfferOverlay() {
  const { user } = useAuth();
  const { onboardingStatus, jobOffers, activeJob, actions } = useHelpersApp();
  const [now, setNow] = useState(Date.now());
  const shimmer = useRef(new Animated.Value(0)).current;

  const activeOffer = jobOffers[0] || null;
  const canRespond = Boolean(user?.uid && onboardingStatus.complete && !activeJob);

  useEffect(() => {
    if (!activeOffer?.offerExpiresAt) {
      return () => {};
    }

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeOffer?.offerExpiresAt]);

  useEffect(() => {
    if (!activeOffer?.id) return () => {};

    shimmer.setValue(0);
    const animation = Animated.loop(
      Animated.timing(shimmer, {
        duration: 1800,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    animation.start();

    return () => {
      animation.stop();
      shimmer.stopAnimation();
      shimmer.setValue(0);
    };
  }, [activeOffer?.id, shimmer]);

  const secondsLeft = useMemo(() => {
    if (!activeOffer?.offerExpiresAt) return 0;
    return Math.max(0, Math.ceil((Number(activeOffer.offerExpiresAt) - now) / 1000));
  }, [activeOffer?.offerExpiresAt, now]);

  const countdownRatio = activeOffer?.offerExpiresAt
    ? Math.max(0, Math.min(1, (Number(activeOffer.offerExpiresAt) - now) / 30000))
    : 0;
  const countdownColor = getCountdownColor(secondsLeft);
  const offerTimingLabel = activeOffer?.timingPreference === 'later' ? 'Later' : 'Now';
  const offerTimingCopy = activeOffer?.timingPreference === 'later'
    ? (activeOffer?.scheduledForText || 'Scheduled request')
    : 'Needs help now';
  const offerPrice = formatCurrency(activeOffer?.payoutEstimate);
  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-280, 280],
  });

  if (!activeOffer || !canRespond) return null;

  return (
    <View pointerEvents="box-none" style={styles.portal}>
      <View pointerEvents="none" style={styles.backdrop} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={[styles.countdownFill, { width: `${countdownRatio * 100}%`, backgroundColor: countdownColor }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmer,
              {
                transform: [{ translateX: shimmerTranslate }, { rotate: '12deg' }],
              },
            ]}
          />

          <View style={styles.content}>
            <Text style={styles.eyebrow}>Incoming helper offer</Text>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{activeOffer.title}</Text>
                <Text style={styles.subtitle}>{activeOffer.customerName} | {activeOffer.area}</Text>
              </View>
              <View style={styles.priceBadge}>
                <Text style={styles.priceBadgeText}>{offerPrice}</Text>
              </View>
            </View>

            <Text style={styles.description}>{activeOffer.description}</Text>

            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View style={[styles.statusPill, activeOffer.timingPreference === 'later' ? styles.statusPillLater : styles.statusPillNow]}>
                  <Text style={styles.statusPillText}>{offerTimingLabel}</Text>
                </View>
                <Text style={styles.statusCopy}>{offerTimingCopy}</Text>
              </View>
              {activeOffer.statusDetail ? <Text style={styles.statusNote}>{activeOffer.statusDetail}</Text> : null}
            </View>

            {!canRespond ? (
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>
                  {activeJob
                    ? 'Finish the current helper job before taking another offer.'
                    : onboardingStatus.message || 'Complete your helper profile before accepting offers.'}
                </Text>
              </View>
            ) : null}

            <View style={styles.buttonRow}>
              <ActionButton
                label="Accept"
                onPress={() => actions.acceptOffer(activeOffer.id)}
                disabled={!canRespond || secondsLeft <= 0}
                style={styles.buttonFill}
              />
              <ActionButton
                label="Decline"
                tone="secondary"
                onPress={() => actions.declineOffer(activeOffer.id)}
                disabled={!canRespond || secondsLeft <= 0}
                style={styles.buttonFill}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  portal: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 45,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
  },
  sheetWrap: {
    paddingBottom: 84,
    paddingHorizontal: 12,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    minHeight: 252,
    overflow: 'hidden',
    position: 'relative',
  },
  countdownFill: {
    bottom: 0,
    left: 0,
    opacity: 0.18,
    position: 'absolute',
    top: 0,
  },
  shimmer: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    bottom: -40,
    position: 'absolute',
    top: -40,
    width: 120,
  },
  content: {
    gap: 14,
    padding: 18,
    position: 'relative',
    zIndex: 2,
  },
  eyebrow: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  priceBadge: {
    alignItems: 'center',
    backgroundColor: colors.brandDark,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  priceBadgeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  statusCard: {
    backgroundColor: 'rgba(248, 250, 252, 0.92)',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillNow: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  statusPillLater: {
    backgroundColor: '#fdf2f8',
    borderColor: '#f9a8d4',
  },
  statusPillText: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusCopy: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },
  statusNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  warningCard: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  warningText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonFill: {
    flex: 1,
  },
});
