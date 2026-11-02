'use strict';

const { formatWhatsAppText } = require('./messageFormatting');

function safeLabel(value, maxLength = 180) {
  return formatWhatsAppText(value).replace(/\n/g, ' ').trim().slice(0, maxLength);
}

function renderMissingWhatsAppQuestions({ serviceLabel = '', questions = [], missingQuestionIds = [] } = {}) {
  const missing = new Set((Array.isArray(missingQuestionIds) ? missingQuestionIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean));
  const pending = (Array.isArray(questions) ? questions : [])
    .filter((question) => missing.has(String(question?.id || '').trim()));
  if (!pending.length) return '*A few service details are still needed.*';

  const label = safeLabel(serviceLabel, 120);
  const heading = label ? `*To finish your ${label} request*` : '*To finish your service request*';
  const intro = 'Please reply in one message with the numbered answers. I’ll keep the details you’ve already shared.';
  const numbered = pending.map((question, index) => {
    const prompt = safeLabel(question.prompt || question.label || question.id || 'Please provide this detail.', 220);
    const options = (Array.isArray(question.options) ? question.options : [])
      .map((option) => safeLabel(option?.label || option?.value || '', 80))
      .filter(Boolean)
      .slice(0, 10);
    return `${index + 1}. *${prompt}*${options.length ? `\n${options.map((option) => `   • ${option}`).join('\n')}` : ''}`;
  });
  return formatWhatsAppText([heading, intro, ...numbered].join('\n\n'));
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

function formatWhatsAppNextQuestion({
  service = {},
  question = {},
  index = 0,
  total = 1,
  answers = {},
  hasSavedHomeAddress = false,
} = {}) {
  const serviceLabel = safeLabel(service.label || 'Service', 80);
  const prompt = safeLabel(question.prompt || question.label || question.id || 'Please choose an option.', 200);
  const stepHeader = `📋 *${serviceLabel}* (Step ${index + 1} of ${total})`;

  // Address target question has 3 distinct button options
  if (question.id === 'service_address_target') {
    return {
      text: formatWhatsAppText(`${stepHeader}\n\n📍 *${prompt}*\n\n1. Current Location (send your location pin)\n2. Saved Address${hasSavedHomeAddress ? ' (from your profile)' : ' (type address if not on file)'}\n3. Another Address (type custom street address)`),
      interactive: {
        type: 'button',
        body: {
          text: formatWhatsAppText(`${stepHeader}\n\n📍 *${prompt}*`),
        },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'wa_opt_sat_current_location', title: 'Current Location' } },
            { type: 'reply', reply: { id: 'wa_opt_sat_saved_home_address', title: 'Saved Address' } },
            { type: 'reply', reply: { id: 'wa_opt_sat_another_address', title: 'Another Address' } },
          ],
        },
      },
    };
  }

  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const options = rawOptions.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt.replace(/_/g, ' '), imageUrl: '', priceAdder: 0, multiplier: 1 };
    }
    return {
      value: String(opt.value || opt.id || '').trim(),
      label: String(opt.label || opt.value || opt.id || '').trim().replace(/_/g, ' '),
      imageUrl: String(opt.imageUrl || '').trim(),
      priceAdder: Number(opt.priceAdder || 0),
      multiplier: Number(opt.multiplier || 1),
    };
  }).filter((opt) => opt.value);

  const hasImages = options.some((opt) => opt.imageUrl && opt.imageUrl.startsWith('http'));
  if (hasImages && options.length <= 10) {
    const cards = options.map((opt, index) => ({
      card_index: index,
      header: {
        type: 'image',
        image: {
          link: opt.imageUrl,
        },
      },
      body: {
        text: safeLabel(`${opt.label}${opt.priceAdder ? ` (+R${opt.priceAdder})` : opt.multiplier && opt.multiplier !== 1 ? ` (×${opt.multiplier})` : ''}`, 160),
      },
      action: {
        buttons: [
          {
            type: 'quick_reply',
            quick_reply: {
              id: `wa_ans_${question.id}_${opt.value}`.slice(0, 250),
              title: safeLabel(opt.label, 20),
            },
          },
        ],
      },
    }));

    return {
      text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*\n\nTap a card below to select your option:`),
      interactive: {
        type: 'carousel',
        body: {
          text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*`),
        },
        action: {
          cards,
        },
      },
    };
  }

  // 1 to 3 options: send WhatsApp interactive quick reply buttons
  if (options.length > 0 && options.length <= 3) {
    const buttons = options.map((opt) => ({
      type: 'reply',
      reply: {
        id: `wa_ans_${question.id}_${opt.value}`.slice(0, 250),
        title: safeLabel(opt.label, 20),
      },
    }));

    return {
      text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*\n\n${options.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}`),
      interactive: {
        type: 'button',
        body: {
          text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*`),
        },
        action: {
          buttons,
        },
      },
    };
  }

  // More than 3 options: send interactive list rows (up to 10)
  if (options.length > 3) {
    const rows = options.slice(0, 10).map((opt) => ({
      id: `wa_ans_${question.id}_${opt.value}`.slice(0, 200),
      title: safeLabel(opt.label, 24),
      description: '',
    }));

    return {
      text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*\n\n${options.map((o, i) => `• ${o.label}`).join('\n')}`),
      interactive: {
        type: 'list',
        body: {
          text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*`),
        },
        action: {
          button: 'Choose option',
          sections: [
            {
              title: safeLabel(question.prompt || 'Options', 24),
              rows,
            },
          ],
        },
      },
    };
  }

  // Free-form question with no predetermined options (text, numbers, etc.)
  return {
    text: formatWhatsAppText(`${stepHeader}\n\n✏️ *${prompt}*\n\n_Please type your answer below._`),
    interactive: null,
  };
}

module.exports = {
  formatWhatsAppBookingConfirmation,
  formatWhatsAppNextQuestion,
  renderMissingWhatsAppQuestions,
};
