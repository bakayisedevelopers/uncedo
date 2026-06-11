import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AttachmentPickerModal } from '../../components/student/AttachmentPickerModal';
import { MapPlaceholder } from '../../components/customer/MapPlaceholder';
import { RequestComposerSheet } from '../../components/customer/RequestComposerSheet';
import { JOB_REQUEST_SUGGESTIONS, MOCK_PROVIDER_MARKERS } from '../../constants/customer';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { getStudentOnboardingStatus } from '../../utils/onboarding';

export function CustomerHomeScreen({ navigate, route, bottomInset = 0 }) {
  const { user } = useAuth();
  const onboardingStatus = getStudentOnboardingStatus(user);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const lastDraftSignatureRef = useRef('');

  const draftText = String(route?.params?.draftText || '').trim();
  const draftAttachments = route?.params?.draftAttachments;

  useEffect(() => {
    const attachmentsDraft = Array.isArray(draftAttachments) ? draftAttachments : [];
    const signature = [draftText, attachmentsDraft.length].join('::');
    if (!draftText && !attachmentsDraft.length) {
      lastDraftSignatureRef.current = '';
      return;
    }
    if (lastDraftSignatureRef.current === signature) {
      return;
    }

    lastDraftSignatureRef.current = signature;
    if (draftText) {
      setRequestText(draftText);
      setComposerExpanded(true);
    }
    if (attachmentsDraft.length) {
      setAttachments(attachmentsDraft);
      setComposerExpanded(true);
    }
  }, [draftAttachments, draftText]);

  const firstName = String(user?.fullName || user?.displayName || 'there').trim().split(' ')[0] || 'there';
  const disabledMessage = onboardingStatus.complete
    ? ''
    : 'Profile not completed. Complete your profile and add a payment card before requesting help.';

  const providerMarkers = useMemo(() => MOCK_PROVIDER_MARKERS, []);
  const composerOffset = bottomInset + 12;
  const mapUiBottomInset = composerOffset + (composerExpanded ? 344 : 184);

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
        floatingBottomInset={mapUiBottomInset}
        markers={providerMarkers}
        offset={mapOffset}
        zoom={mapZoom}
        onPan={(dx, dy) => setMapOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))}
        onZoomIn={() => setMapZoom((prev) => Math.min(1.35, prev + 0.08))}
        onZoomOut={() => setMapZoom((prev) => Math.max(0.9, prev - 0.08))}
      />

      <View style={styles.heroCopy}>
        <Text style={styles.kicker}>Welcome back</Text>
        <Text style={styles.title}>Hi {firstName}</Text>
        <Text style={styles.subtitle}>Tell us what you need help with and we&apos;ll guide the next step.</Text>
        {pickerError ? <Text style={styles.errorText}>{pickerError}</Text> : null}
      </View>

      <View style={[styles.bottomSheetWrap, { bottom: composerOffset }]}>
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
          placeholder={onboardingStatus.complete ? 'Describe what help you need' : 'Profile not completed'}
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
  heroCopy: {
    left: 16,
    position: 'absolute',
    right: 16,
    top: 28,
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
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
