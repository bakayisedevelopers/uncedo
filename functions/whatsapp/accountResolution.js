'use strict';

function normalizeAccountPhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
}

function profileRole(profile = {}) {
  const values = [profile.role, profile.activeRole, ...(Array.isArray(profile.roles) ? profile.roles : [])]
    .map((value) => String(value || '').trim().toLowerCase());
  const roles = [...new Set(values.filter((value) => value === 'customer' || value === 'helper'))];
  return roles.length === 1 ? roles[0] : '';
}

function selectUniqueWhatsAppAccountCandidate(records = [], phoneNumber = '') {
  const expectedPhone = normalizeAccountPhone(phoneNumber);
  if (!expectedPhone) return null;
  const eligibleByUid = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const profile = record?.profile || {};
    const role = profileRole(profile);
    const profilePhones = [profile.whatsappPhoneNumber, profile.phoneNumber]
      .map(normalizeAccountPhone)
      .filter(Boolean);
    const authPhone = normalizeAccountPhone(record?.authPhone);
    const authPhoneMatches = record?.authPhoneVerified === true && authPhone === expectedPhone;
    if (!record?.uid || !role || (!profilePhones.includes(expectedPhone) && !authPhoneMatches)) continue;
    if (authPhone && authPhone !== expectedPhone) continue;
    eligibleByUid.set(String(record.uid), { uid: String(record.uid), role });
  }
  return eligibleByUid.size === 1 ? [...eligibleByUid.values()][0] : null;
}

function resolveUniqueWhatsAppCustomerAccount(records = [], phoneNumber = '') {
  const expectedPhone = normalizeAccountPhone(phoneNumber);
  if (!expectedPhone) return { status: 'unavailable', candidate: null, linkMode: '' };

  const matchingByUid = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const uid = String(record?.uid || '').trim();
    if (!uid) continue;
    const profile = record?.profile || {};
    const profilePhoneMatches = [profile.whatsappPhoneNumber, profile.phoneNumber]
      .map(normalizeAccountPhone)
      .includes(expectedPhone);
    const authPhone = normalizeAccountPhone(record?.authPhone);
    const authPhoneMatches = record?.authPhoneVerified === true && authPhone === expectedPhone;
    if (!profilePhoneMatches && !authPhoneMatches) continue;

    const previous = matchingByUid.get(uid) || {};
    matchingByUid.set(uid, {
      ...previous,
      ...record,
      uid,
      profile: Object.keys(profile).length ? profile : previous.profile || {},
      profileExists: record?.profileExists === true || Object.keys(profile).length > 0 || previous.profileExists === true,
      profilePhoneMatches: profilePhoneMatches || previous.profilePhoneMatches === true,
      authPhoneMatches: authPhoneMatches || previous.authPhoneMatches === true,
      authPhoneVerified: authPhoneMatches || previous.authPhoneVerified === true,
    });
  }

  if (!matchingByUid.size) return { status: 'not-found', candidate: null, linkMode: '' };
  if (matchingByUid.size !== 1) return { status: 'ambiguous', candidate: null, linkMode: '' };

  const record = [...matchingByUid.values()][0];
  if (record.authPhone && normalizeAccountPhone(record.authPhone) !== expectedPhone) {
    return { status: 'unsupported', candidate: null, linkMode: '' };
  }
  const existingWhatsAppPhone = normalizeAccountPhone(record.profile?.whatsappPhoneNumber);
  if (existingWhatsAppPhone && existingWhatsAppPhone !== expectedPhone) {
    return { status: 'unsupported', candidate: null, linkMode: '' };
  }
  const roles = [record.profile?.role, record.profile?.activeRole,
    ...(Array.isArray(record.profile?.roles) ? record.profile.roles : []), record.authRole]
    .map((role) => String(role || '').trim().toLowerCase())
    .filter(Boolean);
  const uniqueRoles = [...new Set(roles)];
  if (uniqueRoles.some((role) => !['customer', 'student', 'client'].includes(role))) {
    return { status: 'unsupported', candidate: null, linkMode: '' };
  }
  if (uniqueRoles.length > 1) return { status: 'ambiguous', candidate: null, linkMode: '' };

  const role = 'customer';
  const candidate = { uid: record.uid, role };
  if (record.profilePhoneMatches && record.profileExists) {
    return { status: 'found', candidate, linkMode: 'account-link' };
  }
  if (record.authPhoneMatches) {
    return { status: 'found', candidate, linkMode: 'signin' };
  }
  return { status: 'unsupported', candidate: null, linkMode: '' };
}

function selectUniqueVerifiedWhatsAppAccount(records = [], phoneNumber = '') {
  const expectedPhone = normalizeAccountPhone(phoneNumber);
  if (!expectedPhone) return null;
  const eligible = (Array.isArray(records) ? records : []).filter((record) => {
    const profile = record?.profile || {};
    const verified = Boolean(record?.authPhoneVerified)
      || (Boolean(profile.whatsappVerifiedAt) && normalizeAccountPhone(profile.whatsappPhoneNumber) === expectedPhone)
      || (profile.phoneNumberVerified === true && Boolean(profile.phoneNumberVerifiedAt)
        && normalizeAccountPhone(profile.phoneNumber) === expectedPhone);
    const storedPhone = normalizeAccountPhone(record?.authPhone || profile.whatsappPhoneNumber || profile.phoneNumber);
    return Boolean(record?.uid && profileRole(profile) && verified && storedPhone === expectedPhone);
  });
  return eligible.length === 1 ? { uid: String(eligible[0].uid), role: profileRole(eligible[0].profile) } : null;
}

module.exports = {
  normalizeAccountPhone,
  profileRole,
  resolveUniqueWhatsAppCustomerAccount,
  selectUniqueVerifiedWhatsAppAccount,
  selectUniqueWhatsAppAccountCandidate,
};
