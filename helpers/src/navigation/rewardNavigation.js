export function resolveHelperRewardNotificationRoute(notification = {}) {
  const targetPath = String(notification?.targetPath || '').trim().toLowerCase();
  const type = String(notification?.type || '').trim().toLowerCase();
  const metadata = notification?.metadata || {};
  const serviceId = String(notification?.serviceId || metadata?.serviceId || '').trim();

  if (targetPath.includes('/cash-payments') || type.includes('cash_payment_confirmation')) {
    return { key: 'CashPaymentConfirmations', params: { parentTab: 'Services' } };
  }

  if (targetPath.includes('/rewards/history') || type.includes('reversal') || type.includes('points_expired')) {
    return { key: 'HelperRewardHistory', params: { parentTab: 'Profile' } };
  }
  if (targetPath.includes('/rewards/referrals') || type.includes('referral')) {
    return { key: 'HelperReferrals', params: { parentTab: 'Profile' } };
  }
  if (targetPath.includes('/rewards/membership') || type.includes('membership')) {
    return { key: 'HelperMembership', params: { parentTab: 'Profile' } };
  }
  if (targetPath.includes('/rewards/mastery') || type.includes('mastery')) {
    return { key: serviceId ? 'HelperServiceMasteryDetails' : 'HelperServiceMasteryOverview', params: { parentTab: 'Profile', ...(serviceId ? { serviceId } : {}) } };
  }
  if (targetPath.includes('/rewards/ratings') || type.includes('rating')) {
    return { key: 'HelperRatingSummary', params: { parentTab: 'Profile' } };
  }
  if (targetPath.includes('/rewards') || type.includes('reward') || type.includes('points') || type.includes('campaign')) {
    return { key: 'HelperRewardsOverview', params: { parentTab: 'Profile' } };
  }
  return { key: 'Home', params: {} };
}
