import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { colors } from '../../theme/colors';

export function CustomerCallToActionSheet({
  disabled = false,
  disabledMessage = '',
  firstName = 'there',
  onPress,
}) {
  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <Text style={styles.greeting}>Hi {firstName}</Text>
      <Text style={styles.title}>Tell us what help you need</Text>
      <Text style={styles.copy}>
        Start a live request call. We will ask questions, identify the right category and service, and prepare your request.
      </Text>

      <Button
        disabled={disabled}
        icon={<Ionicons color="#ffffff" name="call" size={18} />}
        onPress={onPress}
        style={styles.callButton}
      >
        Call for help
      </Button>

      {disabledMessage ? <Text style={styles.disabledMessage}>{disabledMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    gap: 12,
    minHeight: 212,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 22,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#d4d4d8',
    borderRadius: 999,
    height: 5,
    width: 54,
  },
  greeting: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  callButton: {
    marginTop: 4,
  },
  disabledMessage: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
});
