export const MEETING_PROVIDERS = {
  ANY: 'any',
  WEBRTC: 'webrtc',
};

export const meetingProviderOptions = [
  { value: MEETING_PROVIDERS.ANY, label: 'Any provider' },
  { value: MEETING_PROVIDERS.WEBRTC, label: 'In-app call' },
];

export function getMeetingProviderLabel(value) {
  const found = meetingProviderOptions.find((option) => option.value === value);
  return found?.label || 'Not set';
}
