import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';

export function CustomerCallToActionSheet({
  disabled = false,
  hasActiveRequest = false,
  label = '',
  onPress,
}) {
  const buttonLabel = String(label || '').trim() || (hasActiveRequest ? 'Track Active Request' : 'Describe what you want');

  return (
    <View style={styles.sheet}>
      <Button
        disabled={disabled}
        icon={<Ionicons color="#ffffff" name={hasActiveRequest ? 'map-outline' : 'chatbubble-ellipses'} size={18} />}
        onPress={onPress}
        style={hasActiveRequest ? styles.trackButton : styles.callButton}
      >
        {buttonLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  callButton: {
    borderColor: '#f9a8d4',
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 58,
    shadowColor: 'rgba(236,72,153,0.18)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  trackButton: {
    borderColor: '#be185d',
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 58,
    shadowColor: 'rgba(190,24,93,0.18)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
});
