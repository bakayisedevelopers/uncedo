'use strict';

const { formatWhatsAppText } = require('./messageFormatting');
const { DEFAULT_SERVICE_PLACEHOLDER_IMAGE, isSupportedWhatsAppImageUrl } = require('./servicePresentation');

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

function formatWhatsAppServiceOptionPrompt({ service = {}, options = [] } = {}) {
  const serviceLabel = safeLabel(service.label || service.id || 'Selected service', 120);
  const validOptions = (Array.isArray(options) ? options : [])
    .filter((opt) => String(opt?.id || '').trim() && String(opt?.title || '').trim())
    .slice(0, 10);
  if (!validOptions.length) return null;

  const listLines = validOptions.map((opt, idx) => {
    const priceNum = Number(opt.price);
    const priceLabel = Number.isFinite(priceNum) && priceNum >= 0 ? ` — R${priceNum.toFixed(2)}` : '';
    return `${idx + 1}. *${safeLabel(opt.title, 80)}*${priceLabel}`;
  });
  const text = formatWhatsAppText(`🛠️ *${serviceLabel}*\n\nPlease choose which option you need:\n\n${listLines.join('\n')}`);

  if (validOptions.length <= 3) {
    return {
      text,
      interactive: {
        type: 'button',
        body: {
          text: formatWhatsAppText(`🛠️ *${serviceLabel}*\n\nWhich option would you like to book?`),
        },
        action: {
          buttons: validOptions.map((opt) => ({
            type: 'reply',
            reply: {
              id: `wa_book_opt_${String(opt.id).trim()}`.slice(0, 250),
              title: safeLabel(opt.title, 20),
            },
          })),
        },
      },
    };
  }

  return {
    text,
    interactive: {
      type: 'list',
      body: {
        text: formatWhatsAppText(`🛠️ *${serviceLabel}*\n\nTap *Choose option* below to select what you need.`),
      },
      action: {
        button: 'Choose option',
        sections: [
          {
            title: safeLabel(serviceLabel, 24),
            rows: validOptions.map((opt) => {
              const priceNum = Number(opt.price);
              const pricePrefix = Number.isFinite(priceNum) && priceNum >= 0 ? `R${priceNum.toFixed(2)}` : '';
              const desc = [pricePrefix, safeLabel(opt.description || '', 60)].filter(Boolean).join(' · ');
              return {
                id: `wa_book_opt_${String(opt.id).trim()}`.slice(0, 200),
                title: safeLabel(opt.title, 24),
                description: desc.slice(0, 72),
              };
            }),
          },
        ],
      },
    },
  };
}

function formatWhatsAppBookingConfirmation({ service = {}, selectedOption = null, questions = [], answers = {}, quote = {} } = {}) {
  const serviceLabel = safeLabel(service.label || 'Selected service', 180);
  const optionTitle = safeLabel(selectedOption?.title || quote?.selectedOptionTitle || '', 140);
  const displayService = optionTitle && !serviceLabel.includes(optionTitle)
    ? `${serviceLabel} — ${optionTitle}`
    : serviceLabel;
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
    `*Service:* ${serviceLabel}${optionTitle ? `\n*Option:* ${optionTitle}` : ''}`,
    detailLines.length ? `*Details:*\n${detailLines.join('\n')}` : '',
    `*Final quote: ${formattedAmount}*`,
    'This amount comes from the current Uncedo pricing calculation.',
    'Choose *Confirm* to submit this request or *Edit details* to make a change.',
  ].filter(Boolean);

  return {
    text: formatWhatsAppText(sections.join('\n\n')),
    buttonBody: formatWhatsAppText(`*${displayService}*\n*Final quote: ${formattedAmount}*\nConfirm to submit or edit the details.`),
  };
}

function formatWhatsAppSubmittedRequestConfirmation({
  service = {},
  selectedOption = null,
  questions = [],
  answers = {},
  quote = {},
  location = null,
} = {}) {
  const serviceLabel = safeLabel(service.label || service.id || 'Uncedo service', 180);
  const optionTitle = safeLabel(selectedOption?.title || quote?.selectedOptionTitle || '', 140);
  const questionList = Array.isArray(questions) ? questions : [];
  const answerMap = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  const questionById = new Map(questionList.map((question) => [String(question?.id || ''), question]));
  const detailLines = questionList.length
    ? questionList
      .map((question) => {
        const raw = answerMap[question.id];
        const values = Array.isArray(raw) ? raw : raw == null || String(raw).trim() === '' ? [] : [raw];
        if (!values.length) return '';
        const optionLabels = new Map((Array.isArray(question.options) ? question.options : [])
          .map((option) => [String(option.value || '').toLowerCase(), safeLabel(option.label || option.value || '', 140)]));
        const display = values
          .map((value) => optionLabels.get(String(value).toLowerCase()) || safeLabel(value, 220))
          .filter(Boolean)
          .join(', ');
        if (!display) return '';
        return `• *${safeLabel(question.prompt || question.label || question.id, 140)}:* ${display}`;
      })
      .filter(Boolean)
      .slice(0, 12)
    : Object.entries(answerMap)
      .map(([key, raw]) => {
        if (questionById.has(key)) return '';
        const values = Array.isArray(raw) ? raw : raw == null || String(raw).trim() === '' ? [] : [raw];
        if (!values.length) return '';
        const label = safeLabel(String(key).replace(/_/g, ' '), 100);
        const display = values.map((v) => safeLabel(v, 180)).filter(Boolean).join(', ');
        return label && display ? `• *${label}:* ${display}` : '';
      })
      .filter(Boolean)
      .slice(0, 10);

  const addressText = safeLabel(location?.address || '', 200);
  const hasCoordinates = Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));
  const locationLine = addressText
    ? `📍 *Location:* ${addressText}`
    : hasCoordinates
      ? '📍 *Location:* Shared WhatsApp location pin'
      : '';

  const total = Number(quote?.total);
  const normalizedCurrency = String(quote?.currency || 'ZAR').trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : 'ZAR';
  const formattedAmount = Number.isFinite(total) && total > 0
    ? (currency === 'ZAR' ? `R${total.toFixed(2)}` : `${currency} ${total.toFixed(2)}`)
    : '';

  const summaryLines = [
    `🛠️ *Service:* ${serviceLabel}`,
    optionTitle ? `✨ *Option:* ${optionTitle}` : '',
    locationLine,
    formattedAmount ? `💰 *Quote:* ${formattedAmount}` : '',
  ].filter(Boolean);

  const sections = [
    '🎉 *Awesome — your service request is confirmed!*',
    `*Request summary*\n${summaryLines.join('\n')}`,
    detailLines.length ? `📋 *Your details:*\n${detailLines.join('\n')}` : '',
    '🔍 We’re now reaching out to nearby verified helpers for you. Hang tight — we’ll message you right here as soon as a helper accepts! 🙌',
  ].filter(Boolean);

  return formatWhatsAppText(sections.join('\n\n'));
}

function formatWhatsAppRequestExpiredMessage({ request = {} } = {}) {
  const rawSummary = safeLabel(request.serviceSummary || request.subject || '', 160);
  const cleanedSummary = rawSummary.replace(/^[a-z][a-z0-9 _-]{1,40}:\s*/i, '').trim() || rawSummary;
  const servicePhrase = cleanedSummary ? `*${cleanedSummary}*` : 'your service';
  const sections = [
    '😔 *No helpers were available right now*',
    `All nearby verified helpers for ${servicePhrase} were busy or out of reach within our 5-minute matching window, so this request has expired.`,
    '🔄 Whenever you’re ready to try again, simply reply *"Book"* or *"What services do you offer?"* to start a fresh request or try a different time! ✨',
  ];
  return formatWhatsAppText(sections.join('\n\n'));
}

function formatWhatsAppNextQuestion({
  service = {},
  selectedOption = null,
  question = {},
  index = 0,
  total = 1,
  answers = {},
  hasSavedHomeAddress = false,
} = {}) {
  const baseLabel = safeLabel(service.label || 'Service', 60);
  const optTitle = safeLabel(selectedOption?.title || '', 40);
  const serviceLabel = optTitle ? `${baseLabel} (${optTitle})` : baseLabel;
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
    const rawMultiplier = Number(opt.factor ?? opt.multiplier ?? 1);
    const pricingType = String(opt.pricingType || '').trim().toLowerCase();
    const safeMultiplier = pricingType === 'adder'
      ? 1
      : (Number.isFinite(rawMultiplier) && rawMultiplier > 0 ? rawMultiplier : 1);
    return {
      value: String(opt.value || opt.id || '').trim(),
      label: String(opt.label || opt.value || opt.id || '').trim().replace(/_/g, ' '),
      imageUrl: String(opt.imageUrl || opt.imageUri || '').trim(),
      priceAdder: pricingType === 'multiplier' ? 0 : Number(opt.priceAdder || 0),
      multiplier: safeMultiplier,
    };
  }).filter((opt) => opt.value);

  const hasImages = options.some((opt) => isSupportedWhatsAppImageUrl(opt.imageUrl));
  if (hasImages && options.length >= 2 && options.length <= 10) {
    const cards = options.map((opt, cardIndex) => {
      const buttonTitle = safeLabel(opt.label || opt.value || `Option ${cardIndex + 1}`, 20) || `Option ${cardIndex + 1}`;
      const priceSuffix = opt.priceAdder
        ? ` (+R${opt.priceAdder})`
        : opt.multiplier && opt.multiplier !== 1
          ? ` (×${opt.multiplier})`
          : '';
      const cardBodyText = safeLabel(`*${opt.label || buttonTitle}*${priceSuffix}`, 160) || buttonTitle;
      return {
        card_index: cardIndex,
        type: 'button',
        header: {
          type: 'image',
          image: {
            link: isSupportedWhatsAppImageUrl(opt.imageUrl)
              ? opt.imageUrl
              : DEFAULT_SERVICE_PLACEHOLDER_IMAGE,
          },
        },
        body: {
          text: cardBodyText,
        },
        action: {
          buttons: [
            {
              type: 'quick_reply',
              quick_reply: {
                id: `wa_ans_${question.id}_${opt.value}`.slice(0, 250),
                title: buttonTitle,
              },
            },
          ],
        },
      };
    });

    return {
      text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*\n\n${options.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}\n\n_Tap a card or reply with your choice._`),
      interactive: {
        type: 'carousel',
        body: {
          text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*\n\nSwipe through the options below and tap to select:`),
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

  // 4 to 10 options: send interactive list rows
  if (options.length > 3 && options.length <= 10) {
    const rows = options.map((opt) => ({
      id: `wa_ans_${question.id}_${opt.value}`.slice(0, 200),
      title: safeLabel(opt.label, 24),
      description: '',
    }));

    return {
      text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*\n\n${options.map((o) => `• ${o.label}`).join('\n')}`),
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

  // More than 10 options: WhatsApp lists are capped at 10 rows, so show all numbered options in text
  if (options.length > 10) {
    return {
      text: formatWhatsAppText(`${stepHeader}\n\n*${prompt}*\n\n${options.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}\n\n_Please reply with your choice._`),
      interactive: null,
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
  formatWhatsAppRequestExpiredMessage,
  formatWhatsAppServiceOptionPrompt,
  formatWhatsAppSubmittedRequestConfirmation,
  renderMissingWhatsAppQuestions,
};
