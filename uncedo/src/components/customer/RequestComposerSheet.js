import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { colors } from '../../theme/colors';

export function RequestComposerSheet({
  expanded = false,
  value = '',
  firstName = 'there',
  placeholder = 'Describe what help you need',
  attachments = [],
  suggestions = [],
  disabled = false,
  disabledMessage = '',
  errorMessage = '',
  onHeightChange,
  onExpand,
  onChangeText,
  onSelectSuggestion,
  onOpenGallery,
  onRemoveAttachment,
  onSubmit,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [inputHeight, setInputHeight] = useState(42);
  const canSubmit = Boolean(value.trim() || attachments.length) && !disabled;
  const maxSheetHeight = Math.max(280, windowHeight - 24);
  const maxInputHeight = Math.max(140, maxSheetHeight - (expanded ? 240 : 140));
  const resolvedInputHeight = Math.min(Math.max(inputHeight, expanded ? 90 : 42), maxInputHeight);

  return (
    <View
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[styles.sheet, { maxHeight: maxSheetHeight }, expanded && styles.sheetExpanded]}
    >
      <View style={styles.handle} />
      <Text style={styles.greeting}>Hi {firstName}</Text>
      <Text style={styles.title}>Tell us what you need help with</Text>
      <View
        style={[styles.inputShell, expanded && styles.inputShellExpanded, disabled && styles.inputShellDisabled]}
      >
        <TextInput
          editable={!disabled}
          multiline
          onContentSizeChange={(event) => setInputHeight(event.nativeEvent.contentSize.height)}
          onFocus={() => onExpand?.()}
          onChangeText={onChangeText}
          onPressIn={() => onExpand?.()}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          scrollEnabled={resolvedInputHeight >= maxInputHeight}
          style={[styles.input, { height: resolvedInputHeight }, expanded && styles.inputExpanded]}
          textAlignVertical="top"
          value={value}
        />
        <Pressable accessibilityRole="button" disabled={disabled} onPress={onOpenGallery} style={styles.uploadButton}>
          <Ionicons color={colors.brandDark} name="image-outline" size={18} />
          <Text style={styles.uploadLabel}>Add photo</Text>
        </Pressable>
      </View>

      {attachments.length ? (
        <ScrollView contentContainerStyle={styles.previewRow} horizontal showsHorizontalScrollIndicator={false}>
          {attachments.map((attachment, index) => (
            <View key={`${attachment.name || 'attachment'}-${index}`} style={styles.previewCard}>
              {attachment.dataUrl ? (
                <Image source={{ uri: attachment.dataUrl }} style={styles.previewImage} />
              ) : (
                <View style={styles.previewFallback}>
                  <Ionicons color={colors.brandDark} name="document-outline" size={20} />
                </View>
              )}
              <Pressable accessibilityRole="button" onPress={() => onRemoveAttachment?.(index)} style={styles.previewRemove}>
                <Ionicons color="#ffffff" name="close" size={12} />
              </Pressable>
              <Text numberOfLines={1} style={styles.previewName}>{attachment.name || `Image ${index + 1}`}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {expanded ? (
        <>
          <View style={styles.suggestionWrap}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onSelectSuggestion?.(suggestion)}
                style={styles.suggestionChip}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </Pressable>
            ))}
          </View>

          {disabledMessage ? <Text style={styles.disabledMessage}>{disabledMessage}</Text> : null}
          {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

          <Button
            disabled={!canSubmit}
            icon={<Ionicons color="#ffffff" name="arrow-forward" size={18} />}
            onPress={onSubmit}
            style={styles.submitButton}
          >
            Open request thread
          </Button>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    gap: 12,
    minHeight: 172,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 22,
  },
  sheetExpanded: {
    minHeight: 332,
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
  inputShell: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  inputShellExpanded: {
    minHeight: 138,
  },
  inputShellDisabled: {
    opacity: 0.68,
  },
  input: {
    color: colors.text,
    fontSize: 15,
    minHeight: 42,
    padding: 0,
  },
  inputExpanded: {
    minHeight: 90,
  },
  uploadButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  uploadLabel: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  previewRow: {
    gap: 10,
    paddingRight: 8,
  },
  previewCard: {
    gap: 6,
    width: 86,
  },
  previewImage: {
    backgroundColor: '#e5e7eb',
    borderRadius: 18,
    height: 86,
    width: 86,
  },
  previewFallback: {
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    borderRadius: 18,
    height: 86,
    justifyContent: 'center',
    width: 86,
  },
  previewRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.82)',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
  },
  previewName: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#f4f4f5',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  disabledMessage: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  errorMessage: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  submitButton: {
    marginTop: 2,
  },
});
