import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AttachmentPickerModal } from '../../components/customer/AttachmentPickerModal';
import { MapPlaceholder } from '../../components/customer/MapPlaceholder';
import { RequestComposerSheet } from '../../components/customer/RequestComposerSheet';
import { JOB_REQUEST_SUGGESTIONS, MOCK_PROVIDER_MARKERS } from '../../constants/customer';
import { useAuth } from '../../context/AuthContext';
import { getCustomerOnboardingStatus } from '../../utils/onboarding';

export function CustomerHomeScreen({
  navigate,
  route,
  bottomInset = 0,
  bottomNavVisible = true,
  onBottomNavVisibilityChange,
}) {
  const { user } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const onboardingStatus = getCustomerOnboardingStatus(user);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [composerHeight, setComposerHeight] = useState(0);
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
  const androidStatusBarInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const effectiveBottomInset = bottomNavVisible ? bottomInset : 0;
  const composerOffset = effectiveBottomInset;
  const mapUiBottomInset = composerOffset + composerHeight + 16;

  useEffect(() => {
    if (!onBottomNavVisibilityChange || !windowHeight || !composerHeight) {
      return;
    }

    const availableHeight = windowHeight - androidStatusBarInset;
    const shouldHideBottomNav = composerHeight >= availableHeight - 40;
    const shouldShowBottomNav = composerHeight <= availableHeight - bottomInset - 120;

    if (shouldHideBottomNav && bottomNavVisible) {
      onBottomNavVisibilityChange(false);
    } else if (shouldShowBottomNav && !bottomNavVisible) {
      onBottomNavVisibilityChange(true);
    }
  }, [
    androidStatusBarInset,
    bottomInset,
    bottomNavVisible,
    composerHeight,
    onBottomNavVisibilityChange,
    windowHeight,
  ]);

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

      <View style={[styles.bottomSheetWrap, { bottom: composerOffset }]}>
        <RequestComposerSheet
          attachments={attachments}
          disabled={!onboardingStatus.complete}
          disabledMessage={disabledMessage}
          firstName={firstName}
          expanded={composerExpanded}
          errorMessage={pickerError}
          onChangeText={setRequestText}
          onHeightChange={setComposerHeight}
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
  bottomSheetWrap: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
