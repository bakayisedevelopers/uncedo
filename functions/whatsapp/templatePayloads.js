'use strict';

function textParameter(value, maxLength = 1024) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  if (!text) throw new Error('WhatsApp template text parameters must not be empty.');
  return { type: 'text', text };
}

function body(parameters) {
  return [{ type: 'body', parameters }];
}

function buildOtpTemplateComponents(code) {
  if (!/^\d{6}$/.test(String(code || ''))) throw new Error('WhatsApp OTP template requires a six digit code.');
  return body([textParameter(code, 6)]);
}

function buildHelperOfferTemplateComponents({ serviceSummary, amountText, acceptActionId, declineActionId } = {}) {
  if (!/^wa_[a-f0-9]{64}$/i.test(String(acceptActionId || '')) || !/^wa_[a-f0-9]{64}$/i.test(String(declineActionId || ''))) {
    throw new Error('WhatsApp helper offer actions require valid server-created action references.');
  }
  return [
    ...body([textParameter(serviceSummary, 500), textParameter(amountText, 80)]),
    { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `wa_offer_accept_${acceptActionId}` }] },
    { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `wa_offer_decline_${declineActionId}` }] },
  ];
}

function buildSupportReplyTemplateComponents(replyText) {
  return body([textParameter(replyText, 1024)]);
}

function buildServiceUpdateTemplateComponents({ service, update } = {}) {
  return body([textParameter(service, 180), textParameter(update, 240)]);
}

function buildCashConfirmationTemplateComponents({ requestReference, amountText } = {}) {
  return body([textParameter(requestReference, 128), textParameter(amountText, 80)]);
}

module.exports = {
  buildCashConfirmationTemplateComponents,
  buildHelperOfferTemplateComponents,
  buildOtpTemplateComponents,
  buildServiceUpdateTemplateComponents,
  buildSupportReplyTemplateComponents,
};
