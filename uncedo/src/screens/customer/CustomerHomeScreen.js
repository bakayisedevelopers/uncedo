import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentPickerModal } from '../../components/student/AttachmentPickerModal';
import { MapPlaceholder } from '../../components/customer/MapPlaceholder';
import { RequestComposerSheet } from '../../components/customer/RequestComposerSheet';
import { JOB_REQUEST_SUGGESTIONS, MOCK_PROVIDER_MARKERS } from '../../constants/customer';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { getStudentOnboardingStatus } from '../../utils/onboarding';

export function CustomerHomeScreen({ navigate, openDrawer }) {
  const { user } = useAuth();
  const onboardingStatus = getStudentOnboardingStatus(user);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });

  const firstName = String(user?.fullName || user?.displayName || 'there').trim().split(' ')[0] || 'there';
  const disabledMessage = onboardingStatus.complete
    ? ''
    : 'Complete your profile and add a payment card before requesting help.';

  const providerMarkers = useMemo(() => MOCK_PROVIDER_MARKERS, []);

  const openRequestThread = () => {
    const trimmedText = requestText.trim();
    if (!trimmedText && !attachments.length) return;

        navigate({
      key: 'JobRequestThread',
      params: {
        parentTab: 'CustomerHome',
        draftText: trimmedText || 'I need help with dishes.',
        draftAttachments: attachments,
      },
    });
  };

  return (
    <View style={styles.screen}>
      <MapPlaceholder
        markers={providerMarkers}
        offset={mapOffset}
        zoom={mapZoom}
        onPan={(dx, dy) => setMapOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))}
        onZoomIn={() => setMapZoom((prev) => Math.min(1.35, prev + 0.08))}
        onZoomOut={() => setMapZoom((prev) => Math.max(0.9, prev - 0.08))}
      />

      <View style={styles.topControls}>
        <Pressable accessibilityRole="button" onPress={openDrawer} style={styles.iconButton}>
          <Ionicons color={colors.text} name="menu" size={22} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => navigate('SafetyLegal')} style={styles.iconButton}>
          <Ionicons color={colors.text} name="shield-checkmark-outline" size={21} />
        </Pressable>
      </View>

      <View style={styles.heroCopy}>
        <Text style={styles.kicker}>Welcome back</Text>
        <Text style={styles.title}>Hi {firstName}</Text>
        <Text style={styles.subtitle}>Tell us what you need help with and we&apos;ll guide the next step.</Text>
        {pickerError ? <Text style={styles.errorText}>{pickerError}</Text> : null}
      </View>

      <View style={styles.bottomSheetWrap}>
        <RequestComposerSheet
          attachments={attachments}
          disabled={!onboardingStatus.complete}
          disabledMessage={disabledMessage}
          expanded={composerExpanded}
          onChangeText={setRequestText}
          onExpand={() => setComposerExpanded(true)}
          onOpenGallery={() => setPickerVisible(true)}
          onRemoveAttachment={(index) => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
          onSelectSuggestion={(suggestion) => {
            setComposerExpanded(true);
            setRequestText(suggestion);
          }}
          onSubmit={openRequestThread}
          suggestions={JOB_REQUEST_SUGGESTIONS}
          value={requestText}
        />
      </View>

      <AttachmentPickerModal
        mode="library"
        onCancel={() => setPickerVisible(false)}
        onError={(message) => {
          setPickerVisible(false);
          setPickerError(message);
        }}
        onFilesSelected={(files) => {
          setPickerVisible(false);
          setPickerError('');
          setComposerExpanded(true);
          setAttachments((prev) => [...prev, ...(Array.isArray(files) ? files : [])]);
        }}
        visible={pickerVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#e7f1ec',
    flex: 1,
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 16,
    position: 'absolute',
    right: 16,
    top: 16,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 999,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroCopy: {
    left: 16,
    position: 'absolute',
    right: 90,
    top: 86,
  },
  kicker: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 4,
  },
  subtitle: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 6,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  bottomSheetWrap: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
