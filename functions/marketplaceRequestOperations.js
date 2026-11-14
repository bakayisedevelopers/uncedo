'use strict';

const { normalizeServiceCatalogEntry } = require('./serviceMarketplacePricing');
const {
  getQuestionnaireForSelection,
  normalizeAndValidateAnswers,
  quoteFromCatalogEntries,
  validateAndResolveOptionSelection,
} = require('./serviceRequestPricing');

const ACTIVE_REQUEST_STATUSES = [
  'collecting_details', 'scheduled_pending', 'matching', 'helper_found', 'accepted',
  'driving', 'en_route', 'buying_resources', 'arrived', 'work_started', 'no_helper_available',
];

function normalizeLocation(value, answers = {}, explicitAddress = '') {
  const location = value && typeof value === 'object' && !Array.isArray(value)
    ? {
      latitude: Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : null,
      longitude: Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : null,
      address: String(value.address || '').trim().slice(0, 500),
      name: String(value.name || '').trim().slice(0, 200),
    }
    : null;
  const serviceAddress = String(explicitAddress || answers.service_address || location?.address || '').trim().slice(0, 500);
  return { location, serviceAddress };
}

function getRequestSelection(request = {}) {
  const payload = request.requestPayload || {};
  return {
    categoryId: String(request.categoryId || payload.categoryId || '').trim().toLowerCase(),
    serviceIds: [...new Set((Array.isArray(request.serviceIds) ? request.serviceIds : payload.serviceIds || [])
      .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))],
    selectedPackageId: String(request.selectedPackageId || payload.selectedPackageId || '').trim().toLowerCase(),
    selectedOptionId: String(request.selectedOptionId || payload.selectedOptionId || '').trim().toLowerCase(),
    selectedOptionTitle: String(request.selectedOptionTitle || payload.selectedOptionTitle || '').trim(),
    answers: request.structuredAnswers || payload.structuredAnswers || {},
  };
}

function normalizeServiceIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

async function isRequestOwnerInTransaction(transaction, db, request, ownerId) {
  const customerId = String(request?.customerId || '').trim();
  if (customerId === ownerId) return true;
  if (!customerId.startsWith('guest_') || !ownerId) return false;
  const ownershipSnap = await transaction.get(db.collection('whatsappGuestOwnership').doc(customerId));
  return ownershipSnap.exists && String(ownershipSnap.data()?.uid || '') === ownerId;
}

function createMarketplaceRequestOperations({ db, admin }) {
  if (!db || !admin) throw new Error('Firestore and Firebase Admin are required.');

  async function createDraft({
    requestId,
    principalId,
    profile = {},
    categoryId: rawCategoryId,
    serviceIds: rawServiceIds,
    selectedPackageId: rawSelectedPackageId = '',
    selectedOptionId: rawSelectedOptionId = '',
    structuredAnswers: rawAnswers = {},
    location: rawLocation = null,
    serviceAddress: rawServiceAddress = '',
    timingPreference: rawTimingPreference = '',
    scheduledForText: rawScheduledForText = '',
    intakeMode = 'guided_chat',
    source = 'customer_request_backend',
    channel = 'app',
    identityId = '',
    now = Date.now(),
  } = {}) {
    const normalizedRequestId = String(requestId || '').trim();
    const ownerId = String(principalId || '').trim();
    const categoryId = String(rawCategoryId || '').trim().toLowerCase();
    const serviceIds = normalizeServiceIds(rawServiceIds);
    const selectedPackageId = String(rawSelectedPackageId || '').trim().toLowerCase();
    const selectedOptionId = String(rawSelectedOptionId || '').trim().toLowerCase();
    const structuredAnswers = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers) ? rawAnswers : {};
    if (!/^[A-Za-z0-9_-]{8,180}$/.test(normalizedRequestId) || !ownerId || !categoryId || !serviceIds.length || serviceIds.length > 30) {
      return { code: 'invalid-service-selection' };
    }

    const requestRef = db.collection('serviceRequests').doc(normalizedRequestId);
    const userRef = db.collection('users').doc(ownerId);
    const catalogIds = [...new Set([...serviceIds, ...(selectedPackageId ? [selectedPackageId] : [])])];
    return db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (requestSnap.exists) {
        const existing = requestSnap.data() || {};
        if (String(existing.customerId || '') === ownerId && existing.status === 'collecting_details') {
          return { code: 'already-created', request: { id: requestSnap.id, ...existing } };
        }
        return { code: 'request-id-conflict' };
      }

      const [userSnap, ...catalogSnaps] = await Promise.all([
        transaction.get(userRef),
        ...catalogIds.map((id) => transaction.get(db.collection('serviceCatalog').doc(id))),
      ]);
      const entries = catalogSnaps.filter((item) => item.exists)
        .map((item) => normalizeServiceCatalogEntry({ id: item.id, ...item.data() }));
      const byId = new Map(entries.filter(Boolean).map((item) => [item.id, item]));
      const requested = serviceIds.map((id) => byId.get(id));
      const packageEntry = selectedPackageId ? byId.get(selectedPackageId) : null;
      if (requested.some((item) => !item || !item.active || !item.approved || item.categoryId !== categoryId)
        || (selectedPackageId && (!packageEntry || !packageEntry.active || !packageEntry.approved || packageEntry.categoryId !== categoryId))) {
        return { code: 'service-unavailable' };
      }
      if (packageEntry?.includedServiceIds?.length
        && serviceIds.some((id) => !packageEntry.includedServiceIds.includes(id))) return { code: 'invalid-package-selection' };

      let resolvedOptionSelection = { selectedOption: null, selectedOptionId: '' };
      try {
        resolvedOptionSelection = validateAndResolveOptionSelection(entries, selectedOptionId);
      } catch (error) {
        return { code: error.code || 'invalid-service-option', message: error.message };
      }

      let answers;
      try {
        answers = normalizeAndValidateAnswers({
          answers: structuredAnswers,
          questions: getQuestionnaireForSelection({
            services: entries,
            selectedPackageId,
            selectedOptionId: resolvedOptionSelection.selectedOptionId,
          }),
          strictUnknown: true,
        }).answers;
      } catch (error) {
        return { code: 'invalid-service-answers', message: error.message };
      }

      const user = userSnap.exists ? userSnap.data() || {} : {};
      const ownershipIds = [...new Set([ownerId, ...(Array.isArray(user.whatsappGuestPrincipalIds) ? user.whatsappGuestPrincipalIds : [])]
        .map((value) => String(value || '').trim()).filter(Boolean))];
      const activeSnapshots = await Promise.all(ownershipIds.map((id) => transaction.get(db.collection('serviceRequests')
        .where('customerId', '==', id)
        .where('status', 'in', ACTIVE_REQUEST_STATUSES))));
      const active = activeSnapshots.flatMap((snapshot) => snapshot.docs || [])[0];
      if (active) return { code: 'active-request', activeRequestId: active.id };
      const name = String(profile.fullName || profile.displayName || user.fullName || user.displayName || '').trim().slice(0, 120)
        || (ownerId.startsWith('guest_') ? 'WhatsApp customer' : 'Customer');
      const email = String(profile.email || user.email || '').trim().slice(0, 254);
      const phone = String(profile.phoneNumber || user.phoneNumber || user.phone || '').trim().slice(0, 40);
      const { location, serviceAddress } = normalizeLocation(rawLocation, answers, rawServiceAddress);
      const timingPreference = String(rawTimingPreference || answers.timing_preference || 'now').trim().toLowerCase() === 'later' ? 'later' : 'now';
      const scheduledForText = String(rawScheduledForText || answers.scheduled_for_text || '').trim().slice(0, 160);
      const parsedSchedule = Date.parse(scheduledForText);
      const scheduledForAtMs = Number.isFinite(parsedSchedule) ? parsedSchedule : null;
      const labels = requested.map((item) => item.label);
      const optionId = resolvedOptionSelection.selectedOption?.id || '';
      const optionTitle = resolvedOptionSelection.selectedOption?.title || '';
      const baseSummary = packageEntry?.label || labels.join(', ') || 'Service request';
      const summary = optionTitle ? `${baseSummary} — ${optionTitle}` : baseSummary;
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const payload = {
        categoryId, serviceIds, selectedPackageId, selectedOptionId: optionId, selectedOptionTitle: optionTitle,
        summary, structuredAnswers: answers,
        selectedPortfolioReferences: [], attachments: [], pricingSnapshot: null, aiUsageSnapshot: null,
        timingPreference, scheduledForText, scheduledForAtMs, location, serviceAddress,
      };
      transaction.create(requestRef, {
        customerId: ownerId,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        location,
        serviceAddress,
        status: 'collecting_details',
        statusDetail: 'Request intake started. Collecting service details.',
        requestType: 'customer_service',
        intakeMode,
        originChannel: String(channel || 'app').trim().slice(0, 40),
        originIdentityId: String(identityId || '').trim() || null,
        requestPayload: payload,
        categoryId,
        serviceIds,
        selectedPackageId,
        selectedOptionId: optionId,
        selectedOptionTitle: optionTitle,
        subject: packageEntry?.label || requested[0]?.categoryName || 'Service request',
        topic: optionTitle ? `${labels.join(', ')} (${optionTitle})` : labels.join(', '),
        description: summary,
        serviceSummary: summary,
        pricingSnapshot: null,
        aiUsageSnapshot: null,
        helperAssignment: null,
        helperQueue: [],
        currentOfferHelperId: null,
        offerExpiresAt: null,
        offerToken: null,
        offerCycleExcludedHelperIds: [],
        declinedHelperIds: [],
        offerRevision: 0,
        lastOfferAt: null,
        transcript: [],
        structuredAnswers: answers,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.create(db.collection('customerServiceEvents').doc(`request_started_${normalizedRequestId}`), {
        customerId: ownerId,
        eventType: 'request_started',
        serviceId: serviceIds[0] || selectedPackageId || categoryId,
        categoryId,
        serviceIds,
        selectedOptionId: optionId || null,
        requestId: normalizedRequestId,
        source,
        metadata: { subject: packageEntry?.label || requested[0]?.categoryName || 'Service request', selectedOptionTitle: optionTitle || null },
        createdAt: timestamp,
        createdAtMs: now,
        dayBucket: new Date(now).toISOString().slice(0, 10),
      });
      return { code: 'created', requestId: normalizedRequestId };
    });
  }

  async function updateDraft({
    requestId,
    principalId,
    structuredAnswers,
    location,
    serviceAddress: rawServiceAddress,
    categoryId: rawCategoryId,
    serviceIds: rawServiceIds,
    selectedPackageId: rawSelectedPackageId,
    selectedOptionId: rawSelectedOptionId,
    timingPreference: rawTimingPreference,
    scheduledForText: rawScheduledForText,
    now = Date.now(),
  } = {}) {
    const requestRef = db.collection('serviceRequests').doc(String(requestId || '').trim());
    const ownerId = String(principalId || '').trim();
    return db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) return { code: 'request-not-found' };
      const request = requestSnap.data() || {};
      if (!(await isRequestOwnerInTransaction(transaction, db, request, ownerId))) return { code: 'not-owner' };
      if (request.status !== 'collecting_details' || request.helperAssignment?.helperId) return { code: 'invalid-request-state' };
      const currentSelection = getRequestSelection(request);
      const selection = {
        categoryId: String(rawCategoryId || currentSelection.categoryId).trim().toLowerCase(),
        serviceIds: rawServiceIds === undefined ? currentSelection.serviceIds : normalizeServiceIds(rawServiceIds),
        selectedPackageId: rawSelectedPackageId === undefined
          ? currentSelection.selectedPackageId
          : String(rawSelectedPackageId || '').trim().toLowerCase(),
        selectedOptionId: rawSelectedOptionId === undefined
          ? currentSelection.selectedOptionId
          : String(rawSelectedOptionId || '').trim().toLowerCase(),
      };
      if (!selection.categoryId || !selection.serviceIds.length || selection.serviceIds.length > 30) return { code: 'invalid-service-selection' };
      const catalogIds = [...new Set([...selection.serviceIds, ...(selection.selectedPackageId ? [selection.selectedPackageId] : [])])];
      const catalogSnaps = [];
      for (const id of catalogIds) catalogSnaps.push(await transaction.get(db.collection('serviceCatalog').doc(id)));
      const entries = catalogSnaps.filter((item) => item.exists).map((item) => normalizeServiceCatalogEntry({ id: item.id, ...item.data() }));
      const byId = new Map(entries.filter(Boolean).map((item) => [item.id, item]));
      const selectedServices = selection.serviceIds.map((id) => byId.get(id));
      const packageEntry = selection.selectedPackageId ? byId.get(selection.selectedPackageId) : null;
      if (selectedServices.some((item) => !item || !item.active || !item.approved || item.categoryId !== selection.categoryId)
        || (selection.selectedPackageId && (!packageEntry || !packageEntry.active || !packageEntry.approved || packageEntry.categoryId !== selection.categoryId))) {
        return { code: 'service-unavailable' };
      }

      let resolvedOptionSelection = { selectedOption: null, selectedOptionId: '' };
      try {
        resolvedOptionSelection = validateAndResolveOptionSelection(entries, selection.selectedOptionId);
      } catch (error) {
        return { code: error.code || 'invalid-service-option', message: error.message };
      }

      const questions = getQuestionnaireForSelection({
        services: entries,
        selectedPackageId: selection.selectedPackageId,
        selectedOptionId: resolvedOptionSelection.selectedOptionId,
      });
      let answers;
      try {
        const inputAnswers = structuredAnswers === undefined ? currentSelection.answers : structuredAnswers;
        answers = normalizeAndValidateAnswers({ answers: inputAnswers || {}, questions, strictUnknown: true }).answers;
      } catch (error) {
        return { code: 'invalid-service-answers', message: error.message };
      }
      const nextLocation = location === undefined ? request.location || null : normalizeLocation(location, answers).location;
      const labels = selectedServices.map((item) => item.label);
      const optionId = resolvedOptionSelection.selectedOption?.id || '';
      const optionTitle = resolvedOptionSelection.selectedOption?.title || '';
      const baseSummary = packageEntry?.label || labels.join(', ') || 'Service request';
      const summary = optionTitle ? `${baseSummary} — ${optionTitle}` : baseSummary;
      const nextAddress = rawServiceAddress === undefined
        ? answers.service_address || nextLocation?.address || request.serviceAddress || request.requestPayload?.serviceAddress || ''
        : String(rawServiceAddress || '').trim();
      const { serviceAddress } = normalizeLocation(nextLocation, answers, nextAddress);
      const payload = {
        ...(request.requestPayload || {}),
        categoryId: selection.categoryId,
        serviceIds: selection.serviceIds,
        selectedPackageId: selection.selectedPackageId,
        selectedOptionId: optionId,
        selectedOptionTitle: optionTitle,
        summary,
        structuredAnswers: answers,
        location: nextLocation,
        serviceAddress,
        pricingSnapshot: null,
        ...(rawTimingPreference === undefined ? {} : { timingPreference: String(rawTimingPreference || 'now').trim().toLowerCase() === 'later' ? 'later' : 'now' }),
        ...(rawScheduledForText === undefined ? {} : { scheduledForText: String(rawScheduledForText || '').trim().slice(0, 160) }),
      };
      transaction.update(requestRef, {
        categoryId: selection.categoryId,
        serviceIds: selection.serviceIds,
        selectedPackageId: selection.selectedPackageId,
        selectedOptionId: optionId,
        selectedOptionTitle: optionTitle,
        subject: packageEntry?.label || selectedServices[0]?.categoryName || 'Service request',
        topic: optionTitle ? `${labels.join(', ')} (${optionTitle})` : labels.join(', '),
        description: summary,
        serviceSummary: summary,
        structuredAnswers: answers,
        location: nextLocation,
        serviceAddress,
        pricingSnapshot: null,
        quoteExpiresAtMs: null,
        requestPayload: payload,
        ...(rawTimingPreference === undefined ? {} : { timingPreference: payload.timingPreference }),
        ...(rawScheduledForText === undefined ? {} : { scheduledForText: payload.scheduledForText }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { code: 'updated', answers, updatedAtMs: now };
    });
  }

  async function quoteDraft({ requestId, principalId, expiresInMs = 15 * 60 * 1000, now = Date.now() } = {}) {
    const requestRef = db.collection('serviceRequests').doc(String(requestId || '').trim());
    const ownerId = String(principalId || '').trim();
    return db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) return { code: 'request-not-found' };
      const request = requestSnap.data() || {};
      if (!(await isRequestOwnerInTransaction(transaction, db, request, ownerId))) return { code: 'not-owner' };
      if (request.status !== 'collecting_details' || request.helperAssignment?.helperId) return { code: 'invalid-request-state' };
      const { categoryId, serviceIds, selectedPackageId, selectedOptionId, answers } = getRequestSelection(request);
      if (!categoryId || !serviceIds.length) return { code: 'invalid-service-selection' };
      const ids = [...new Set([...serviceIds, ...(selectedPackageId ? [selectedPackageId] : [])])];
      const snapshots = [];
      for (const id of ids) snapshots.push(await transaction.get(db.collection('serviceCatalog').doc(id)));
      const entries = snapshots.filter((item) => item.exists).map((item) => normalizeServiceCatalogEntry({ id: item.id, ...item.data() }));
      let quote;
      try {
        quote = quoteFromCatalogEntries({
          entries,
          categoryId,
          serviceIds,
          selectedPackageId,
          selectedOptionId,
          structuredAnswers: answers,
          strictUnknownAnswers: true,
        });
      } catch (error) {
        return { code: error.code || 'quote-invalid', message: error.message, missingQuestionIds: error.missingQuestionIds || [] };
      }
      const quoteExpiresAtMs = now + Math.max(60_000, Math.min(Number(expiresInMs) || 15 * 60 * 1000, 60 * 60 * 1000));
      const payload = { ...(request.requestPayload || {}), pricingSnapshot: quote, quoteExpiresAtMs };
      transaction.update(requestRef, {
        pricingSnapshot: quote,
        quoteExpiresAtMs,
        statusDetail: 'Quote ready. Waiting for customer approval.',
        requestPayload: payload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { code: 'quoted', quote, quoteExpiresAtMs };
    });
  }

  async function confirmDraft({ requestId, principalId, approvedQuote, quoteExpiresAtMs = 0, callId = '', source = 'customer_request_backend', paymentFlowVersion = null, walletAccountingVersion = null, now = Date.now() } = {}) {
    const requestRef = db.collection('serviceRequests').doc(String(requestId || '').trim());
    const ownerId = String(principalId || '').trim();
    return db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) return { code: 'request-not-found' };
      const request = requestSnap.data() || {};
      if (!(await isRequestOwnerInTransaction(transaction, db, request, ownerId))) return { code: 'not-owner' };
      const status = String(request.status || '').trim().toLowerCase();
      const submitted = ['scheduled_pending', 'matching', 'helper_found', 'no_helper_available'];
      if (submitted.includes(status) && request.pricingSnapshot) return { code: 'already-submitted', request: { id: requestSnap.id, ...request } };
      if (status !== 'collecting_details' || request.helperAssignment?.helperId) return { code: 'invalid-request-state' };
      const persistedExpiry = Number(request.quoteExpiresAtMs || request.requestPayload?.quoteExpiresAtMs || 0);
      const suppliedExpiry = Number(quoteExpiresAtMs || 0);
      const effectiveExpiry = persistedExpiry || suppliedExpiry;
      if (effectiveExpiry > 0 && effectiveExpiry < now) return { code: 'quote-expired' };
      const { categoryId, serviceIds, selectedPackageId, selectedOptionId, answers } = getRequestSelection(request);
      if (!categoryId || !serviceIds.length || serviceIds.length > 30) return { code: 'invalid-service-selection' };
      const ids = [...new Set([...serviceIds, ...(selectedPackageId ? [selectedPackageId] : [])])];
      const snapshots = [];
      for (const id of ids) snapshots.push(await transaction.get(db.collection('serviceCatalog').doc(id)));
      const entries = snapshots.filter((item) => item.exists).map((item) => normalizeServiceCatalogEntry({ id: item.id, ...item.data() }));
      let quote;
      try {
        quote = quoteFromCatalogEntries({
          entries,
          categoryId,
          serviceIds,
          selectedPackageId,
          selectedOptionId,
          structuredAnswers: answers,
          strictUnknownAnswers: true,
        });
      } catch (error) {
        return { code: error.code || 'quote-invalid', message: error.message, missingQuestionIds: error.missingQuestionIds || [] };
      }
      const approvedMatches = Number(approvedQuote?.total) === Number(quote.total)
        && String(approvedQuote?.currency || '') === String(quote.currency || '')
        && String(approvedQuote?.questionnaireVersion || '') === String(quote.questionnaireVersion || '')
        && String(approvedQuote?.serviceCatalogVersion || '') === String(quote.serviceCatalogVersion || '')
        && String(approvedQuote?.selectedOptionId || '') === String(quote.selectedOptionId || '');
      if (!approvedMatches) return { code: 'quote-changed', quote };

      const userSnap = await transaction.get(db.collection('users').doc(ownerId));
      const user = userSnap.exists ? userSnap.data() || {} : {};
      const ownershipIds = [...new Set([ownerId, ...(Array.isArray(user.whatsappGuestPrincipalIds) ? user.whatsappGuestPrincipalIds : [])]
        .map((value) => String(value || '').trim()).filter(Boolean))];
      const activeSnapshots = await Promise.all(ownershipIds.map((id) => transaction.get(db.collection('serviceRequests')
        .where('customerId', '==', id)
        .where('status', 'in', ACTIVE_REQUEST_STATUSES))));
      const active = activeSnapshots.flatMap((snapshot) => snapshot.docs || []).find((item) => item.id !== requestId);
      if (active) return { code: 'active-request', activeRequestId: active.id };

      const timingPreference = String(request.timingPreference || request.requestPayload?.timingPreference || answers.timing_preference || '').trim().toLowerCase() === 'later' ? 'later' : 'now';
      const scheduledForText = String(request.scheduledForText || request.requestPayload?.scheduledForText || answers.scheduled_for_text || '').trim();
      const parsedSchedule = Date.parse(scheduledForText);
      const scheduledForAtMs = Number.isFinite(parsedSchedule) ? parsedSchedule : null;
      const nextStatus = timingPreference === 'later' ? 'scheduled_pending' : 'matching';
      const labels = serviceIds.map((id) => entries.find((item) => item.id === id)?.label || id);
      const packageEntry = entries.find((item) => item.id === selectedPackageId);
      const optionId = quote.selectedOptionId || selectedOptionId || '';
      const optionTitle = quote.selectedOptionTitle || currentOptionTitle(entries, serviceIds, optionId);
      const baseSummary = packageEntry?.label || `${categoryId}: ${labels.join(', ')}`;
      const summary = optionTitle ? `${baseSummary} — ${optionTitle}` : baseSummary;
      const { location, serviceAddress } = normalizeLocation(
        request.location || request.requestPayload?.location,
        answers,
        answers.service_address || request.location?.address || request.serviceAddress || request.requestPayload?.serviceAddress,
      );
      const nextPayload = {
        ...(request.requestPayload || {}), categoryId, serviceIds, selectedPackageId,
        selectedOptionId: optionId, selectedOptionTitle: optionTitle,
        summary, structuredAnswers: answers,
        selectedPortfolioReferences: request.selectedPortfolioReferences || request.requestPayload?.selectedPortfolioReferences || [],
        attachments: request.referenceAttachments || request.requestPayload?.attachments || [],
        pricingSnapshot: quote, timingPreference, scheduledForText, scheduledForAtMs, location, serviceAddress,
        quoteExpiresAtMs: null,
      };
      const submitEventRef = db.collection('customerServiceEvents').doc(`request_submitted_${requestId}`);
      const [submitEventSnap, callSnap] = await Promise.all([
        transaction.get(submitEventRef),
        callId ? transaction.get(db.collection('serviceCalls').doc(callId)) : Promise.resolve(null),
      ]);
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(requestRef, {
        categoryId, serviceIds, selectedPackageId,
        selectedOptionId: optionId, selectedOptionTitle: optionTitle,
        subject: packageEntry?.label || entries.find((item) => item.id === serviceIds[0])?.categoryName || 'Service request',
        topic: optionTitle ? `${labels.join(', ')} (${optionTitle})` : labels.join(', '),
        description: summary, serviceSummary: summary,
        structuredAnswers: answers, pricingSnapshot: quote, quoteExpiresAtMs: null, status: nextStatus,
        statusDetail: timingPreference === 'later'
          ? `Scheduled for ${scheduledForText || 'later'}. Matching will begin closer to the requested time.`
          : 'Searching for a helper.',
        helperQueue: [], currentOfferHelperId: null, offerExpiresAt: null, offerToken: null,
        offerCycleExcludedHelperIds: [], declinedHelperIds: [], lastOfferAt: null, offerRevision: 0,
        helperAssignment: null, matchingStartedAtMs: timingPreference === 'later' ? null : now,
        ...(paymentFlowVersion === 'explicit_v1' ? { paymentFlowVersion: 'explicit_v1' } : {}),
        ...(Number(walletAccountingVersion) === 1 ? { helperWalletAccountingVersion: 1 } : {}),
        location, serviceAddress, requestPayload: nextPayload, updatedAt: timestamp,
      });
      if (!submitEventSnap.exists) {
        transaction.create(submitEventRef, {
          customerId: ownerId, eventType: 'request_submitted', serviceId: serviceIds[0] || selectedPackageId || categoryId,
          categoryId, serviceIds, selectedOptionId: optionId || null, requestId, source,
          metadata: { callId: callId || null, timingPreference, selectedOptionTitle: optionTitle || null },
          createdAt: timestamp, createdAtMs: now, dayBucket: new Date(now).toISOString().slice(0, 10),
        });
      }
      if (callId && callSnap?.exists && String(callSnap.data()?.customerId || '') === ownerId) {
        transaction.update(db.collection('serviceCalls').doc(callId), {
          status: 'completed', updatedAt: timestamp,
          aiLive: { agentType: 'customer_request', status: 'ended', wsConnected: false, audioInActive: false, audioOutActive: false, transcriptStatus: 'finalized', endedAt: timestamp, updatedAt: timestamp },
        });
      }
      return { code: 'submitted', quote, status: nextStatus };
    });
  }

  return { createDraft, updateDraft, quoteDraft, confirmDraft };
}

function currentOptionTitle(entries = [], serviceIds = [], optionId = '') {
  if (!optionId) return '';
  for (const id of serviceIds) {
    const entry = entries.find((item) => item?.id === id);
    const opt = (entry?.options || []).find((item) => String(item?.id || '').toLowerCase() === String(optionId).toLowerCase());
    if (opt?.title) return opt.title;
  }
  return '';
}

module.exports = { ACTIVE_REQUEST_STATUSES, createMarketplaceRequestOperations };
