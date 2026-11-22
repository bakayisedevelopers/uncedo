'use strict';

const resultSchema = (properties, required = []) => Object.freeze({
  type: 'object', additionalProperties: false,
  properties: Object.freeze(properties), required: Object.freeze(required),
});
const stringSchema = Object.freeze({ type: 'string' });

// Keep the WhatsApp model's callable surface intentionally small. Greetings
// and ordinary conversation are generated directly by the model and do not
// need a backend tool.
const TOOL_DEFINITIONS = Object.freeze({
  getMyProfile: {
    description: 'Read only the sender’s own saved profile details. For linked customers and helpers, this includes their name, email, contact and WhatsApp numbers, role, and helper verification status when applicable. For a guest customer, return only the saved preferred name, customer role, guest account type, and saved home address. Never return another person’s data, include the guest WhatsApp number, or imply a guest has linked-account details.',
    roles: ['guest', 'customer', 'helper'], auth: 'self-profile', fields: {},
    handler: 'getMyProfile', canonicalBackend: 'selfIdentityOrVerifiedLinkedProfileReader',
    outputSchema: resultSchema({
      firstName: stringSchema,
      lastName: stringSchema,
      preferredName: stringSchema,
      email: stringSchema,
      phoneNumber: stringSchema,
      whatsappPhoneNumber: stringSchema,
      role: stringSchema,
      accountType: stringSchema,
      homeAddress: stringSchema,
      verificationStatus: stringSchema,
    }),
  },
  checkMyAccountByWhatsAppNumber: {
    description: 'Check whether the current guest customer’s own WhatsApp number matches one linkable Uncedo customer account. The backend derives the number from the verified current WhatsApp sender; never request or provide a phone number. Returns only a match status, never account identifiers or personal details.',
    roles: ['guest'], auth: 'self-profile', fields: {},
    handler: 'checkMyAccountByWhatsAppNumber', canonicalBackend: 'currentWhatsAppAccountMatcher',
    outputSchema: resultSchema({ matchStatus: stringSchema }, ['matchStatus']),
  },
  proposeProfileChange: {
    description: 'Propose changing only the authenticated account owner’s first name or surname. This creates a one-time confirmation prompt and never applies the change without the user’s separate confirmation. Do not use for phone number, email, role, or verification changes.',
    roles: ['customer', 'helper'], auth: 'verified-linked',
    fields: { field: 'profile-field', value: 'short-text' }, required: ['field', 'value'],
    handler: 'proposeProfileChange', canonicalBackend: 'confirmedProfileChangeWorkflow',
    stateChanging: true, confirmation: 'user-confirmation', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({ code: stringSchema, proposalId: stringSchema, field: stringSchema, value: stringSchema }),
  },
  getAvailableServices: {
    description: 'Get a lightweight summary list of all active published Uncedo services (IDs, labels, categories, and descriptions) for internal AI reasoning and catalog inspection.',
    roles: ['guest', 'customer', 'helper'], auth: 'public', fields: {},
    handler: 'getAvailableServices', canonicalBackend: 'liveServiceCatalogSummaryReader',
    outputSchema: resultSchema({
      services: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          label: stringSchema,
          categoryName: stringSchema,
          description: stringSchema,
        }, ['id', 'label']),
      }),
    }, ['services']),
  },
  sendServicesToUser: {
    description: 'Send an interactive WhatsApp carousel card message to the user showing available Uncedo services with primary images, descriptions, and Book/Details quick-reply buttons.',
    roles: ['guest', 'customer', 'helper'], auth: 'public', fields: { category: 'short-text' }, required: [],
    handler: 'sendServicesToUser', canonicalBackend: 'interactiveServiceCarouselSender',
    stateChanging: true, confirmation: 'not-required', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      sentCount: Object.freeze({ type: 'integer' }),
      persistedReply: Object.freeze({ type: 'boolean' }),
    }, ['code']),
  },
  getServiceDetails: {
    description: 'Read full details of a specific Uncedo service by serviceId or keyword query. Returns service options, questionnaire options, description, category, price estimate range, and active helper availability count.',
    roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: { serviceId: 'short-text', query: 'short-text', serviceOption: 'short-text' }, required: [],
    handler: 'getServiceDetails', canonicalBackend: 'liveServiceCatalogReader',
    outputSchema: resultSchema({
      code: stringSchema,
      error: stringSchema,
      query: stringSchema,
      availableServices: Object.freeze({ type: 'array', items: stringSchema }),
      id: stringSchema,
      label: stringSchema,
      description: stringSchema,
      category: stringSchema,
      priceRange: stringSchema,
      helperCount: Object.freeze({ type: 'integer' }),
      serviceOptions: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          title: stringSchema,
          price: Object.freeze({ type: 'number' }),
          description: stringSchema,
        }, ['id', 'title']),
      }),
      options: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          prompt: stringSchema,
          options: Object.freeze({
            type: 'array',
            items: stringSchema,
          }),
        }, ['id', 'prompt']),
      }),
    }, ['code']),
  },
  initiateServiceBooking: {
    description: 'Initiate a service booking by serviceId or keyword, optionally including the chosen serviceOption. Loads the service options or questionnaire and starts the booking intake flow.',
    roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: { serviceId: 'short-text', query: 'short-text', serviceOption: 'short-text' }, required: [],
    handler: 'initiateServiceBooking', canonicalBackend: 'serviceBookingInitiator',
    stateChanging: true, confirmation: 'not-required', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      error: stringSchema,
      query: stringSchema,
      serviceId: stringSchema,
      serviceName: stringSchema,
      categoryName: stringSchema,
      selectedOptionId: stringSchema,
      selectedOptionTitle: stringSchema,
      serviceOptions: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          title: stringSchema,
          price: Object.freeze({ type: 'number' }),
          description: stringSchema,
        }, ['id', 'title']),
      }),
      questions: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          prompt: stringSchema,
          required: Object.freeze({ type: 'boolean' }),
          options: Object.freeze({
            type: 'array',
            items: stringSchema,
          }),
        }, ['id', 'prompt']),
      }),
    }, ['code']),
  },
  applyForHelperService: {
    description: 'Allow a verified linked helper to apply to offer additional Uncedo services or specific service options on WhatsApp. Accepts optional serviceId, query, and serviceOption (single or comma-separated option names/IDs). If no service is specified, sends/lists available services; if a service requires options and none are specified, sends/lists available unapplied options; if options (or a unified service) are specified, submits the pending helperService applications and prompts for work photos.',
    roles: ['helper'],
    auth: 'verified-linked',
    fields: { serviceId: 'short-text', query: 'short-text', serviceOption: 'multi-text' },
    required: [],
    handler: 'applyForHelperService',
    canonicalBackend: 'helperServiceApplicationWorkflow',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      error: stringSchema,
      query: stringSchema,
      serviceId: stringSchema,
      serviceName: stringSchema,
      optionApplicationMode: stringSchema,
      appliedOptions: Object.freeze({
        type: 'array',
        items: resultSchema({
          serviceId: stringSchema,
          serviceName: stringSchema,
          optionId: stringSchema,
          optionTitle: stringSchema,
          status: stringSchema,
          hasPhotos: Object.freeze({ type: 'boolean' }),
        }, ['serviceId', 'optionId']),
      }),
      availableServices: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          label: stringSchema,
          categoryName: stringSchema,
          optionApplicationMode: stringSchema,
          availableOptionCount: Object.freeze({ type: 'integer' }),
        }, ['id', 'label']),
      }),
      availableOptions: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          title: stringSchema,
          price: Object.freeze({ type: 'number' }),
          description: stringSchema,
          alreadyAppliedStatus: stringSchema,
        }, ['id', 'title']),
      }),
      submittedNames: Object.freeze({ type: 'array', items: stringSchema }),
      photoUploadUrl: stringSchema,
      needsPhotos: Object.freeze({ type: 'boolean' }),
    }, ['code']),
  },
  relayMessageToHelper: {
    description: 'Forward a customer’s message directed to their currently assigned helper into the active job live chat so the helper sees it immediately in the Uncedo Helpers app. Use ONLY during an active assigned job when the customer is addressing or communicating with their helper (e.g. gate code, directions, asking ETA, saying they are outside, replying to helper questions). NEVER use this for cancellations, complaints about the helper, support escalations, or general platform/billing questions.',
    roles: ['guest', 'customer'],
    auth: 'public',
    fields: { messageText: 'long-text', category: 'short-text' },
    required: ['messageText'],
    handler: 'relayMessageToHelper',
    canonicalBackend: 'activeSessionHelperChatBridge',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      helperName: stringSchema,
      deliveredToInAppChat: Object.freeze({ type: 'boolean' }),
      relayedToHelperWhatsApp: Object.freeze({ type: 'boolean' }),
    }, ['code']),
  },
  cancelServiceRequest: {
    description: 'Search the sender’s active, non-canceled Uncedo service requests and cancel a booking for them. Accepts optional requestId (request ID or reference) and optional reason. If no requestId is passed, automatically finds the sender’s active open booking/request from conversation state or service request history and cancels it (or initiates confirmation if a cancellation fee applies).',
    roles: ['guest', 'customer'],
    auth: 'public',
    fields: { requestId: 'short-text', reason: 'long-text' },
    required: [],
    handler: 'cancelServiceRequest',
    canonicalBackend: 'customerServiceRequestCancellation',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      publicRequestReference: stringSchema,
      serviceSummary: stringSchema,
      previousStatus: stringSchema,
      status: stringSchema,
      cancellationAmount: Object.freeze({ type: 'number' }),
      billingRule: stringSchema,
      chargeConfirmed: Object.freeze({ type: 'boolean' }),
      pendingReconciliation: Object.freeze({ type: 'boolean' }),
      confirmationRequired: Object.freeze({ type: 'boolean' }),
      paymentUrl: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  getCustomerRequestHistory: {
    description: 'List the current customer or guest’s recent and active Uncedo service bookings/requests (references, services, statuses, helper names, and payment statuses), plus any in-progress booking draft.',
    roles: ['guest', 'customer'],
    auth: 'public',
    fields: {},
    required: [],
    handler: 'getCustomerRequestHistory',
    canonicalBackend: 'customerRequestHistoryReader',
    outputSchema: resultSchema({
      code: stringSchema,
      requests: Object.freeze({
        type: 'array',
        items: resultSchema({
          requestId: stringSchema,
          publicRequestReference: stringSchema,
          serviceSummary: stringSchema,
          status: stringSchema,
          statusLabel: stringSchema,
          helperName: stringSchema,
          amount: Object.freeze({ type: ['number', 'null'] }),
          paymentStatus: stringSchema,
        }, ['requestId', 'status']),
      }),
      activeDraftServiceId: stringSchema,
      activeDraftStatus: stringSchema,
    }, ['code', 'requests']),
  },
  getServiceRequestDetails: {
    description: 'Read authoritative details and live status of a specific Uncedo service request (or the caller’s active/most recent request when requestId is omitted), including helper assignment, quoted/final amount, payment status, whether it can be canceled/rated, and the 6-digit arrival PIN when the helper has arrived (for the owning customer only).',
    roles: ['guest', 'customer', 'helper'],
    auth: 'public',
    fields: { requestId: 'short-text' },
    required: [],
    handler: 'getServiceRequestDetails',
    canonicalBackend: 'participantServiceRequestReader',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      publicRequestReference: stringSchema,
      serviceSummary: stringSchema,
      status: stringSchema,
      statusLabel: stringSchema,
      helperName: stringSchema,
      customerName: stringSchema,
      serviceAddress: stringSchema,
      estimatedAmount: Object.freeze({ type: ['number', 'null'] }),
      finalAmount: Object.freeze({ type: ['number', 'null'] }),
      paymentStatus: stringSchema,
      arrivalPin: stringSchema,
      canCancel: Object.freeze({ type: 'boolean' }),
      canRate: Object.freeze({ type: 'boolean' }),
      ratingScore: Object.freeze({ type: ['integer', 'null'] }),
      workspaceUrl: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  getRequestPaymentDetails: {
    description: 'Check the authoritative payment status, amount due or paid, saved card summary, cash payment eligibility, and wallet balance for the customer or guest’s active or specified service request.',
    roles: ['guest', 'customer'],
    auth: 'public',
    fields: { requestId: 'short-text' },
    required: [],
    handler: 'getRequestPaymentDetails',
    canonicalBackend: 'customerPaymentSummaryReader',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      publicRequestReference: stringSchema,
      serviceSummary: stringSchema,
      requestStatus: stringSchema,
      paymentStatus: stringSchema,
      state: stringSchema,
      amount: Object.freeze({ type: ['number', 'null'] }),
      currency: stringSchema,
      settledDate: stringSchema,
      walletBalance: Object.freeze({ type: 'number' }),
      savedCardCount: Object.freeze({ type: 'integer' }),
      savedCardSummary: stringSchema,
      cashAllowed: Object.freeze({ type: 'boolean' }),
      error: stringSchema,
    }, ['code']),
  },
  createRequestPaymentLink: {
    description: 'Generate a fresh, secure, request-specific checkout payment link for an unpaid completed or canceled service request so the customer or guest can pay online by card (and optionally save a card for future bookings). Optionally accepts requestId; if omitted, finds a single unpaid finalized request.',
    roles: ['guest', 'customer'],
    auth: 'public',
    fields: { requestId: 'short-text' },
    required: [],
    handler: 'createRequestPaymentLink',
    canonicalBackend: 'customerPaymentSessionGenerator',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      publicRequestReference: stringSchema,
      serviceSummary: stringSchema,
      amount: Object.freeze({ type: 'number' }),
      currency: stringSchema,
      paymentUrl: stringSchema,
      cashAllowed: Object.freeze({ type: 'boolean' }),
      savedCardCount: Object.freeze({ type: 'integer' }),
      pendingRequests: Object.freeze({
        type: 'array',
        items: resultSchema({
          requestId: stringSchema,
          publicRequestReference: stringSchema,
          serviceSummary: stringSchema,
          amount: Object.freeze({ type: 'number' }),
        }, ['requestId']),
      }),
      error: stringSchema,
    }, ['code']),
  },
  rateServiceHelper: {
    description: 'Submit or update a 1-to-5 star rating (and optional feedback comment) for the assigned helper on a completed service request or a request canceled after arrival/work started.',
    roles: ['guest', 'customer'],
    auth: 'public',
    fields: { requestId: 'short-text', score: 'rating-score', comment: 'long-text' },
    required: ['score'],
    handler: 'rateServiceHelper',
    canonicalBackend: 'serviceRequestRatingWorkflow',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      publicRequestReference: stringSchema,
      helperName: stringSchema,
      score: Object.freeze({ type: 'integer' }),
      comment: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  escalateToHumanSupport: {
    description: 'Create or append to an Uncedo human support ticket linked to this WhatsApp conversation (and optional service request) when the user explicitly asks for human help, disputes a charge/rating/incident, or needs manual support assistance.',
    roles: ['guest', 'customer', 'helper'],
    auth: 'public',
    fields: { summary: 'long-text', requestId: 'short-text' },
    required: [],
    handler: 'escalateToHumanSupport',
    canonicalBackend: 'whatsappSupportTicketService',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      ticketId: stringSchema,
      requestId: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  getHelperOnboardingStatus: {
    description: 'Check a verified linked helper’s account verification, onboarding checklist (profile photo, service offerings & photos, Helper Agreement, police clearance, payout verification), online readiness, and onboarding URL.',
    roles: ['helper'],
    auth: 'verified-linked',
    fields: {},
    required: [],
    handler: 'getHelperOnboardingStatus',
    canonicalBackend: 'helperReadinessReader',
    outputSchema: resultSchema({
      code: stringSchema,
      readyToGoOnline: Object.freeze({ type: 'boolean' }),
      helperVerified: Object.freeze({ type: 'boolean' }),
      payoutVerified: Object.freeze({ type: 'boolean' }),
      agreementCurrent: Object.freeze({ type: 'boolean' }),
      policeClearanceStatus: stringSchema,
      hasProfilePhoto: Object.freeze({ type: 'boolean' }),
      hasApprovedOffering: Object.freeze({ type: 'boolean' }),
      onlineStatus: stringSchema,
      missingRequirements: Object.freeze({ type: 'array', items: stringSchema }),
      offerings: Object.freeze({
        type: 'array',
        items: resultSchema({
          serviceId: stringSchema,
          serviceName: stringSchema,
          optionTitle: stringSchema,
          status: stringSchema,
          hasPhotos: Object.freeze({ type: 'boolean' }),
        }, ['serviceId', 'status']),
      }),
      onboardingUrl: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  getHelperWalletAndPayouts: {
    description: 'Read a verified linked helper’s Uncedo wallet balance (available balance, reserved amount, outstanding cash commission, net balance), payout account readiness, pending cash confirmations count, recent payouts, and recent wallet transactions in ZAR.',
    roles: ['helper'],
    auth: 'verified-linked',
    fields: {},
    required: [],
    handler: 'getHelperWalletAndPayouts',
    canonicalBackend: 'helperWalletAndPayoutReader',
    outputSchema: resultSchema({
      code: stringSchema,
      currency: stringSchema,
      availableBalance: Object.freeze({ type: 'number' }),
      reservedBalance: Object.freeze({ type: 'number' }),
      outstandingCommission: Object.freeze({ type: 'number' }),
      payoutVerified: Object.freeze({ type: 'boolean' }),
      reconciliationBlocked: Object.freeze({ type: 'boolean' }),
      pendingCashConfirmationsCount: Object.freeze({ type: 'integer' }),
      recentTransactions: Object.freeze({
        type: 'array',
        items: resultSchema({
          entryType: stringSchema,
          amount: Object.freeze({ type: 'number' }),
          description: stringSchema,
          date: stringSchema,
        }, ['entryType', 'amount']),
      }),
      recentPayouts: Object.freeze({
        type: 'array',
        items: resultSchema({
          status: stringSchema,
          amount: Object.freeze({ type: 'number' }),
          date: stringSchema,
        }, ['status', 'amount']),
      }),
      workspaceUrl: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  getHelperJobsAndOffers: {
    description: 'List a verified linked helper’s current online availability, any pending incoming job offer waiting for a response, active or queued assigned job, and recent completed/assigned jobs.',
    roles: ['helper'],
    auth: 'verified-linked',
    fields: {},
    required: [],
    handler: 'getHelperJobsAndOffers',
    canonicalBackend: 'helperJobsAndOffersReader',
    outputSchema: resultSchema({
      code: stringSchema,
      onlineStatus: stringSchema,
      pendingOffer: Object.freeze({
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          requestId: stringSchema,
          publicRequestReference: stringSchema,
          serviceSummary: stringSchema,
          estimatedPayout: Object.freeze({ type: 'number' }),
          offerType: stringSchema,
          expiresInMinutes: Object.freeze({ type: 'integer' }),
        },
        required: ['requestId'],
      }),
      activeJob: Object.freeze({
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          requestId: stringSchema,
          publicRequestReference: stringSchema,
          serviceSummary: stringSchema,
          status: stringSchema,
          customerName: stringSchema,
          estimatedPayout: Object.freeze({ type: 'number' }),
        },
        required: ['requestId', 'status'],
      }),
      queuedJob: Object.freeze({
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          requestId: stringSchema,
          publicRequestReference: stringSchema,
          serviceSummary: stringSchema,
          status: stringSchema,
        },
        required: ['requestId', 'status'],
      }),
      recentJobs: Object.freeze({
        type: 'array',
        items: resultSchema({
          requestId: stringSchema,
          publicRequestReference: stringSchema,
          serviceSummary: stringSchema,
          status: stringSchema,
          amount: Object.freeze({ type: ['number', 'null'] }),
          paymentStatus: stringSchema,
        }, ['requestId', 'status']),
      }),
      workspaceUrl: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  setHelperAvailability: {
    description: 'Check or update a verified linked helper’s dispatch availability on Uncedo ("online", "offline", or "status"). Going online checks readiness and directs the helper to open Helpers Workspace to share live GPS; going offline immediately updates availability unless an active job is in progress.',
    roles: ['helper'],
    auth: 'verified-linked',
    fields: { action: 'availability-action' },
    required: ['action'],
    handler: 'setHelperAvailability',
    canonicalBackend: 'helperAvailabilityWorkflow',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      onlineStatus: stringSchema,
      hasFreshLocation: Object.freeze({ type: 'boolean' }),
      missingRequirements: Object.freeze({ type: 'array', items: stringSchema }),
      workspaceUrl: stringSchema,
      onboardingUrl: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  respondToHelperJobOffer: {
    description: 'Accept or decline an active pending Uncedo service job offer currently dispatched to the verified linked helper. Accepts action ("accept" or "decline") and optional requestId.',
    roles: ['helper'],
    auth: 'verified-linked',
    fields: { action: 'offer-action', requestId: 'short-text' },
    required: ['action'],
    handler: 'respondToHelperJobOffer',
    canonicalBackend: 'serviceRequestOfferOperations',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      publicRequestReference: stringSchema,
      serviceSummary: stringSchema,
      busyFallbackAccepted: Object.freeze({ type: 'boolean' }),
      requestUrl: stringSchema,
      workspaceUrl: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
  relayMessageToCustomer: {
    description: 'Forward a verified linked helper’s message to the customer of their currently active open job into the Uncedo job chat and WhatsApp chat. Use ONLY during an active assigned job when the helper is replying to or updating the customer (e.g. ETA, outside gate, asking access details).',
    roles: ['helper'],
    auth: 'verified-linked',
    fields: { messageText: 'long-text', category: 'short-text' },
    required: ['messageText'],
    handler: 'relayMessageToCustomer',
    canonicalBackend: 'activeSessionCustomerChatBridge',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      customerName: stringSchema,
      deliveredToInAppChat: Object.freeze({ type: 'boolean' }),
      relayedToCustomerWhatsApp: Object.freeze({ type: 'boolean' }),
    }, ['code']),
  },
  confirmCashPaymentReceipt: {
    description: 'Confirm or reject receipt of a customer-reported cash payment for one of the verified linked helper’s completed service requests ("confirm" if cash was received, "reject" if not received). Optionally accepts requestId.',
    roles: ['helper'],
    auth: 'verified-linked',
    fields: { action: 'cash-action', requestId: 'short-text' },
    required: ['action'],
    handler: 'confirmCashPaymentReceipt',
    canonicalBackend: 'helperCashPaymentConfirmationWorkflow',
    stateChanging: true,
    confirmation: 'not-required',
    idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      requestId: stringSchema,
      publicRequestReference: stringSchema,
      amount: Object.freeze({ type: ['number', 'null'] }),
      currency: stringSchema,
      pendingRequests: Object.freeze({
        type: 'array',
        items: resultSchema({
          requestId: stringSchema,
          publicRequestReference: stringSchema,
          amount: Object.freeze({ type: 'number' }),
        }, ['requestId']),
      }),
      error: stringSchema,
    }, ['code']),
  },
  checkWalletBalance: {
    description: 'Check the current customer, guest, or helper’s Uncedo wallet balance. If the wallet balance is negative (< 0), attaches a clear overdue-balance message and (1) for customers/guests generates a secure payment link to pay the outstanding amount, or (2) for helpers returns the Capitec banking details (1569166828, reference: WhatsApp number) to send the outstanding amount to.',
    roles: ['guest', 'customer', 'helper'],
    auth: 'self-profile',
    fields: {},
    required: [],
    handler: 'checkWalletBalance',
    canonicalBackend: 'participantWalletBalanceReader',
    outputSchema: resultSchema({
      code: stringSchema,
      role: stringSchema,
      currency: stringSchema,
      walletBalance: Object.freeze({ type: 'number' }),
      availableBalance: Object.freeze({ type: 'number' }),
      reservedBalance: Object.freeze({ type: 'number' }),
      outstandingCommission: Object.freeze({ type: 'number' }),
      isNegative: Object.freeze({ type: 'boolean' }),
      outstandingAmount: Object.freeze({ type: 'number' }),
      settlementMessage: stringSchema,
      paymentUrl: stringSchema,
      requestId: stringSchema,
      publicRequestReference: stringSchema,
      paymentLinks: Object.freeze({
        type: 'array',
        items: resultSchema({
          requestId: stringSchema,
          publicRequestReference: stringSchema,
          serviceSummary: stringSchema,
          amount: Object.freeze({ type: 'number' }),
          paymentUrl: stringSchema,
        }, ['amount', 'paymentUrl']),
      }),
      bankDetails: Object.freeze({
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          bankName: stringSchema,
          accountNumber: stringSchema,
          reference: stringSchema,
        },
        required: ['bankName', 'accountNumber', 'reference'],
      }),
      workspaceUrl: stringSchema,
      error: stringSchema,
    }, ['code']),
  },
});

function safeText(value, max = 500) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function roleForContext(context = {}) {
  return String(context.authorization?.role || context.role || context.kind || (context.identity?.guestPrincipalId ? 'customer' : 'guest')).trim().toLowerCase();
}

function validateToolArguments(definition, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object.');
  const allowed = new Set(Object.keys(definition.fields || {}));
  const unknown = Object.keys(args).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error('Tool arguments contain unsupported fields.');
  for (const key of definition.required || []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') throw new Error(`Tool argument ${key} is required.`);
  }
  const requiredFields = new Set(definition.required || []);
  const normalized = {};
  for (const [key, type] of Object.entries(definition.fields || {})) {
    if (args[key] === undefined || args[key] === null) continue;
    const value = args[key];
    if (type === 'short-text') {
      const item = safeText(value, 120);
      if (!item) {
        if (requiredFields.has(key)) throw new Error(`Tool argument ${key} is required.`);
        continue;
      }
      normalized[key] = item;
    } else if (type === 'multi-text') {
      const item = safeText(value, 240);
      if (!item) {
        if (requiredFields.has(key)) throw new Error(`Tool argument ${key} is required.`);
        continue;
      }
      normalized[key] = item;
    } else if (type === 'long-text') {
      const item = safeText(value, 1000);
      if (!item) {
        if (requiredFields.has(key)) throw new Error(`Tool argument ${key} is required.`);
        continue;
      }
      normalized[key] = item;
    } else if (type === 'profile-field') {
      const item = safeText(value, 40);
      if (!['firstName', 'lastName'].includes(item)) throw new Error('Only first name or surname can be changed here.');
      normalized[key] = item;
    } else if (type === 'rating-score') {
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
        throw new Error('Rating score must be an integer between 1 and 5.');
      }
      normalized[key] = numeric;
    } else if (type === 'availability-action') {
      const item = safeText(value, 20).toLowerCase();
      if (!['online', 'offline', 'status'].includes(item)) {
        throw new Error('Availability action must be online, offline, or status.');
      }
      normalized[key] = item;
    } else if (type === 'offer-action') {
      const item = safeText(value, 20).toLowerCase();
      if (!['accept', 'decline'].includes(item)) {
        throw new Error('Offer action must be accept or decline.');
      }
      normalized[key] = item;
    } else if (type === 'cash-action') {
      const item = safeText(value, 20).toLowerCase();
      if (!['confirm', 'reject'].includes(item)) {
        throw new Error('Cash action must be confirm or reject.');
      }
      normalized[key] = item;
    }
  }
  return normalized;
}

function matchesOutputSchema(value, schema) {
  const allowedTypes = Array.isArray(schema?.type) ? schema.type : [schema?.type];
  const matchesType = (type) => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value));
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'string') return typeof value === 'string';
    if (type === 'boolean') return typeof value === 'boolean';
    return false;
  };
  if (!allowedTypes.some(matchesType)) return false;
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) return !schema.items || value.every((item) => matchesOutputSchema(item, schema.items));
  const properties = schema.properties || {};
  if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) return false;
  if ((schema.required || []).some((key) => value[key] === undefined)) return false;
  return Object.entries(value).every(([key, nested]) => !properties[key] || matchesOutputSchema(nested, properties[key]));
}

function createWhatsAppToolRegistry({ handlers = {} } = {}) {
  function definitions(context = {}) {
    const role = roleForContext(context);
    const hasOpenRelayRequest = Boolean(context.activeServiceRequest?.isOpen);
    return Object.entries(TOOL_DEFINITIONS)
      .filter(([name, definition]) => {
        if (!definition.roles.includes(role)) return false;
        if (name === 'relayMessageToHelper') return role !== 'helper' && hasOpenRelayRequest;
        if (name === 'relayMessageToCustomer') return role === 'helper' && hasOpenRelayRequest;
        return true;
      })
      .map(([name, definition]) => ({
        name,
        description: definition.description,
        inputSchema: {
          type: 'object', additionalProperties: false,
          properties: Object.fromEntries(Object.entries(definition.fields || {}).map(([key, kind]) => [key,
            kind === 'profile-field'
              ? { type: 'string', enum: ['firstName', 'lastName'] }
              : kind === 'rating-score'
                ? { type: 'integer', minimum: 1, maximum: 5 }
                : kind === 'availability-action'
                  ? { type: 'string', enum: ['online', 'offline', 'status'] }
                  : kind === 'offer-action'
                    ? { type: 'string', enum: ['accept', 'decline'] }
                    : kind === 'cash-action'
                      ? { type: 'string', enum: ['confirm', 'reject'] }
                      : kind === 'long-text'
                        ? { type: 'string', maxLength: 1000 }
                        : kind === 'multi-text'
                          ? { type: 'string', maxLength: 240 }
                          : { type: 'string', maxLength: 120 },
          ])),
          required: definition.required || [],
        },
        stateChanging: definition.stateChanging === true,
        readOnly: definition.stateChanging !== true,
        auth: definition.auth,
        confirmation: definition.confirmation || 'not-required',
        idempotency: definition.idempotency || 'read-only',
        canonicalBackend: definition.canonicalBackend,
        outputSchema: definition.outputSchema,
      }));
  }

  async function execute(name, rawArgs = {}, context = {}) {
    const definition = TOOL_DEFINITIONS[name];
    if (!definition) throw Object.assign(new Error('Tool is not available.'), { code: 'tool-not-available' });
    const role = roleForContext(context);
    if (!definition.roles.includes(role)) throw Object.assign(new Error('This tool is not available for this account.'), { code: 'tool-permission-denied' });
    const authorization = context.authorization || {};
    const isVerifiedLinkedAccount = Boolean(authorization.uid && authorization.verified === true && authorization.linked === true);
    const isBoundGuest = role === 'guest'
      && Boolean(String(context.identity?.guestPrincipalId || '').trim())
      && !String(context.identity?.linkedFirebaseUid || '').trim();
    if (definition.auth === 'self-profile' && !isVerifiedLinkedAccount && !isBoundGuest) {
      throw Object.assign(new Error('A verified linked account or bound WhatsApp guest profile is required.'), { code: 'identity-verification-required' });
    }
    if (definition.auth === 'verified-linked' && !isVerifiedLinkedAccount) {
      throw Object.assign(new Error('Verify and link your WhatsApp identity to access account information.'), { code: 'identity-verification-required' });
    }
    const args = validateToolArguments(definition, rawArgs);
    const handler = handlers[definition.handler];
    if (typeof handler !== 'function') throw Object.assign(new Error('This approved operation is not configured.'), { code: 'tool-unavailable' });
    const result = await handler(args, context);
    if (!result || typeof result !== 'object' || Array.isArray(result) || Buffer.byteLength(JSON.stringify(result)) > 50_000) {
      throw Object.assign(new Error('The approved operation returned an invalid result.'), { code: 'tool-output-invalid' });
    }
    const schemaWithSafeCode = {
      ...definition.outputSchema,
      properties: { ...(definition.outputSchema.properties || {}), code: stringSchema },
    };
    if (!matchesOutputSchema(result, schemaWithSafeCode)) {
      throw Object.assign(new Error('The approved operation returned a result outside its declared schema.'), { code: 'tool-output-invalid' });
    }
    return result;
  }

  return {
    definitions,
    execute,
    isReadOnly(name) { return Boolean(TOOL_DEFINITIONS[name] && TOOL_DEFINITIONS[name].stateChanging !== true); },
  };
}

module.exports = { TOOL_DEFINITIONS, createWhatsAppToolRegistry, validateToolArguments };
