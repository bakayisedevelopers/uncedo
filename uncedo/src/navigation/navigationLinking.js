function parseRefCodeFromUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const code = (
      parsed.searchParams.get('ref')
      || parsed.searchParams.get('referral')
      || parsed.searchParams.get('referralCode')
      || parsed.searchParams.get('code')
      || null
    );
    return code ? String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null : null;
  } catch (error) {
    const match = String(url || '').match(/[?&](?:ref|referral|referralCode|code)=([^&#]+)/i);
    if (!match) {
      return null;
    }

    const raw = decodeURIComponent(match[1]);
    return raw ? raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null : null;
  }
}

export function resolveDeepLink(url) {
  if (!url) {
    return null;
  }

  // Referral signup links: https://uncedo.bakayise.com/signup?ref=CODE
  // or uncedo://signup?ref=CODE — route to Onboarding for pre-auth capture.
  const referralCode = parseRefCodeFromUrl(url);
  if (referralCode) {
    return { key: 'Onboarding', params: { pendingReferralCode: referralCode } };
  }

  const cleaned = String(url || '').replace(/^[a-z]+:\/\//i, '');
  const parts = cleaned.split('/').filter(Boolean);
  const host = String(parts[0] || '').toLowerCase();
  const firstPathSegment = parts[1] || '';

  if (host === 'service-request' && firstPathSegment) {
    return { key: 'ServiceRequestTracking', params: { requestId: firstPathSegment, parentTab: 'Requests' } };
  }

  if (host === 'session' && firstPathSegment) {
    return { key: 'SessionRoom', params: { sessionId: firstPathSegment, parentTab: 'Requests' } };
  }

  if (host === 'signup' || host === 'referral') {
    return null;
  }

  return null;
}

export function getParentTab(routeKey, params) {
  if (params?.parentTab) {
    return params.parentTab;
  }

  if (['ServiceRequestTracking', 'SessionRoom'].includes(routeKey)) {
    return 'Requests';
  }

  if (routeKey === 'JobRequestThread') {
    return 'CustomerHome';
  }

  if ([
    'CustomerRewardsOverview',
    'CustomerRewardHistory',
    'CustomerMembershipDetails',
    'CustomerReferrals',
    'CustomerHowToEarn',
    'CustomerRatingSummary',
    'CustomerServiceRatingDetails',
    'CustomerRedemptionPreview',
  ].includes(routeKey)) {
    return 'Profile';
  }

  if (['RequestStatus', 'RequestDetails', 'StudentRequests'].includes(routeKey)) {
    return 'Requests';
  }

  return routeKey;
}

export function resolveNotificationRoute(notification = {}) {
  const targetPath = String(notification?.targetPath || '').trim();
  const type = String(notification?.type || '').toLowerCase();
  const requestId = notification?.requestId || '';
  const sessionId = notification?.sessionId || '';
  const requestType = String(notification?.requestType || notification?.entityType || '').toLowerCase();

  if (targetPath.startsWith('/app/session/')) {
    const targetSessionId = targetPath.split('/app/session/')[1] || sessionId;
    return targetSessionId
      ? { key: 'SessionRoom', params: { sessionId: targetSessionId, parentTab: 'Requests' } }
      : { key: 'Requests', params: {} };
  }

  if (targetPath.startsWith('/service-request/')) {
    const targetRequestId = targetPath.split('/service-request/')[1] || requestId;
    return targetRequestId
      ? { key: 'ServiceRequestTracking', params: { requestId: targetRequestId, parentTab: 'Requests' } }
      : { key: 'Requests', params: {} };
  }

  if (targetPath.startsWith('/rewards/history')) {
    return { key: 'CustomerRewardHistory', params: {} };
  }

  if (targetPath.startsWith('/rewards/referrals')) {
    return { key: 'CustomerReferrals', params: {} };
  }

  if (targetPath.startsWith('/rewards/membership')) {
    return { key: 'CustomerMembershipDetails', params: {} };
  }

  if (targetPath.startsWith('/rewards/ratings')) {
    return { key: 'CustomerRatingSummary', params: {} };
  }

  if (targetPath.startsWith('/rewards')) {
    return { key: 'CustomerRewardsOverview', params: {} };
  }

  if (targetPath.includes('/student/payment') || type.includes('payment')) {
    return { key: 'Wallet', params: {} };
  }

  if (['points_earned', 'points_deducted', 'points_expired', 'reward_reversed'].includes(type)) {
    const reasonCode = String(notification?.metadata?.reasonCode || '').toLowerCase();
    if (reasonCode.includes('referral')) {
      return { key: 'CustomerReferrals', params: {} };
    }
    return { key: 'CustomerRewardsOverview', params: {} };
  }

  if (type.includes('membership')) {
    return { key: 'CustomerMembershipDetails', params: {} };
  }

  if (targetPath.includes('/student/requests') || type === 'lesson_completed' || type === 'session_completed') {
    return requestId
      ? { key: 'RequestStatus', params: { requestId, parentTab: 'Requests' } }
      : { key: 'Requests', params: {} };
  }

  if (sessionId) {
    return { key: 'SessionRoom', params: { sessionId, parentTab: 'Requests' } };
  }

  if (requestId) {
    return requestType === 'customer_service'
      ? { key: 'ServiceRequestTracking', params: { requestId, parentTab: 'Requests' } }
      : { key: 'RequestStatus', params: { requestId, parentTab: 'Requests' } };
  }

  return { key: 'CustomerHome', params: {} };
}
