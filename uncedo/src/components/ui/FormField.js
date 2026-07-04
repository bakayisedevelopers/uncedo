import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/colors';

export function FormField({ label, error, inputStyle, ...props }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, error && styles.inputError, inputStyle]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#fafafa',
    minHeight: 48,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
