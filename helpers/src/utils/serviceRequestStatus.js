const STATUS_META = {
  collecting_details: {
    label: 'Collecting details',
    badge: 'Live intake in progress',
    tone: 'info',
    title: 'Collecting request details',
    description: 'The customer is still completing the request before dispatch begins.',
  },
  matching: {
    label: 'Searching for helper',
    badge: 'Matching in progress',
    tone: 'success',
    title: 'Searching for a helper',
    description: 'The request is waiting for a helper match.',
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
    description: 'The customer request is waiting for a helper response.',
  },
  no_helper_available: {
    label: 'Searching for helper',
    badge: 'Still matching',
    tone: 'warning',
    title: 'Still searching for a helper',
    description: 'No helper accepted yet. Matching will continue as more helpers come online.',
  },
  accepted: {
    label: 'Accepted',
    badge: 'Helper confirmed',
    tone: 'success',
    title: 'Helper accepted this request',
    description: 'The request has been accepted and is ready to move into travel.',
  },
  en_route: {
    label: 'On the way',
    badge: 'Travel in progress',
    tone: 'success',
    title: 'Helper is on the way',
    description: 'The helper is travelling to the service location.',
  },
  arrived: {
    label: 'Arrived',
    badge: 'Helper arrived',
    tone: 'success',
    title: 'Helper has arrived',
    description: 'The helper has reached the location and is ready to begin.',
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
    backgroundColor: '#fce7f3',
    textColor: '#9d174d',
  },
  success: {
    backgroundColor: '#dcfce7',
    textColor: '#166534',
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
    description: 'This request is still being processed.',
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
