import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { logInfo } from '../../services/logger';
import { colors } from '../../theme/colors';
import { formatCurrency } from '../../utils/payouts';
import { ActionButton } from './HelperUi';

function getCountdownColor(secondsLeft) {
  if (secondsLeft <= 10) return '#ef4444';
  if (secondsLeft <= 20) return '#f59e0b';
  return '#22c55e';
}

export function HelperOfferOverlay({ bottomSafeInset = 0 }) {
  const { user } = useAuth();
  const { onboardingStatus, jobOffers, activeJob, offerResponseState, actions } = useHelpersApp();
  const [now, setNow] = useState(Date.now());
  const shimmer = useRef(new Animated.Value(0)).current;

  const visibleOffers = useMemo(() => (
    (Array.isArray(jobOffers) ? jobOffers : []).filter((offer) => (
      !offer?.offerExpiresAt || Number(offer.offerExpiresAt) > now
    ))
  ), [jobOffers, now]);
  const activeOffer = visibleOffers[0] || null;
  const canRespond = Boolean(user?.uid && onboardingStatus.complete && !activeJob);
  const isProcessingOffer = activeOffer?.id && offerResponseState.offerId === activeOffer.id;
  const isAccepting = isProcessingOffer && offerResponseState.action === 'accept';
  const isDeclining = isProcessingOffer && offerResponseState.action === 'decline';
  const isDeclineInProgress = Boolean(offerResponseState.offerId && offerResponseState.action === 'decline');

  useEffect(() => {
    if (!activeOffer?.offerExpiresAt) {
      return () => {};
    }

    const timer = setInterval(() => setNow(Date.now()), 100);
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
  const isExpired = Boolean(activeOffer?.offerExpiresAt) && secondsLeft <= 0;
  const offerTimingLabel = activeOffer?.timingPreference === 'later' ? 'Later' : 'Now';
  const offerPrice = formatCurrency(activeOffer?.payoutEstimate);
  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-280, 280],
  });

  useEffect(() => {
    logInfo('HelperOfferOverlay.state', 'Evaluated helper offer overlay state.', {
      helperId: user?.uid || null,
      onboardingComplete: Boolean(onboardingStatus.complete),
      jobOffersCount: Array.isArray(jobOffers) ? jobOffers.length : 0,
      visibleOffersCount: visibleOffers.length,
      activeOfferId: activeOffer?.id || null,
      activeJobId: activeJob?.id || null,
      canRespond,
      isProcessingOffer: Boolean(isProcessingOffer),
      isDeclining: Boolean(isDeclining),
      isDeclineInProgress: Boolean(isDeclineInProgress),
      isExpired: Boolean(isExpired),
      secondsLeft,
      bottomSafeInset,
    });
  }, [
    activeJob?.id,
    activeOffer?.id,
    bottomSafeInset,
    canRespond,
    isDeclineInProgress,
    isDeclining,
    isExpired,
    isProcessingOffer,
    jobOffers,
    onboardingStatus.complete,
    secondsLeft,
    user?.uid,
    visibleOffers.length,
  ]);

  if (!activeOffer || isDeclining || isDeclineInProgress || isExpired) return null;

  return (
    <View pointerEvents="box-none" style={[styles.portal, { paddingBottom: Math.max(0, Number(bottomSafeInset || 0)) }]}>
      <View pointerEvents="none" style={styles.backdrop} />
      <View style={[styles.sheetWrap, { paddingBottom: Math.max(0, Number(bottomSafeInset || 0)) }]}>
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

            <View style={[styles.statusCard, activeOffer.timingPreference === 'later' ? styles.statusCardLater : styles.statusCardNow]}>
              <View style={[styles.statusPill, activeOffer.timingPreference === 'later' ? styles.statusPillLater : styles.statusPillNow]}>
                <Text style={styles.statusPillText}>{offerTimingLabel}</Text>
              </View>
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
                label={isAccepting ? 'Accepting...' : isDeclining ? 'Processing...' : 'Accept'}
                onPress={() => actions.acceptOffer(activeOffer.id)}
                disabled={!canRespond || secondsLeft <= 0 || isProcessingOffer}
                style={styles.buttonFill}
              />
              <ActionButton
                label={isDeclining ? 'Declining...' : isAccepting ? 'Processing...' : 'Decline'}
                tone="secondary"
                onPress={() => actions.declineOffer(activeOffer.id)}
                disabled={!canRespond || secondsLeft <= 0 || isProcessingOffer}
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
    zIndex: 999,
    elevation: 999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
  },
  sheetWrap: {
    paddingHorizontal: 0,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
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
  statusCard: {
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
  },
  statusCardNow: {
    borderColor: '#86efac',
  },
  statusCardLater: {
    borderColor: '#86efac',
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPillNow: {
    backgroundColor: 'transparent',
  },
  statusPillLater: {
    backgroundColor: 'transparent',
  },
  statusPillText: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
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
