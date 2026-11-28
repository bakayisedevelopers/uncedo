'use strict';

const { normalizeGeoCoordinates } = require('../serviceAddressGeocoding');

function extractSavedAddressFromRecords(...records) {
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const candidates = [
      record.homeAddress,
      record.savedAddress,
      record.serviceAddress,
      record.customerProfile?.serviceAddress,
      record.customerProfile?.homeAddress,
      record.customerProfile?.address,
    ];
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim().slice(0, 500);
      if (normalized) return normalized;
    }
  }
  return '';
}

function extractSavedHomeLocationFromRecords(...records) {
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const candidates = [
      record.homeLocation,
      record.customerProfile?.homeLocation,
      record.customerProfile?.location,
      record.location,
    ];
    for (const candidate of candidates) {
      const coords = normalizeGeoCoordinates(candidate);
      if (coords) return coords;
    }
  }
  return null;
}

function getValidDraftServiceLocation(location = null, nowMs = Date.now(), isPinFresh = null) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) return null;
  const address = String(location.address || '').trim().slice(0, 500);
  const name = String(location.name || '').trim().slice(0, 200);
  const coords = normalizeGeoCoordinates(location);

  if (address) {
    return {
      ...location,
      address,
      name,
      latitude: coords ? coords.latitude : null,
      longitude: coords ? coords.longitude : null,
    };
  }

  if (coords) {
    if (typeof isPinFresh === 'function' && !isPinFresh({ ...location, ...coords }, nowMs)) {
      return null;
    }
    return {
      ...location,
      address: '',
      name,
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
  }

  return null;
}

function resolveExplicitServiceAddressTargetReply(
  text = '',
  { allowedQuestionIds = [], missingQuestionIds = [], questionOptions = [] } = {},
) {
  const allowed = new Set((Array.isArray(allowedQuestionIds) ? allowedQuestionIds : []).map((id) => String(id || '').trim()));
  if (!allowed.has('service_address_target')) return '';

  const trimmed = String(text || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!trimmed) return '';

  const isAddressTargetNext = Array.isArray(missingQuestionIds) && missingQuestionIds[0] === 'service_address_target';
  let matched = '';

  if (
    /\b(?:use\s+(?:my\s+)?saved\s+(?:home\s+)?address|my\s+saved\s+(?:home\s+)?address|saved\s+(?:home\s+)?address|use\s+(?:my\s+)?home\s+address|home\s+address|same\s+saved\s+address|profile\s+address)\b/.test(trimmed)
    || (isAddressTargetNext && /^(?:saved|home|2|use\s+saved|my\s+saved|saved\s+one)$/.test(trimmed))
  ) {
    matched = 'saved_home_address';
  } else if (
    /\b(?:use\s+(?:my\s+)?current\s+location|my\s+current\s+location|current\s+location)\b/.test(trimmed)
    || (isAddressTargetNext && /^(?:current|gps|pin|1|my\s+location)$/.test(trimmed))
  ) {
    matched = 'current_location';
  } else if (
    /\b(?:use\s+(?:a\s+)?(?:another|different|other|new)\s+address|another\s+address|different\s+address)\b/.test(trimmed)
    || (isAddressTargetNext && /^(?:another|other|different|3)$/.test(trimmed))
  ) {
    matched = 'another_address';
  } else if (
    /\b(?:helper\s+location|at\s+(?:the\s+)?helper|go\s+to\s+helper)\b/.test(trimmed)
    || (isAddressTargetNext && /^(?:helper|4)$/.test(trimmed))
  ) {
    matched = 'helper_location';
  }

  if (!matched) return '';

  const options = Array.isArray(questionOptions) ? questionOptions : [];
  if (options.length > 0) {
    const allowedOptionValues = new Set(
      options
        .map((opt) => String(typeof opt === 'string' ? opt : (opt?.value || opt?.id || '')).trim().toLowerCase())
        .filter(Boolean),
    );
    if (!allowedOptionValues.has(matched)) return '';
  }

  return matched;
}

function resolveSavedAddressConfirmationReply(text = '') {
  const normalized = String(text || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?]+$/g, '')
    .toLowerCase();
  if (!normalized) return '';

  if (/^(?:yes|y|yeah|yep|yup|confirm|confirmed|confirm\s+address|correct|ok|okay|sure|right|use\s+it|use\s+saved|use\s+saved\s+address|use\s+this\s+address|that\s+address|yes\s+confirm|yes\s+please|use\s+home\s+address|1)$/.test(normalized)) {
    return 'confirm';
  }

  if (/^(?:no|n|nope|change|change\s+address|edit|edit\s+address|update|update\s+address|different|different\s+address|another|another\s+address|new\s+address|provide\s+new\s+address|not\s+this|wrong|wrong\s+address|2)$/.test(normalized)) {
    return 'change';
  }

  return '';
}

function evaluateSavedAddressWorkflow({
  serviceId = '',
  targetRequiresSavedAddress = false,
  savedHomeAddress = '',
  savedHomeCoordinates = null,
  activeDraft = null,
  effectiveLocation = null,
  inbound = null,
  originalUserText = '',
  explicitAddressTargetReply = '',
} = {}) {
  if (!targetRequiresSavedAddress) {
    return {
      handled: false,
      effectiveLocation,
      awaitingSavedAddressInput: false,
      awaitingAnotherAddress: false,
      awaitingSavedAddressConfirmation: false,
      savedAddressConfirmed: false,
      confirmedSavedAddress: '',
      switchTargetTo: '',
      shouldPersistHomeAddress: '',
      promptKind: '',
    };
  }

  const normalizedSavedAddress = String(savedHomeAddress || '').trim().slice(0, 500);
  const hasSavedHomeAddress = Boolean(normalizedSavedAddress);
  const isSameDraft = Boolean(activeDraft && String(activeDraft.serviceId || '') === String(serviceId || ''));
  const isAwaitingConfirmation = isSameDraft && activeDraft.awaitingSavedAddressConfirmation === true;

  let actionReply = '';
  if (inbound?.actionChoice?.type === 'saved_address_confirmation') {
    actionReply = String(inbound.actionChoice.action || '').trim().toLowerCase();
  } else if (isAwaitingConfirmation && inbound?.type === 'text' && !inbound?.actionChoice) {
    actionReply = resolveSavedAddressConfirmationReply(originalUserText);
  }

  if (actionReply === 'change') {
    return {
      handled: true,
      effectiveLocation: null,
      awaitingSavedAddressInput: false,
      awaitingAnotherAddress: true,
      awaitingSavedAddressConfirmation: false,
      savedAddressConfirmed: false,
      confirmedSavedAddress: '',
      switchTargetTo: 'another_address',
      shouldPersistHomeAddress: '',
      promptKind: 'provide_new_address',
    };
  }

  if (hasSavedHomeAddress) {
    const existingCoords = normalizeGeoCoordinates(effectiveLocation);
    const matchesSavedAddress = String(effectiveLocation?.address || '').trim() === normalizedSavedAddress;
    const resolvedCoords = (matchesSavedAddress && existingCoords) ? existingCoords : savedHomeCoordinates;
    const nextLocation = {
      ...(resolvedCoords || {}),
      address: normalizedSavedAddress,
      source: resolvedCoords ? 'saved_profile_coords' : 'saved_profile',
    };
    const alreadyConfirmedSameAddress = isSameDraft
      && activeDraft.savedAddressConfirmed === true
      && String(activeDraft.confirmedSavedAddress || '').trim() === normalizedSavedAddress;
    const confirmedNow = actionReply === 'confirm';

    if (alreadyConfirmedSameAddress || confirmedNow) {
      return {
        handled: true,
        effectiveLocation: nextLocation,
        awaitingSavedAddressInput: false,
        awaitingAnotherAddress: false,
        awaitingSavedAddressConfirmation: false,
        savedAddressConfirmed: true,
        confirmedSavedAddress: normalizedSavedAddress,
        switchTargetTo: '',
        shouldPersistHomeAddress: '',
        promptKind: '',
      };
    }

    return {
      handled: true,
      effectiveLocation: nextLocation,
      awaitingSavedAddressInput: false,
      awaitingAnotherAddress: false,
      awaitingSavedAddressConfirmation: true,
      savedAddressConfirmed: false,
      confirmedSavedAddress: '',
      switchTargetTo: '',
      shouldPersistHomeAddress: '',
      promptKind: 'confirm_saved_address',
    };
  }

  const awaitingProvidedHomeAddress = isSameDraft
    && (activeDraft.awaitingSavedAddressInput === true || activeDraft.awaitingAnotherAddress === true);
  if (
    awaitingProvidedHomeAddress
    && inbound?.type === 'text'
    && !inbound?.actionChoice
    && !explicitAddressTargetReply
  ) {
    const candidateAddress = String(originalUserText || '').trim().slice(0, 500);
    if (
      candidateAddress.length >= 5
      && !/^(?:cancel|stop|help|menu|services|yes|no|confirm)$/i.test(candidateAddress)
    ) {
      return {
        handled: true,
        effectiveLocation: {
          address: candidateAddress,
          source: 'whatsapp_provided_home_address',
        },
        awaitingSavedAddressInput: false,
        awaitingAnotherAddress: false,
        awaitingSavedAddressConfirmation: false,
        savedAddressConfirmed: true,
        confirmedSavedAddress: candidateAddress,
        switchTargetTo: '',
        shouldPersistHomeAddress: candidateAddress,
        promptKind: '',
      };
    }
  }

  const pinProvidedWhileAwaitingHome = isSameDraft
    && activeDraft.awaitingSavedAddressInput === true
    && Boolean(effectiveLocation?.address || normalizeGeoCoordinates(effectiveLocation));
  if (pinProvidedWhileAwaitingHome) {
    const providedAddr = String(effectiveLocation?.address || '').trim().slice(0, 500);
    return {
      handled: true,
      effectiveLocation,
      awaitingSavedAddressInput: false,
      awaitingAnotherAddress: false,
      awaitingSavedAddressConfirmation: false,
      savedAddressConfirmed: true,
      confirmedSavedAddress: providedAddr,
      switchTargetTo: '',
      shouldPersistHomeAddress: providedAddr.length >= 5 ? providedAddr : '',
      promptKind: '',
    };
  }

  return {
    handled: true,
    effectiveLocation: null,
    awaitingSavedAddressInput: true,
    awaitingAnotherAddress: true,
    awaitingSavedAddressConfirmation: false,
    savedAddressConfirmed: false,
    confirmedSavedAddress: '',
    switchTargetTo: '',
    shouldPersistHomeAddress: '',
    promptKind: 'missing_home_address',
  };
}

module.exports = {
  evaluateSavedAddressWorkflow,
  extractSavedAddressFromRecords,
  extractSavedHomeLocationFromRecords,
  getValidDraftServiceLocation,
  resolveExplicitServiceAddressTargetReply,
  resolveSavedAddressConfirmationReply,
};
