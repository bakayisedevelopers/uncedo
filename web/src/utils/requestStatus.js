import { REQUEST_STATUS, SESSION_STATUS } from '../constants/lifecycle';

export const REQUEST_STATUSES = {
  ...REQUEST_STATUS,
  WAITING_STUDENT: SESSION_STATUS.WAITING_STUDENT,
  IN_PROGRESS: SESSION_STATUS.IN_PROGRESS,
};

export const statusConfig = {
  [REQUEST_STATUSES.PENDING]: {
    label: 'Pending',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  [REQUEST_STATUSES.MATCHING]: {
    label: 'Matching Tutors',
    className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  [REQUEST_STATUSES.OFFERED]: {
    label: 'Tutor Offer Sent',
    className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  [REQUEST_STATUSES.ACCEPTED]: {
    label: 'Accepted',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  [REQUEST_STATUSES.WAITING_STUDENT]: {
    label: 'Waiting Student',
    className: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  },
  [REQUEST_STATUSES.IN_PROGRESS]: {
    label: 'In Progress',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  [REQUEST_STATUSES.COMPLETED]: {
    label: 'Completed',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  [REQUEST_STATUSES.CANCELED]: {
    label: 'Canceled',
    className: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
  [REQUEST_STATUSES.CANCELED_DURING]: {
    label: 'Canceled During Class',
    className: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
  [REQUEST_STATUSES.EXPIRED]: {
    label: 'Expired',
    className: 'bg-zinc-500/10 text-zinc-500 border-zinc-300',
  },
  [REQUEST_STATUSES.NO_TUTOR_AVAILABLE]: {
    label: 'No Tutor Available',
    className: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  },
  [REQUEST_STATUSES.IN_SESSION]: {
    label: 'In Session',
    className: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  },
};
