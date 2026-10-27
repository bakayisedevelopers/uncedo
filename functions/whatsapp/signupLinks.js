'use strict';

const DEFAULT_SIGNUP_URLS = Object.freeze({
  customer: 'https://uncedo.bakayise.com/sign-up',
  helper: 'https://helpers.bakayise.com/sign-up',
});

function getWhatsAppSignupUrl({ role, mode = 'signup', env = process.env } = {}) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (!Object.hasOwn(DEFAULT_SIGNUP_URLS, normalizedRole)) {
    throw new Error('A supported WhatsApp account role is required.');
  }
  if (!['signup', 'signin'].includes(normalizedMode)) {
    throw new Error('A supported WhatsApp account setup mode is required.');
  }

  const envName = normalizedRole === 'helper' ? 'WHATSAPP_HELPER_SIGNUP_URL' : 'WHATSAPP_CUSTOMER_SIGNUP_URL';
  const configured = String(env?.[envName] || DEFAULT_SIGNUP_URLS[normalizedRole]).trim();
  let url;
  try {
    url = new URL(configured);
  } catch (_) {
    throw new Error('The WhatsApp account setup URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('The WhatsApp account setup URL must use HTTPS and cannot contain credentials.');
  }

  url.pathname = normalizedMode === 'signin' ? '/sign-in' : '/sign-up';
  url.searchParams.set('source', 'whatsapp');
  return url;
}

function getWhatsAppAccountLinkUrl({ role, env = process.env } = {}) {
  const url = getWhatsAppSignupUrl({ role, mode: 'signup', env });
  url.pathname = '/whatsapp-link';
  url.search = '';
  url.hash = '';
  return url;
}

function getWhatsAppHelperAgreementUrl({ env = process.env } = {}) {
  const configured = String(env?.WHATSAPP_HELPER_AGREEMENT_URL || 'https://helpers.bakayise.com/sign-agreement').trim();
  let url;
  try {
    url = new URL(configured);
  } catch (_) {
    throw new Error('The WhatsApp helper agreement URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('The WhatsApp helper agreement URL must use HTTPS and cannot contain credentials.');
  }
  return url.toString();
}

module.exports = {
  DEFAULT_SIGNUP_URLS,
  getWhatsAppSignupUrl,
  getWhatsAppAccountLinkUrl,
  getWhatsAppHelperAgreementUrl,
};
