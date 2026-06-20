export const PLATFORM_FEE_RATE = 0.27;
export const HELPER_PAYOUT_RATE = 0.73;

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export function toDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

export function formatDate(value) {
  const parsed = toDateValue(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
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

export function getPayoutTone(status) {
  const normalized = String(status || 'unpaid').toLowerCase();
  if (normalized === 'paid') return 'success';
  if (normalized === 'processing') return 'warning';
  if (normalized === 'failed' || normalized === 'unsuccessful') return 'danger';
  return 'neutral';
}

export function computeJobAmounts(job) {
  const totalAmount = Number(job?.totalAmount || 0);
  const helperAmount = Number((totalAmount * HELPER_PAYOUT_RATE).toFixed(2));
  const platformAmount = Number((totalAmount * PLATFORM_FEE_RATE).toFixed(2));

  return {
    totalAmount,
    helperAmount,
    platformAmount,
  };
}

export function groupCompletedJobsByWeek(jobs = [], weeklyPayouts = []) {
  const payoutByWeek = weeklyPayouts.reduce((acc, item) => {
    acc[item.weekKey] = item;
    return acc;
  }, {});

  const grouped = new Map();

  jobs.forEach((job) => {
    const completedDate = toDateValue(job.completedAt || job.updatedAt || job.createdAt);
    if (!completedDate) return;

    const weekKey = getWeekKey(completedDate);
    const { weekStart, weekEnd } = getWeekRange(completedDate);
    const payoutRecord = payoutByWeek[weekKey] || null;
    const existing = grouped.get(weekKey) || {
      weekKey,
      weekStart,
      weekEnd,
      jobs: [],
      totalJobs: 0,
      grossAmount: 0,
      helperAmount: 0,
      platformAmount: 0,
      status: payoutRecord?.status || 'unpaid',
      notes: payoutRecord?.notes || '',
      paidAt: payoutRecord?.paidAt || null,
    };

    const amounts = computeJobAmounts(job);
    existing.jobs.push({
      ...job,
      completedDate,
      computedAmounts: amounts,
    });
    existing.totalJobs += 1;
    existing.grossAmount = Number((existing.grossAmount + amounts.totalAmount).toFixed(2));
    existing.helperAmount = Number((existing.helperAmount + amounts.helperAmount).toFixed(2));
    existing.platformAmount = Number((existing.platformAmount + amounts.platformAmount).toFixed(2));
    grouped.set(weekKey, existing);
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
    .map((group) => ({
      ...group,
      jobs: group.jobs.sort((a, b) => b.completedDate.getTime() - a.completedDate.getTime()),
    }));
}
