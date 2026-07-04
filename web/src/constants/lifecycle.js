export const REQUEST_STATUS = {
  PENDING: 'pending',
  MATCHING: 'matching',
  OFFERED: 'offered',
  ACCEPTED: 'accepted',
  IN_SESSION: 'in_session',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
  CANCELED_DURING: 'canceled_during',
  EXPIRED: 'expired',
  NO_TUTOR_AVAILABLE: 'no_tutor_available',
};

export const SESSION_STATUS = {
  WAITING_STUDENT: 'waiting_student',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
  CANCELED_DURING: 'canceled_during',
};

export const OFFER_TIMEOUT_SECONDS = 20;
export const OFFER_TIMEOUT_MS = OFFER_TIMEOUT_SECONDS * 1000;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  WALLET_DEBT_RECORDED: 'wallet_debt_recorded',
  FAILED: 'failed',
};

const requestTransitions = {
  [REQUEST_STATUS.PENDING]: [REQUEST_STATUS.MATCHING, REQUEST_STATUS.CANCELED, REQUEST_STATUS.EXPIRED],
  [REQUEST_STATUS.MATCHING]: [REQUEST_STATUS.OFFERED, REQUEST_STATUS.NO_TUTOR_AVAILABLE, REQUEST_STATUS.CANCELED, REQUEST_STATUS.EXPIRED],
  [REQUEST_STATUS.OFFERED]: [REQUEST_STATUS.ACCEPTED, REQUEST_STATUS.MATCHING, REQUEST_STATUS.CANCELED, REQUEST_STATUS.EXPIRED],
  [REQUEST_STATUS.ACCEPTED]: [REQUEST_STATUS.IN_SESSION, REQUEST_STATUS.CANCELED, REQUEST_STATUS.CANCELED_DURING],
  [REQUEST_STATUS.IN_SESSION]: [REQUEST_STATUS.COMPLETED, REQUEST_STATUS.CANCELED, REQUEST_STATUS.CANCELED_DURING],
  [REQUEST_STATUS.NO_TUTOR_AVAILABLE]: [REQUEST_STATUS.MATCHING, REQUEST_STATUS.CANCELED, REQUEST_STATUS.EXPIRED],
  [REQUEST_STATUS.EXPIRED]: [],
  [REQUEST_STATUS.CANCELED]: [],
  [REQUEST_STATUS.CANCELED_DURING]: [],
  [REQUEST_STATUS.COMPLETED]: [],
};

const sessionTransitions = {
  [SESSION_STATUS.WAITING_STUDENT]: [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.CANCELED, SESSION_STATUS.CANCELED_DURING],
  [SESSION_STATUS.IN_PROGRESS]: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELED, SESSION_STATUS.CANCELED_DURING],
  [SESSION_STATUS.CANCELED]: [],
  [SESSION_STATUS.CANCELED_DURING]: [],
  [SESSION_STATUS.COMPLETED]: [],
};

export function canTransitionRequest(fromStatus, toStatus) {
  if (!fromStatus || fromStatus === toStatus) return true;
  return (requestTransitions[fromStatus] || []).includes(toStatus);
}

export function canTransitionSession(fromStatus, toStatus) {
  if (!fromStatus || fromStatus === toStatus) return true;
  return (sessionTransitions[fromStatus] || []).includes(toStatus);
}

export function deriveRequestStatusFromSession(sessionStatus) {
  if (sessionStatus === SESSION_STATUS.WAITING_STUDENT || sessionStatus === SESSION_STATUS.IN_PROGRESS) {
    return REQUEST_STATUS.IN_SESSION;
  }

  if (sessionStatus === SESSION_STATUS.COMPLETED) {
    return REQUEST_STATUS.COMPLETED;
  }

  if (sessionStatus === SESSION_STATUS.CANCELED) {
    return REQUEST_STATUS.CANCELED;
  }

  if (sessionStatus === SESSION_STATUS.CANCELED_DURING) {
    return REQUEST_STATUS.CANCELED_DURING;
  }

  return null;
}
