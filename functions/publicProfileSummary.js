'use strict';

function safeText(value, max = 120) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeHttpsUrl(value) {
  const candidate = safeText(value, 1000);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch (_) {
    return '';
  }
}

function buildPublicTutorSummary(profile = {}, fallbackName = '') {
  const rawRating = Number(profile.tutorProfile?.overallRating ?? profile.ratings?.asTutor?.average ?? 0);
  return {
    name: safeText(profile.fullName || profile.displayName || fallbackName || 'Helper'),
    profilePhoto: safeHttpsUrl(profile.profilePhoto || profile.photoURL || ''),
    rating: Number.isFinite(rawRating) && rawRating >= 0 && rawRating <= 5 ? rawRating : 0,
  };
}

module.exports = { buildPublicTutorSummary, safeHttpsUrl, safeText };
