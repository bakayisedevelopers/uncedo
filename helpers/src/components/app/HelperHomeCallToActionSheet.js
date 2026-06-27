import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

function getSlideTone(isOnline, needsProfileCompletion) {
  if (needsProfileCompletion) {
    return {
      trackBackground: '#f1f5f9',
      fillBackground: '#f8fafc',
      borderColor: colors.border,
      textColor: colors.text,
      thumbBackground: '#ffffff',
      thumbColor: colors.muted,
      glowColor: 'rgba(148,163,184,0.22)',
    };
  }

  if (isOnline) {
    return {
      trackBackground: colors.brandSoft,
      fillBackground: colors.brand,
      borderColor: '#f9a8d4',
      textColor: colors.brandDark,
      thumbBackground: '#ffffff',
      thumbColor: colors.brandDark,
      glowColor: 'rgba(236,72,153,0.18)',
    };
  }

  return {
    trackBackground: colors.brandSoft,
    fillBackground: colors.brand,
    borderColor: '#f9a8d4',
    textColor: colors.brandDark,
    thumbBackground: '#ffffff',
    thumbColor: colors.brandDark,
    glowColor: 'rgba(236,72,153,0.18)',
  };
}

function SlideToToggle({
  disabled = false,
  isOnline = false,
  needsProfileCompletion = false,
  onComplete,
}) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const panX = useRef(new Animated.Value(0)).current;
  const startXRef = useRef(0);
  const thumbSize = 44;
  const thumbInset = 4;

  const tone = useMemo(() => getSlideTone(isOnline, needsProfileCompletion), [isOnline, needsProfileCompletion]);
  const maxTranslate = Math.max(0, layoutWidth - thumbSize - thumbInset);

  useEffect(() => {
    panX.stopAnimation((value) => {
      const reset = needsProfileCompletion ? 0 : (isOnline ? maxTranslate : 0);
      panX.setValue(reset || 0);
    });
  }, [isOnline, needsProfileCompletion, maxTranslate, panX]);

  const resetToCurrentState = () => {
    Animated.spring(panX, {
      toValue: isOnline ? maxTranslate : 0,
      useNativeDriver: false,
    }).start();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 5,
    onPanResponderGrant: () => {
      startXRef.current = isOnline ? maxTranslate : 0;
    },
    onPanResponderMove: (_, gestureState) => {
      if (disabled) return;
      const next = Math.max(0, Math.min(maxTranslate, startXRef.current + gestureState.dx));
      panX.setValue(next);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (disabled) return;
      if (needsProfileCompletion) {
        resetToCurrentState();
        return;
      }

      const threshold = Math.max(24, maxTranslate * 0.45);
      const shouldToggle = isOnline ? gestureState.dx < -threshold : gestureState.dx > threshold;
      const next = shouldToggle ? (isOnline ? 0 : maxTranslate) : startXRef.current;

      Animated.spring(panX, {
        toValue: next,
        useNativeDriver: false,
      }).start(() => {
        if (shouldToggle) {
          onComplete?.();
        }
      });
    },
    onPanResponderTerminate: () => {
      resetToCurrentState();
    },
  }), [disabled, isOnline, maxTranslate, needsProfileCompletion, onComplete, panX]);

  const promptText = needsProfileCompletion
    ? 'Complete your profile to go online'
    : isOnline
      ? 'Slide to go offline'
      : 'Slide to go online';

  return (
    <View
      onLayout={(event) => {
        setLayoutWidth(event.nativeEvent.layout.width);
      }}
      style={[
        styles.sliderTrack,
        { backgroundColor: tone.trackBackground, borderColor: tone.borderColor },
      ]}
    >
      <View style={styles.sliderFillWrap}>
        <Animated.View
          style={[
            styles.sliderFill,
            {
              backgroundColor: tone.fillBackground,
              width: panX.interpolate({
                inputRange: [0, Math.max(1, maxTranslate)],
                outputRange: [thumbInset + 12, Math.max(thumbSize, layoutWidth - thumbInset)],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      </View>

      <View style={styles.sliderContent}>
        <Text style={[styles.sliderLabel, { color: tone.textColor }]}>{promptText}</Text>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.sliderThumb,
          {
            backgroundColor: tone.thumbBackground,
            borderColor: tone.borderColor,
            shadowColor: tone.glowColor,
            transform: [{ translateX: panX }],
            width: thumbSize,
            height: thumbSize,
            top: thumbInset,
            left: thumbInset,
          },
        ]}
      >
        <Ionicons color={tone.thumbColor} name={isOnline ? 'power-outline' : 'arrow-forward'} size={18} />
      </Animated.View>
    </View>
  );
}

export function HelperHomeCallToActionSheet({
  disabled = false,
  needsProfileCompletion = false,
  isOnline = false,
  hasActiveJob = false,
  onPress,
  onGoToActiveJob,
}) {
  if (hasActiveJob) {
    return (
      <View style={styles.sheet}>
        <Pressable
          accessibilityRole="button"
          onPress={onGoToActiveJob}
          style={styles.activeJobButton}
        >
          <Ionicons color="#ffffff" name="briefcase" size={18} />
          <Text style={styles.activeJobButtonText}>Go to Existing Job</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.sheet}>
      <SlideToToggle
        disabled={disabled}
        isOnline={isOnline}
        needsProfileCompletion={needsProfileCompletion}
        onComplete={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  sliderTrack: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  sliderFillWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  sliderFill: {
    borderRadius: 24,
    height: '100%',
  },
  sliderContent: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 66,
    width: '100%',
  },
  sliderLabel: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  sliderThumb: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    position: 'absolute',
    top: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  activeJobButton: {
    backgroundColor: colors.brand || '#db2777',
    borderColor: '#f9a8d4',
    borderRadius: 24,
    borderWidth: 1,
    height: 58,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(236,72,153,0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  activeJobButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});
