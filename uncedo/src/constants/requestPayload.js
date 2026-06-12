export const SERVICE_REQUEST_PAYLOAD_FIELDS = [
  'categoryId',
  'serviceIds',
  'summary',
  'conversationTranscript',
  'structuredAnswers',
  'selectedPortfolioReferences',
  'attachments',
  'pricingSnapshot',
  'timingPreference',
  'scheduledForText',
  'location',
  'serviceAddress',
  'safetyFlags',
];

export const DEFAULT_SERVICE_REQUEST_DRAFT = {
  categoryId: '',
  serviceIds: [],
  summary: '',
  conversationTranscript: [],
  structuredAnswers: {},
  selectedPortfolioReferences: [],
  attachments: [],
  pricingSnapshot: null,
  timingPreference: 'now',
  scheduledForText: '',
  location: null,
  serviceAddress: '',
  safetyFlags: [],
};

export function createServiceRequestDraft(overrides = {}) {
  return {
    ...DEFAULT_SERVICE_REQUEST_DRAFT,
    ...overrides,
    serviceIds: Array.isArray(overrides.serviceIds) ? overrides.serviceIds : DEFAULT_SERVICE_REQUEST_DRAFT.serviceIds,
    conversationTranscript: Array.isArray(overrides.conversationTranscript)
      ? overrides.conversationTranscript
      : DEFAULT_SERVICE_REQUEST_DRAFT.conversationTranscript,
    selectedPortfolioReferences: Array.isArray(overrides.selectedPortfolioReferences)
      ? overrides.selectedPortfolioReferences
      : DEFAULT_SERVICE_REQUEST_DRAFT.selectedPortfolioReferences,
    attachments: Array.isArray(overrides.attachments) ? overrides.attachments : DEFAULT_SERVICE_REQUEST_DRAFT.attachments,
    structuredAnswers: overrides.structuredAnswers && typeof overrides.structuredAnswers === 'object'
      ? overrides.structuredAnswers
      : DEFAULT_SERVICE_REQUEST_DRAFT.structuredAnswers,
    safetyFlags: Array.isArray(overrides.safetyFlags) ? overrides.safetyFlags : DEFAULT_SERVICE_REQUEST_DRAFT.safetyFlags,
  };
}
