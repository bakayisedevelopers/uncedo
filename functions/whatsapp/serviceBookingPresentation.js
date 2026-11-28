'use strict';

const { formatWhatsAppText } = require('./messageFormatting');
const {
  DEFAULT_SERVICE_PLACEHOLDER_IMAGE,
  isSupportedWhatsAppImageUrl,
  resolveVerifiedWhatsAppImageMap,
} = require('./servicePresentation');

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

function formatPaymentSelectionLabel(paymentSelection = null) {
  if (!paymentSelection || typeof paymentSelection !== 'object') return '';
  const type = String(paymentSelection.type || '').trim().toLowerCase();
  if (type === 'cash') return 'Cash (pay helper on completion)';
  if (type === 'card') {
    const summary = paymentSelection.cardSummary || {};
    const brand = safeLabel(summary.brand || 'Card', 30) || 'Card';
    const last4 = safeLabel(summary.last4 || '', 4);
    const label = last4 ? `${brand} •••• ${last4}` : brand;
    return summary.temporary ? `${label} (this booking only)` : label;
  }
  return '';
}

function formatWhatsAppBookingConfirmation({ service = {}, selectedOption = null, questions = [], answers = {}, quote = {}, paymentSelection = null } = {}) {
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
  const paymentLabel = formatPaymentSelectionLabel(paymentSelection);
  const sections = [
    '*Please review your service request*',
    `*Service:* ${serviceLabel}${optionTitle ? `\n*Option:* ${optionTitle}` : ''}`,
    detailLines.length ? `*Details:*\n${detailLines.join('\n')}` : '',
    `*Final quote: ${formattedAmount}*`,
    paymentLabel ? `*Payment method:* ${paymentLabel}` : '',
    'This amount comes from the current Uncedo pricing calculation.',
    'Choose *Confirm* to submit this request or *Edit details* to make a change.',
  ].filter(Boolean);

  return {
    text: formatWhatsAppText(sections.join('\n\n')),
    buttonBody: formatWhatsAppText(`*${displayService}*\n*Final quote: ${formattedAmount}*${paymentLabel ? `\n*Payment:* ${paymentLabel}` : ''}\nConfirm to submit or edit the details.`).slice(0, 1024),
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

async function formatVerifiedWhatsAppNextQuestion(params = {}) {
  const {
    question = {},
    fetchImpl = fetch,
    timeoutMs = 2500,
    logger = null,
    useCache = fetchImpl === fetch,
  } = params;
  const rawOptions = Array.isArray(question?.options) ? question.options : [];
  const candidateUrls = rawOptions
    .map((opt) => (typeof opt === 'string' ? '' : String(opt?.imageUrl || opt?.imageUri || '').trim()))
    .filter((url) => isSupportedWhatsAppImageUrl(url));

  if (!candidateUrls.length || rawOptions.length < 2 || rawOptions.length > 10 || question?.id === 'service_address_target') {
    return formatWhatsAppNextQuestion(params);
  }

  const verifiedMap = await resolveVerifiedWhatsAppImageMap(
    [...candidateUrls, DEFAULT_SERVICE_PLACEHOLDER_IMAGE],
    { fetchImpl, timeoutMs, useCache },
  );
  const placeholderOk = verifiedMap.get(DEFAULT_SERVICE_PLACEHOLDER_IMAGE)?.ok !== false;
  let brokenCount = 0;
  const sanitizedOptions = rawOptions.map((opt) => {
    if (typeof opt === 'string') return opt;
    const rawUrl = String(opt?.imageUrl || opt?.imageUri || '').trim();
    if (!rawUrl || !isSupportedWhatsAppImageUrl(rawUrl)) {
      return { ...opt, imageUrl: '', imageUri: '' };
    }
    const check = verifiedMap.get(rawUrl);
    if (check && !check.ok) {
      brokenCount += 1;
      return { ...opt, imageUrl: '', imageUri: '' };
    }
    return opt;
  });

  if (brokenCount > 0) {
    logger?.warn?.('whatsapp_question_carousel_broken_image_skipped', {
      questionId: String(question?.id || ''),
      brokenCount,
    });
  }

  const hasVerifiedOptionImage = sanitizedOptions.some(
    (opt) => typeof opt === 'object' && isSupportedWhatsAppImageUrl(opt?.imageUrl || opt?.imageUri),
  );
  if (!hasVerifiedOptionImage || !placeholderOk) {
    return formatWhatsAppNextQuestion({
      ...params,
      question: {
        ...question,
        options: sanitizedOptions.map((opt) => (typeof opt === 'string' ? opt : { ...opt, imageUrl: '', imageUri: '' })),
      },
    });
  }

  return formatWhatsAppNextQuestion({
    ...params,
    question: {
      ...question,
      options: sanitizedOptions,
    },
  });
}

function formatQuoteMoney(quote = {}) {
  const total = Number(quote.total);
  const normalizedCurrency = String(quote.currency || 'ZAR').trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : 'ZAR';
  const amount = Number.isFinite(total) ? total.toFixed(2) : '0.00';
  return currency === 'ZAR' ? `R${amount}` : `${currency} ${amount}`;
}

function formatWhatsAppPreBookingPaymentPrompt({ service = {}, selectedOption = null, quote = {}, cards = [] } = {}) {
  const serviceLabel = safeLabel(service.label || 'Selected service', 120);
  const optionTitle = safeLabel(selectedOption?.title || quote?.selectedOptionTitle || '', 80);
  const displayService = optionTitle && !serviceLabel.includes(optionTitle)
    ? `${serviceLabel} — ${optionTitle}`
    : serviceLabel;
  const formattedAmount = formatQuoteMoney(quote);
  const savedCards = Array.isArray(cards) ? cards.filter((card) => card && card.id) : [];
  const hasSavedCards = savedCards.length > 0;
  const body = formatWhatsAppText(
    `*${displayService}*\n*Quote: ${formattedAmount}*\n\nHow would you like to pay for this service?\n\n${hasSavedCards ? 'Choose *Saved card*, *New card*, or *Pay cash* below before confirming.' : 'Choose *Add new card* or *Pay cash* below before confirming.'}`,
  ).slice(0, 1024);

  const buttons = hasSavedCards
    ? [
        { type: 'reply', reply: { id: 'wa_book_pay_saved', title: 'Saved card' } },
        { type: 'reply', reply: { id: 'wa_book_pay_card', title: 'New card' } },
        { type: 'reply', reply: { id: 'wa_book_pay_cash', title: 'Pay cash' } },
      ]
    : [
        { type: 'reply', reply: { id: 'wa_book_pay_card', title: 'Add new card' } },
        { type: 'reply', reply: { id: 'wa_book_pay_cash', title: 'Pay cash' } },
      ];

  return {
    text: body,
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons },
    },
  };
}

function formatWhatsAppPreBookingSavedCardMenu({ service = {}, quote = {}, cards = [] } = {}) {
  const serviceLabel = safeLabel(service.label || 'Uncedo service', 100);
  const formattedAmount = formatQuoteMoney(quote);
  const eligible = (Array.isArray(cards) ? cards : []).filter((card) => card && card.id).slice(0, 9);
  const rows = [
    ...eligible.map((card) => ({
      id: `wa_book_saved_card_${String(card.id).trim()}`.slice(0, 200),
      title: safeLabel(`${card.brand || 'Card'} •••• ${card.last4 || '----'}`, 24) || 'Saved card',
      description: card.isDefault ? 'Default payment card' : 'Saved payment card',
    })),
    {
      id: 'wa_book_add_new_card',
      title: 'Add new card',
      description: 'Verify a new card (R1 check, refunded immediately)',
    },
  ];
  const body = formatWhatsAppText(
    `*${serviceLabel}* · *${formattedAmount}*\n\nChoose which card you would like to pay with after your job is completed, or tap *Add new card*.`,
  ).slice(0, 1024);

  return {
    text: body,
    interactive: {
      type: 'list',
      body: { text: body },
      action: {
        button: 'Choose card',
        sections: [
          {
            title: 'Your cards',
            rows,
          },
        ],
      },
    },
  };
}

function formatWhatsAppCompletionCardFailureRecovery({
  refPrefix = '',
  serviceName = 'your Uncedo service',
  wholeTotalDisplay = '0',
  failedCardSummary = null,
  untriedCards = [],
} = {}) {
  const safeService = safeLabel(serviceName || 'your Uncedo service', 100);
  const last4 = safeLabel(failedCardSummary?.last4 || '', 4);
  const brand = safeLabel(failedCardSummary?.brand || 'Card', 30) || 'Card';
  const cardDesc = last4 ? ` (${brand} •••• ${last4})` : '';
  const remaining = Array.isArray(untriedCards) ? untriedCards.filter((card) => card && card.id) : [];
  const hasOtherCards = remaining.length > 0;
  const text = formatWhatsAppText(
    hasOtherCards
      ? `${refPrefix}🎉 Your *${safeService}* service is complete!\n\n⚠️ Your chosen card${cardDesc} failed, so *R${wholeTotalDisplay} ZAR* was recorded to your wallet. Would you like to use another saved card, add a new card, or pay cash?`
      : `${refPrefix}🎉 Your *${safeService}* service is complete!\n\n⚠️ Your chosen card${cardDesc} failed and no other saved cards are available, so *R${wholeTotalDisplay} ZAR* was recorded to your wallet. Please add a new card or pay cash below.`,
  ).slice(0, 1024);

  const buttons = hasOtherCards
    ? [
        { type: 'reply', reply: { id: 'wa_recover_saved', title: 'Use another card' } },
        { type: 'reply', reply: { id: 'wa_payment_card', title: 'Add new card' } },
        { type: 'reply', reply: { id: 'wa_payment_cash', title: 'Pay cash' } },
      ]
    : [
        { type: 'reply', reply: { id: 'wa_payment_card', title: 'Add new card' } },
        { type: 'reply', reply: { id: 'wa_payment_cash', title: 'Pay cash' } },
      ];

  return {
    text,
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons },
    },
  };
}

function formatWhatsAppRecoverySavedCardMenu({
  serviceName = 'Uncedo service',
  wholeTotalDisplay = '0',
  untriedCards = [],
} = {}) {
  const remaining = (Array.isArray(untriedCards) ? untriedCards : []).filter((card) => card && card.id).slice(0, 9);
  const rows = [
    ...remaining.map((card) => ({
      id: `wa_saved_card_${String(card.id).trim()}`.slice(0, 200),
      title: safeLabel(`${card.brand || 'Card'} •••• ${card.last4 || '----'}`, 24) || 'Saved card',
      description: card.isDefault ? 'Default payment card' : 'Saved payment card',
    })),
    {
      id: 'wa_recover_add_card',
      title: 'Add new card',
      description: 'Open secure Paystack checkout with a new card',
    },
  ];
  const body = formatWhatsAppText(
    `Choose another card for *${safeLabel(serviceName, 80)}* (*R${wholeTotalDisplay} ZAR*). Failed cards have been removed from this list.`,
  ).slice(0, 1024);
  return {
    text: body,
    interactive: {
      type: 'list',
      body: { text: body },
      action: {
        button: 'Choose card',
        sections: [{ title: 'Remaining cards', rows }],
      },
    },
  };
}

function formatWhatsAppSavedAddressConfirmationPrompt({ service = {}, savedAddress = '' } = {}) {
  const serviceLabel = safeLabel(service.label || service.id || 'Selected service', 100);
  const safeAddress = safeLabel(savedAddress, 400);
  const text = formatWhatsAppText(
    `🏠 *${serviceLabel}*\n\nYour saved home address is:\n*${safeAddress}*\n\nPlease confirm if we should use this saved address, or provide a new address.\n\n1. Confirm address\n2. Provide new address`,
  );
  const buttonBody = formatWhatsAppText(
    `🏠 *${serviceLabel}*\n\nYour saved home address is:\n*${safeAddress}*\n\nPlease confirm this saved address or provide a new address.`,
  ).slice(0, 1024);

  return {
    text,
    interactive: {
      type: 'button',
      body: { text: buttonBody },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'wa_opt_sac_confirm', title: 'Confirm address' } },
          { type: 'reply', reply: { id: 'wa_opt_sac_change', title: 'Provide new address' } },
        ],
      },
    },
  };
}

function formatWhatsAppMissingHomeAddressPrompt({ service = {} } = {}) {
  const serviceLabel = safeLabel(service.label || service.id || 'Selected service', 100);
  return {
    text: formatWhatsAppText(
      `🏠 *${serviceLabel}*\n\nYou don't have a saved home address on file yet. Please provide your home address (for example: 17 Iris Street, Witbank, 1035).`,
    ),
    interactive: null,
  };
}

module.exports = {
  formatVerifiedWhatsAppNextQuestion,
  formatWhatsAppBookingConfirmation,
  formatWhatsAppCompletionCardFailureRecovery,
  formatWhatsAppMissingHomeAddressPrompt,
  formatWhatsAppNextQuestion,
  formatWhatsAppPreBookingPaymentPrompt,
  formatWhatsAppPreBookingSavedCardMenu,
  formatWhatsAppRecoverySavedCardMenu,
  formatWhatsAppRequestExpiredMessage,
  formatWhatsAppSavedAddressConfirmationPrompt,
  formatWhatsAppServiceOptionPrompt,
  formatWhatsAppSubmittedRequestConfirmation,
  renderMissingWhatsAppQuestions,
};

