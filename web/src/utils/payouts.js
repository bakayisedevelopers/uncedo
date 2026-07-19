import { PLATFORM_FEE_RATE, TUTOR_PAYOUT_RATE } from './onboarding';

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export function toDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value?.toDate === 'function') {
    const parsed = value.toDate();
    return Number.isNaN(parsed?.getTime?.()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getSessionCompletedDate(session) {
  return (
    toDateValue(session?.completedAt)
    || toDateValue(session?.endedAt)
    || toDateValue(session?.updatedAt)
    || toDateValue(session?.createdAt)
    || null
  );
}

export function getWeekRange(dateInput) {
  const date = toDateValue(dateInput) || new Date();
  const utcDay = date.getUTCDay();
  const dayOffsetFromMonday = (utcDay + 6) % 7;
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - dayOffsetFromMonday);
  const weekEnd = new Date(weekStart.getTime() + (6 * 24 * 60 * 60 * 1000));
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

export function getWeekKey(dateInput) {
  const { weekStart } = getWeekRange(dateInput);
  const thursday = new Date(weekStart.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4UtcDay = jan4.getUTCDay();
  const jan4Offset = (jan4UtcDay + 6) % 7;
  const firstWeekStart = new Date(Date.UTC(year, 0, 4 - jan4Offset));
  const weekNumber = Math.floor((weekStart.getTime() - firstWeekStart.getTime()) / WEEK_IN_MS) + 1;
  return `${year}-W${String(Math.max(weekNumber, 1)).padStart(2, '0')}`;
}

export function formatCurrency(amount, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export function formatWeekRangeLabel(weekStartInput, weekEndInput) {
  const weekStart = toDateValue(weekStartInput);
  const weekEnd = toDateValue(weekEndInput);
  if (!weekStart || !weekEnd) return 'Unknown week';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return `${formatter.format(weekStart)} - ${formatter.format(weekEnd)}`;
}

export function computeSessionAmounts(session) {
  const totalAmount = Number(
    session?.originalPrice
    ?? session?.pricingSnapshot?.originalPrice
    ?? session?.pricingSnapshot?.totalAmount
    ?? session?.totalAmount
    ?? 0,
  );
  const storedTutorAmount = Number(session?.payoutBreakdown?.tutorAmount);
  const storedPlatformAmount = Number(session?.payoutBreakdown?.platformAmount);

  if (Number.isFinite(storedTutorAmount) && Number.isFinite(storedPlatformAmount)) {
    return {
      totalAmount,
      tutorAmount: storedTutorAmount,
      platformAmount: storedPlatformAmount,
      usedStoredBreakdown: true,
    };
  }

  const tutorAmount = Number((totalAmount * TUTOR_PAYOUT_RATE).toFixed(2));
  const platformAmount = Number((totalAmount * PLATFORM_FEE_RATE).toFixed(2));

  return {
    totalAmount,
    tutorAmount,
    platformAmount,
    usedStoredBreakdown: false,
  };
}

export function getPayoutStatusBadgeClasses(status) {
  const normalized = String(status || 'unpaid').toLowerCase();
  if (normalized === 'paid') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
  if (normalized === 'processing') {
    return 'border-amber-300 bg-amber-50 text-amber-700';
  }
  if (normalized === 'unsuccessful' || normalized === 'failed') {
    return 'border-rose-300 bg-rose-50 text-rose-700';
  }
  return 'border-zinc-300 bg-zinc-100 text-zinc-700';
}

export function groupSessionsByWeek(sessions = []) {
  const map = new Map();

  sessions.forEach((session) => {
    const completedDate = getSessionCompletedDate(session);
    if (!completedDate) return;

    const weekKey = getWeekKey(completedDate);
    const { weekStart, weekEnd } = getWeekRange(completedDate);
    const existing = map.get(weekKey) || {
      weekKey,
      weekStart,
      weekEnd,
      sessions: [],
      totalSessions: 0,
      grossAmount: 0,
      tutorAmount: 0,
      platformAmount: 0,
    };

    const amounts = computeSessionAmounts(session);

    existing.sessions.push({
      ...session,
      completedDate,
      computedAmounts: amounts,
    });
    existing.totalSessions += 1;
    existing.grossAmount = Number((existing.grossAmount + amounts.totalAmount).toFixed(2));
    existing.tutorAmount = Number((existing.tutorAmount + amounts.tutorAmount).toFixed(2));
    existing.platformAmount = Number((existing.platformAmount + amounts.platformAmount).toFixed(2));

    map.set(weekKey, existing);
  });

  return Array.from(map.values())
    .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
    .map((item) => ({
      ...item,
      sessions: item.sessions.sort((a, b) => {
        const first = a.completedDate?.getTime?.() || 0;
        const second = b.completedDate?.getTime?.() || 0;
        return second - first;
      }),
    }));
}
