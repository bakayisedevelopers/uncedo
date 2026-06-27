const STATUS_META = {
  collecting_details: {
    label: 'Collecting details',
    badge: 'Live intake in progress',
    tone: 'info',
    title: 'Collecting your request details',
    description: 'Uncedo AI is confirming your category, service, and any details needed for pricing and matching.',
  },
  matching: {
    label: 'Searching for helper',
    badge: 'Matching in progress',
    tone: 'success',
    title: 'Searching for a helper',
    description: 'We are checking available helpers who can handle this service.',
  },
  scheduled_pending: {
    label: 'Scheduled',
    badge: 'Scheduled for later',
    tone: 'info',
    title: 'Scheduled service request',
    description: 'This request is approved and scheduled for a later time.',
  },
  helper_found: {
    label: 'Helper found',
    badge: 'Waiting for helper',
    tone: 'success',
    title: 'Helper found',
    description: 'We found a suitable helper and are waiting for a response.',
  },
  no_helper_available: {
    label: 'No helpers available',
    badge: 'Availability update',
    tone: 'warning',
    title: 'No helpers are currently available',
    description: 'There is no helper available for this request right now. We will retry as availability changes.',
  },
  accepted: {
    label: 'Accepted',
    badge: 'Helper confirmed',
    tone: 'success',
    title: 'Helper accepted your request',
    description: 'Your helper has accepted and is getting ready to come to you.',
  },
  en_route: {
    label: 'On the way',
    badge: 'Travel in progress',
    tone: 'success',
    title: 'Helper is on the way',
    description: 'Your helper is travelling to the service location.',
  },
  arrived: {
    label: 'Arrived',
    badge: 'Helper arrived',
    tone: 'success',
    title: 'Helper has arrived',
    description: 'Your helper has reached the location and is ready to begin.',
  },
  completed: {
    label: 'Completed',
    badge: 'Service complete',
    tone: 'info',
    title: 'Service completed',
    description: 'The service has been marked as completed.',
  },
  canceled: {
    label: 'Canceled',
    badge: 'Request closed',
    tone: 'danger',
    title: 'Request canceled',
    description: 'This service request was canceled.',
  },
  expired: {
    label: 'Expired',
    badge: 'Request closed',
    tone: 'info',
    title: 'Request expired',
    description: 'This service request is no longer active.',
  },
};

const STATUS_SEQUENCE = ['collecting_details', 'scheduled_pending', 'matching', 'helper_found', 'accepted', 'en_route', 'arrived', 'completed'];

const TONE_STYLES = {
  info: {
    backgroundColor: '#e0f2fe',
    textColor: '#075985',
  },
  success: {
    backgroundColor: '#fae8ff',
    textColor: '#86198f',
  },
  danger: {
    backgroundColor: '#ffe4e6',
    textColor: '#be123c',
  },
  warning: {
    backgroundColor: '#fef3c7',
    textColor: '#92400e',
  },
};

export function getServiceRequestStatusMeta(status) {
  const normalized = String(status || '').toLowerCase();
  return STATUS_META[normalized] || {
    label: String(status || 'Pending').replace(/_/g, ' '),
    badge: 'Request update',
    tone: 'info',
    title: 'Service request update',
    description: 'Your request is still being processed.',
  };
}

export function getServiceRequestToneStyle(status) {
  const tone = getServiceRequestStatusMeta(status).tone;
  return TONE_STYLES[tone] || TONE_STYLES.info;
}

export function getServiceRequestProgress(status) {
  const normalized = String(status || '').toLowerCase() === 'no_helper_available'
    ? 'matching'
    : String(status || '').toLowerCase();
  const currentIndex = STATUS_SEQUENCE.indexOf(normalized);
  return STATUS_SEQUENCE.map((step, index) => ({
    id: step,
    label: getServiceRequestStatusMeta(step).label,
    state: currentIndex === -1
      ? (step === 'collecting_details' ? 'current' : 'upcoming')
      : index < currentIndex
        ? 'complete'
        : index === currentIndex
          ? 'current'
          : 'upcoming',
  }));
}

export function formatMissingRequirementLabel(requirementId) {
  const normalized = String(requirementId || '').trim().toLowerCase();
  if (!normalized) return 'More details are still needed';
  if (normalized === 'category') return 'Pick the service category';
  if (normalized === 'service') return 'Pick at least one service';
  return normalized.replace(/_/g, ' ');
}

export function getCallStatusMeta(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'dialing') {
    return { label: 'Dialing...', detail: 'Starting your live call with Uncedo AI.' };
  }
  if (normalized === 'connected') {
    return { label: 'Connected', detail: 'The call is live. You can start speaking.' };
  }
  if (normalized === 'listening') {
    return { label: 'Listening', detail: 'Uncedo AI is listening to your request.' };
  }
  if (normalized === 'processing') {
    return { label: 'Processing', detail: 'Uncedo is reviewing what you said and preparing the next response.' };
  }
  if (normalized === 'speaking') {
    return { label: 'AI speaking', detail: 'Uncedo AI is asking the next question.' };
  }
  if (normalized === 'searching') {
    return { label: 'Searching for helper...', detail: 'The request is complete and we are starting helper matching.' };
  }
  if (normalized === 'disconnected') {
    return { label: 'Disconnected', detail: 'The live connection dropped. Retry to continue your request.' };
  }
  if (normalized === 'ended') {
    return { label: 'Call ended', detail: 'The live call has ended.' };
  }
  return { label: String(status || 'Connecting'), detail: 'Preparing your request call.' };
}
