const SESSION_STATUS_META = {
  waiting_student: { label: 'Waiting Student', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'success' },
  in_session: { label: 'In Session', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  canceled: { label: 'Canceled', tone: 'danger' },
  canceled_during: { label: 'Canceled During Class', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const RATABLE_SESSION_STATUSES = [
  'completed',
  'canceled',
  'canceled_during',
];

export const LIVE_SESSION_STATUSES = [
  'waiting_student',
  'in_progress',
  'in_session',
];

export function getSessionStatusMeta(status) {
  return SESSION_STATUS_META[String(status || '').toLowerCase()] || {
    label: String(status || 'Scheduled').replace(/_/g, ' '),
    tone: 'info',
  };
}

export function isLiveSessionStatus(status) {
  return LIVE_SESSION_STATUSES.includes(String(status || '').toLowerCase());
}
