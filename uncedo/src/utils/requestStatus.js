const STATUS_META = {
  pending: { label: 'Pending', tone: 'warning' },
  matching: { label: 'Matching Tutors', tone: 'success' },
  offered: { label: 'Tutor Offer Sent', tone: 'success' },
  accepted: { label: 'Accepted', tone: 'success' },
  waiting_student: { label: 'Waiting Student', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'success' },
  in_session: { label: 'In Session', tone: 'info' },
  completed: { label: 'Completed', tone: 'info' },
  canceled: { label: 'Canceled', tone: 'danger' },
  canceled_during: { label: 'Canceled During Class', tone: 'danger' },
  expired: { label: 'Expired', tone: 'info' },
  no_tutor_available: { label: 'No Tutor Available', tone: 'danger' },
};

export const ACTIVE_REQUEST_STATUSES = [
  'pending',
  'matching',
  'offered',
  'accepted',
  'waiting_student',
  'in_progress',
  'in_session',
];

export const JOINABLE_REQUEST_STATUSES = [
  'accepted',
  'waiting_student',
  'in_progress',
  'in_session',
];

export const TERMINAL_REQUEST_STATUSES = [
  'completed',
  'canceled',
  'canceled_during',
  'expired',
  'no_tutor_available',
];

export function getRequestStatusMeta(status) {
  return STATUS_META[String(status || '').toLowerCase()] || {
    label: String(status || 'Pending').replace(/_/g, ' '),
    tone: 'info',
  };
}

export function getRequestLifecycleLabel(status) {
  const normalized = String(status || '').toLowerCase();

  if (['pending', 'matching', 'offered'].includes(normalized)) {
    return 'Searching for tutor';
  }

  if (JOINABLE_REQUEST_STATUSES.includes(normalized)) {
    return normalized === 'accepted' ? 'Tutor found' : 'Class ready';
  }

  if (normalized === 'no_tutor_available') {
    return 'No tutor available';
  }

  if (normalized === 'completed') {
    return 'Class completed';
  }

  if (['canceled', 'canceled_during', 'expired'].includes(normalized)) {
    return 'Request closed';
  }

  return 'Request update';
}

export function isRequestJoinable(status) {
  return JOINABLE_REQUEST_STATUSES.includes(String(status || '').toLowerCase());
}
