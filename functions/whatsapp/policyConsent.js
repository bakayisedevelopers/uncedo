'use strict';

const WHATSAPP_POLICY_URLS = Object.freeze({
  terms: 'https://uncedo.bakayise.com/terms',
  privacy: 'https://uncedo.bakayise.com/privacy-policy',
});
// Increment this after the published policy content changes so prior
// acknowledgements are not silently treated as acceptance of new terms.
const WHATSAPP_POLICY_ACCEPTANCE_VERSION = 'uncedo-whatsapp-policies-2026-10';

function hasCurrentWhatsAppPolicyAcceptance(conversation = {}) {
  return Number(conversation.whatsappPolicyAcceptedAtMs || 0) > 0
    && String(conversation.whatsappPolicyAcceptedVersion || '') === WHATSAPP_POLICY_ACCEPTANCE_VERSION;
}

function buildWhatsAppPolicyConsent() {
  const text = [
    'Before continuing on WhatsApp, please review Uncedo’s policies:',
    `Terms and Conditions: ${WHATSAPP_POLICY_URLS.terms}`,
    `Privacy Policy: ${WHATSAPP_POLICY_URLS.privacy}`,
    'Choose Agree to accept these policies and continue, or No thanks to stop here.',
  ].join('\n');

  return {
    text,
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'wa_ai_consent_yes', title: 'Agree' } },
          { type: 'reply', reply: { id: 'wa_ai_consent_no', title: 'No thanks' } },
        ],
      },
    },
  };
}

module.exports = {
  WHATSAPP_POLICY_ACCEPTANCE_VERSION,
  WHATSAPP_POLICY_URLS,
  buildWhatsAppPolicyConsent,
  hasCurrentWhatsAppPolicyAcceptance,
};
