'use strict';

const { buildServiceOptionMasteryKey, normalizeRewardToken } = require('../shared/rewards');
const { serviceOptionsFor } = require('../rewards/ratingService');

const MASTERY_LABELS = Object.freeze({
  beginner: 'Beginner',
  verified: 'Verified',
  specialist: 'Specialist',
  master: 'Master',
  legend: 'Legend',
});

function formatMasteryLabel(level = 'beginner') {
  const normalized = String(level || 'beginner').trim().toLowerCase();
  return MASTERY_LABELS[normalized] || 'Beginner';
}

function cleanInline(value = '', max = 140) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function pickPrimaryRequestedOption(request = {}) {
  const expandedOptions = serviceOptionsFor(request);
  const first = expandedOptions[0] || null;
  const serviceId = String(first?.serviceId || request.selectedPackageId || request.serviceIds?.[0] || '').trim();
  const optionId = normalizeRewardToken(
    first?.optionId
      || request.selectedOptionId
      || request.requestPayload?.selectedOptionId
      || request.pricingSnapshot?.selectedOptionId
      || request.structuredAnswers?.selectedOptionId
      || '',
  );
  const optionTitle = cleanInline(
    first?.optionTitle
      || request.selectedOptionTitle
      || request.requestPayload?.selectedOptionTitle
      || request.pricingSnapshot?.selectedOptionTitle
      || '',
    120,
  );
  const masteryKey = first?.masteryKey || buildServiceOptionMasteryKey(serviceId, optionId);
  const fallbackServiceLabel = cleanInline(request.serviceSummary || request.subject || serviceId || 'Requested service', 120);

  return {
    serviceId,
    optionId,
    optionTitle,
    masteryKey,
    optionDisplayName: optionTitle || fallbackServiceLabel,
  };
}

function buildAcceptanceSummaryFromDocs({
  request = {},
  helperId = '',
  helperUser = null,
  optionMastery = null,
  optionRating = null,
  serviceMastery = null,
  serviceRating = null,
} = {}) {
  const assignment = request.helperAssignment && typeof request.helperAssignment === 'object'
    ? request.helperAssignment
    : request.pendingBusyAssignment && typeof request.pendingBusyAssignment === 'object'
      ? request.pendingBusyAssignment
      : {};

  const target = pickPrimaryRequestedOption(request);
  const hasOption = Boolean(target.optionId);
  const effectiveMastery = optionMastery || (!hasOption ? serviceMastery : null) || {};
  const effectiveRating = optionRating || (!hasOption ? serviceRating : null) || {};

  const helperName = cleanInline(
    assignment.helperName
      || helperUser?.fullName
      || helperUser?.displayName
      || helperUser?.name
      || 'Your helper',
    100,
  ) || 'Your helper';

  const businessName = cleanInline(helperUser?.businessName || '', 100);
  const providerType = String(helperUser?.providerType || '').trim().toLowerCase();
  const helperPhone = cleanInline(
    assignment.helperPhone
      || helperUser?.phoneNumber
      || helperUser?.whatsappPhoneNumber
      || '',
    40,
  );
  const helperCity = cleanInline(helperUser?.city || helperUser?.liveLocation?.city || '', 80);
  const verified = String(helperUser?.verificationStatus || '').trim().toLowerCase() === 'verified';

  const masteryLevel = String(effectiveMastery?.level || 'beginner').trim().toLowerCase();
  const masteryLabel = formatMasteryLabel(masteryLevel);

  const completedJobsCount = Math.max(
    0,
    Math.floor(
      Number(
        effectiveMastery?.eligibleCompletedJobCount
          ?? effectiveMastery?.qualificationSnapshot?.eligibleCompletedJobCount
          ?? 0,
      ) || 0,
    ),
  );

  const ratingCount = Math.max(
    0,
    Math.floor(
      Number(
        effectiveRating?.count
          ?? effectiveRating?.overallCount
          ?? effectiveMastery?.ratingCount
          ?? effectiveMastery?.qualificationSnapshot?.ratingCount
          ?? 0,
      ) || 0,
    ),
  );

  const rawAverage = Number(
    effectiveRating?.average
      ?? effectiveRating?.overallAverage
      ?? effectiveMastery?.averageRating
      ?? effectiveMastery?.qualificationSnapshot?.averageRating
      ?? 0,
  );
  const optionRatingAverage = Number.isFinite(rawAverage) && rawAverage > 0 ? Number(rawAverage.toFixed(1)) : 0;

  return {
    helperId: String(helperId || assignment.helperId || '').trim(),
    helperName,
    businessName: businessName && businessName.toLowerCase() !== helperName.toLowerCase() ? businessName : '',
    providerType,
    helperPhone,
    helperCity,
    verified,
    serviceId: target.serviceId,
    optionId: target.optionId,
    optionTitle: target.optionTitle,
    optionDisplayName: target.optionDisplayName,
    masteryKey: target.masteryKey,
    masteryLevel,
    masteryLabel,
    completedJobsCount,
    optionRatingAverage,
    optionRatingCount: ratingCount,
  };
}

async function resolveHelperAcceptanceSummary({ db, request = {}, helperId = '' } = {}) {
  const safeHelperId = String(
    helperId
      || request?.helperAssignment?.helperId
      || request?.pendingBusyAssignment?.helperId
      || '',
  ).trim();

  if (!db || !safeHelperId) {
    return buildAcceptanceSummaryFromDocs({ request, helperId: safeHelperId });
  }

  const target = pickPrimaryRequestedOption(request);
  const masteryKey = String(target.masteryKey || target.serviceId || '').trim();
  const hasOption = Boolean(target.optionId);

  const [helperSnap, optionMasterySnap, optionRatingSnap, serviceMasterySnap, serviceRatingSnap] = await Promise.all([
    db.collection('users').doc(safeHelperId).get().catch(() => null),
    masteryKey
      ? db.collection('helperMastery').doc(safeHelperId).collection('serviceOptions').doc(masteryKey).get().catch(() => null)
      : Promise.resolve(null),
    masteryKey
      ? db.collection('ratingAccounts').doc(safeHelperId).collection('serviceOptions').doc(masteryKey).get().catch(() => null)
      : Promise.resolve(null),
    !hasOption && target.serviceId
      ? db.collection('helperMastery').doc(safeHelperId).collection('services').doc(target.serviceId).get().catch(() => null)
      : Promise.resolve(null),
    !hasOption && target.serviceId
      ? db.collection('ratingAccounts').doc(safeHelperId).collection('services').doc(target.serviceId).get().catch(() => null)
      : Promise.resolve(null),
  ]);

  return buildAcceptanceSummaryFromDocs({
    request,
    helperId: safeHelperId,
    helperUser: helperSnap?.exists ? helperSnap.data() || {} : null,
    optionMastery: optionMasterySnap?.exists ? optionMasterySnap.data() || {} : null,
    optionRating: optionRatingSnap?.exists ? optionRatingSnap.data() || {} : null,
    serviceMastery: serviceMasterySnap?.exists ? serviceMasterySnap.data() || {} : null,
    serviceRating: serviceRatingSnap?.exists ? serviceRatingSnap.data() || {} : null,
  });
}

function formatOptionRatingText(average = 0, count = 0) {
  if (count > 0 && average > 0) {
    return `${average.toFixed(1)} ★ (${count} ${count === 1 ? 'rating' : 'ratings'})`;
  }
  return 'New (no option ratings yet)';
}

function formatCompletedJobsText(count = 0) {
  const safe = Math.max(0, Math.floor(Number(count) || 0));
  return `${safe} completed ${safe === 1 ? 'job' : 'jobs'}`;
}

function buildCustomerRequestAcceptedWhatsAppText({
  request = {},
  beforeStatus = '',
  helperSummary = null,
} = {}) {
  const summary = helperSummary || buildAcceptanceSummaryFromDocs({ request });
  const serviceName = cleanInline(request.serviceSummary || request.subject || 'your Uncedo service', 140) || 'your Uncedo service';
  const refCode = cleanInline(request.publicRequestReference || request.requestReference || '', 40);
  const refPrefix = refCode ? `[*${refCode}*] ` : '';
  const helperName = summary.helperName || 'Your helper';

  const headline = String(beforeStatus || '').toLowerCase() === 'helper_queued'
    ? `${refPrefix}✅ *${helperName}* finished their previous job and is now heading your way for *${serviceName}*!`
    : `${refPrefix}✅ *${helperName}* has accepted your *${serviceName}* request and is preparing to head your way.`;

  const detailLines = [
    '*Helper Details*',
    `• Name: *${helperName}*${summary.verified ? ' (Verified)' : ''}`,
  ];
  if (summary.businessName) {
    detailLines.push(`• Business: ${summary.businessName}`);
  }
  if (summary.helperPhone) {
    detailLines.push(`• Phone: ${summary.helperPhone}`);
  }
  if (summary.helperCity) {
    detailLines.push(`• Area: ${summary.helperCity}`);
  }

  const optionLines = [
    `*${summary.optionDisplayName} Track Record*`,
    `• Mastery badge: *${summary.masteryLabel}*`,
    `• Option rating: *${formatOptionRatingText(summary.optionRatingAverage, summary.optionRatingCount)}*`,
    `• Experience: *${formatCompletedJobsText(summary.completedJobsCount)}* for this option`,
  ];

  return [headline, '', detailLines.join('\n'), '', optionLines.join('\n')].join('\n');
}

module.exports = {
  buildAcceptanceSummaryFromDocs,
  buildCustomerRequestAcceptedWhatsAppText,
  formatCompletedJobsText,
  formatMasteryLabel,
  formatOptionRatingText,
  pickPrimaryRequestedOption,
  resolveHelperAcceptanceSummary,
};
