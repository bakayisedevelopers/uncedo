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
    if (!record?.uid || !role || !profilePhones.includes(expectedPhone)) continue;
    if (authPhone && authPhone !== expectedPhone) continue;
    eligibleByUid.set(String(record.uid), { uid: String(record.uid), role });
  }
  return eligibleByUid.size === 1 ? [...eligibleByUid.values()][0] : null;
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
  selectUniqueVerifiedWhatsAppAccount,
  selectUniqueWhatsAppAccountCandidate,
};
