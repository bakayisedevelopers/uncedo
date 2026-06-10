export const WEB_APP_BASE_URL = 'https://parakleo.bakayise.com';

export const LEGAL_URLS = {
  terms: `${WEB_APP_BASE_URL}/terms`,
  privacy: `${WEB_APP_BASE_URL}/privacy-policy`,
  payment: `${WEB_APP_BASE_URL}/payment-pricing-policy`,
  refund: `${WEB_APP_BASE_URL}/refund-policy`,
  dataVoice: `${WEB_APP_BASE_URL}/data-voice-policy`,
};

export const LEGAL_LINKS = [
  { href: LEGAL_URLS.terms, label: 'Terms of Service' },
  { href: LEGAL_URLS.privacy, label: 'Privacy Policy' },
  { href: LEGAL_URLS.payment, label: 'Payment Policy' },
  { href: LEGAL_URLS.refund, label: 'Refund Policy' },
  { href: LEGAL_URLS.dataVoice, label: 'Data and Voice Policy' },
];
