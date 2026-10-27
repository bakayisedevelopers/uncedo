'use strict';

const { formatWhatsAppText } = require('./messageFormatting');

function safeLabel(value, maxLength = 180) {
  return formatWhatsAppText(value).replace(/\n/g, ' ').trim().slice(0, maxLength);
}

function renderWhatsAppQuestion(question = {}) {
  const prompt = safeLabel(question.prompt || 'Please provide this detail.', 300);
  const options = (Array.isArray(question.options) ? question.options : [])
    .map((option) => safeLabel(option?.label || option?.value || '', 140))
    .filter(Boolean);
  return options.length
    ? `*${prompt}*\n\n${options.map((option) => `• ${option}`).join('\n')}`
    : `*${prompt}*`;
}

function formatWhatsAppBookingConfirmation({ service = {}, questions = [], answers = {}, quote = {} } = {}) {
  const serviceLabel = safeLabel(service.label || 'Selected service', 180);
  const questionList = Array.isArray(questions) ? questions : [];
  const answerMap = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  const detailLines = questionList
    .map((question) => {
      const raw = answerMap[question.id];
      const values = Array.isArray(raw) ? raw : raw == null || String(raw).trim() === '' ? [] : [raw];
      if (!values.length) return '';
      const optionLabels = new Map((Array.isArray(question.options) ? question.options : [])
        .map((option) => [String(option.value || '').toLowerCase(), safeLabel(option.label || option.value || '', 140)]));
      const display = values
        .map((value) => optionLabels.get(String(value).toLowerCase()) || safeLabel(value, 260))
        .filter(Boolean)
        .join(', ');
      if (!display) return '';
      return `• *${safeLabel(question.prompt || question.id, 160)}:* ${display}`;
    })
    .filter(Boolean)
    .slice(0, 20);

  const total = Number(quote.total);
  const normalizedCurrency = String(quote.currency || 'ZAR').trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : 'ZAR';
  const amount = Number.isFinite(total) ? total.toFixed(2) : '0.00';
  const formattedAmount = currency === 'ZAR' ? `R${amount}` : `${currency} ${amount}`;
  const sections = [
    '*Please review your service request*',
    `*Service:* ${serviceLabel}`,
    detailLines.length ? `*Details:*\n${detailLines.join('\n')}` : '',
    `*Final quote: ${formattedAmount}*`,
    'This amount comes from the current Uncedo pricing calculation.',
    'Choose *Confirm* to submit this request or *Edit details* to make a change.',
  ].filter(Boolean);

  return {
    text: formatWhatsAppText(sections.join('\n\n')),
    buttonBody: formatWhatsAppText(`*${serviceLabel}*\n*Final quote: ${formattedAmount}*\nConfirm to submit or edit the details.`),
  };
}

module.exports = { formatWhatsAppBookingConfirmation, renderWhatsAppQuestion };
