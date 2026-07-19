import { recordCustomerServiceEvent } from '../customerRecommendationService';

export async function recordRewardUiEvent(customerId, eventType, metadata = {}) {
  if (!customerId || !eventType) {
    return null;
  }

  return recordCustomerServiceEvent({
    customerId,
    eventType: String(eventType || '').trim().toLowerCase(),
    source: 'rewards',
    metadata,
  }).catch(() => null);
}
