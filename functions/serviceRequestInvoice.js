'use strict';

const { createHash, randomUUID } = require('node:crypto');
const PDFDocument = require('pdfkit');

const SERVICE_INVOICES_COLLECTION = 'serviceInvoices';
const LEGAL_ENTITY_NAME = 'Uncedo, operated by Jabu Msiza';

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundCurrency(value) {
  const numeric = toFiniteNumber(value, 0);
  return Math.round(numeric * 100) / 100;
}

function formatMoney(amount, currency = 'ZAR') {
  const numeric = roundCurrency(amount);
  const abs = Math.abs(numeric).toFixed(2);
  const normalizedCurrency = String(currency || 'ZAR').trim().toUpperCase() || 'ZAR';
  const prefix = normalizedCurrency === 'ZAR' ? 'R' : `${normalizedCurrency} `;
  return numeric < 0 ? `-${prefix}${abs}` : `${prefix}${abs}`;
}

function sanitizeText(value = '', maxLength = 240) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toPdfSafeText(value = '', maxLength = 240) {
  const normalized = sanitizeText(value, maxLength * 2)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\u0020-\u007E\u00A1-\u00FF]/g, ' ');
  return normalized.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function titleizeKey(key = '') {
  return sanitizeText(
    String(key || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase()),
    100,
  );
}

function formatSastDateTime(ms = 0) {
  const timestamp = Number(ms || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Not recorded';
  try {
    const formatted = new Intl.DateTimeFormat('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(timestamp));
    return `${formatted} SAST`;
  } catch {
    return `${new Date(timestamp + 2 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ')} SAST`;
  }
}

function formatPaymentMethodLabel(method = '') {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === 'cash') return 'Cash (Helper Confirmed)';
  if (normalized === 'saved_card') return 'Card (Saved Card · Paystack)';
  if (normalized === 'paystack_checkout' || normalized === 'paystack') return 'Card (Paystack Checkout)';
  if (!normalized) return 'Confirmed Payment';
  return titleizeKey(normalized);
}

function deriveInvoiceNumber({ requestId = '', request = {} } = {}) {
  const rawRef = sanitizeText(
    request.publicRequestReference || request.requestReference || '',
    40,
  ).replace(/[^A-Za-z0-9_-]/g, '');
  if (rawRef) {
    return `INV-${rawRef.toUpperCase()}`;
  }
  const shortId = sanitizeText(requestId, 24).replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase()
    || createHash('sha256').update(String(requestId || 'invoice')).digest('hex').slice(0, 8).toUpperCase();
  return `INV-${shortId}`;
}

function deriveRequestTypeLabel({ request = {}, isCanceled = false } = {}) {
  if (isCanceled) return 'Cancellation Fee Settlement';
  const requestType = String(request.requestType || '').trim().toLowerCase();
  const categoryId = String(request.categoryId || '').trim().toLowerCase();
  if (request.selectedPackageId || request.requestPayload?.selectedPackageId) {
    return 'Service Package / Bundle';
  }
  if (requestType === 'tutoring' || categoryId === 'tutoring') {
    return 'Tutoring Session';
  }
  return 'On-Demand Home & Local Service';
}

function buildQuestionIndex(catalogEntries = []) {
  const map = new Map();
  for (const entry of (Array.isArray(catalogEntries) ? catalogEntries : [])) {
    if (!entry || typeof entry !== 'object') continue;
    const questionnaire = entry.questionnaire || {};
    const questions = [
      ...(Array.isArray(questionnaire.required) ? questionnaire.required : []),
      ...(Array.isArray(questionnaire.optional) ? questionnaire.optional : []),
    ];
    for (const q of questions) {
      const qId = String(q?.id || '').trim();
      if (!qId || map.has(qId)) continue;
      map.set(qId, q);
    }
  }
  return map;
}

function extractRequestSpecifications({ request = {}, catalogEntries = [] } = {}) {
  const answers = request.structuredAnswers || request.requestPayload?.structuredAnswers || {};
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return [];

  const questionMap = buildQuestionIndex(catalogEntries);
  const ignoredKeys = new Set([
    'travel_distance_km',
    'service_address_target',
    'service_address',
    'timing_preference',
    'scheduled_for_text',
  ]);
  const specs = [];

  for (const [rawKey, rawVal] of Object.entries(answers)) {
    const key = String(rawKey || '').trim();
    if (!key || ignoredKeys.has(key)) continue;
    const values = Array.isArray(rawVal) ? rawVal : rawVal === null || rawVal === undefined ? [] : [rawVal];
    const cleanedValues = values.map((v) => sanitizeText(v, 140)).filter(Boolean);
    if (!cleanedValues.length) continue;

    const question = questionMap.get(key);
    const label = sanitizeText(question?.prompt || question?.label || titleizeKey(key), 90);
    const optionMap = new Map(
      (Array.isArray(question?.options) ? question.options : [])
        .map((opt) => [
          String(opt?.value || opt?.id || '').trim().toLowerCase(),
          sanitizeText(opt?.label || opt?.value || '', 120),
        ]),
    );
    const displayValue = cleanedValues
      .map((val) => optionMap.get(val.toLowerCase()) || (val.includes('_') ? titleizeKey(val) : val))
      .filter(Boolean)
      .join(', ');
    if (label && displayValue) {
      specs.push({ label, value: sanitizeText(displayValue, 160) });
    }
    if (specs.length >= 16) break;
  }

  return specs;
}

function classifyBreakdownComponent(label = '') {
  const lower = String(label || '').toLowerCase();
  if (lower.includes('travel')) return 'Travel';
  if (lower.includes('booking fee')) return 'Platform Fee';
  if (lower.includes('waiting')) return 'Waiting Time';
  if (lower.includes('material')) return 'Materials';
  if (lower.includes('discount') || lower.includes('credit')) return 'Discount / Credit';
  if (lower.includes('rounding')) return 'Adjustment';
  if (lower.includes('cancellation')) return 'Cancellation';
  return 'Service';
}

function buildPriceBreakdownLines({
  request = {},
  settledAmount = 0,
  legacyOperation = null,
  isCanceled = false,
} = {}) {
  const pricing = request.pricingSnapshot || request.requestPayload?.pricingSnapshot || {};
  const lines = [];
  const targetTotal = roundCurrency(
    toFiniteNumber(settledAmount, null)
    ?? (isCanceled
      ? toFiniteNumber(request.cancellationFeeAmount ?? pricing.cancellationAmount, 0)
      : toFiniteNumber(pricing.cashChargeAmount ?? request.totalAmount ?? pricing.finalAmount ?? pricing.total, 0)),
  );

  if (isCanceled) {
    const payout = legacyOperation?.settlementData?.cancellation?.helperPayoutBreakdown
      || request.helperPayoutBreakdown
      || {};
    const travelAmount = roundCurrency(toFiniteNumber(payout.travelAmount ?? payout.helperTravelAmount, 0));
    const bookingAmount = roundCurrency(toFiniteNumber(payout.bookingFeeAmount ?? payout.platformBookingAmount, 0));
    const travelledKm = roundCurrency(toFiniteNumber(payout.travelledKm ?? request.cancellationDistanceKm, 0));

    if (travelAmount > 0) {
      lines.push({
        label: travelledKm > 0
          ? `Helper travel charge (${travelledKm.toFixed(1)} km)`
          : 'Service travel charge',
        component: 'Travel',
        amount: travelAmount,
      });
    }
    if (bookingAmount > 0) {
      lines.push({
        label: 'Platform booking fee',
        component: 'Platform Fee',
        amount: bookingAmount,
      });
    }
    if (!lines.length && targetTotal > 0) {
      lines.push({
        label: 'Cancellation fee settlement',
        component: 'Cancellation',
        amount: targetTotal,
      });
    }
  } else {
    const rawLines = Array.isArray(pricing.lines) ? pricing.lines : [];
    const seenTravel = rawLines.some((item) => String(item?.label || '').toLowerCase().includes('travel'));
    const seenBooking = rawLines.some((item) => String(item?.label || '').toLowerCase().includes('booking fee'));

    if (rawLines.length > 0) {
      for (const item of rawLines) {
        const label = sanitizeText(item?.label || '', 120);
        const amount = toFiniteNumber(item?.amount, null);
        if (!label || amount === null) continue;
        lines.push({
          label,
          component: classifyBreakdownComponent(label),
          amount: roundCurrency(amount),
        });
      }
    } else {
      const subtotal = toFiniteNumber(pricing.subtotal, null);
      if (subtotal !== null && subtotal >= 0) {
        lines.push({
          label: sanitizeText(request.serviceSummary || request.subject || 'Service subtotal', 120),
          component: 'Service',
          amount: roundCurrency(subtotal),
        });
      }
    }

    const travelFee = toFiniteNumber(pricing.travelFee, null);
    if (!seenTravel && travelFee !== null && travelFee > 0) {
      lines.push({
        label: 'Service travel fee',
        component: 'Travel',
        amount: roundCurrency(travelFee),
      });
    }

    const bookingFee = toFiniteNumber(pricing.bookingFee, null);
    if (!seenBooking && bookingFee !== null && bookingFee > 0) {
      lines.push({
        label: 'Booking fee',
        component: 'Platform Fee',
        amount: roundCurrency(bookingFee),
      });
    }

    const waitingCost = roundCurrency(toFiniteNumber(request.waitingCost ?? pricing.waitingCost, 0));
    const waitingMinutes = roundCurrency(toFiniteNumber(request.waitingMinutes ?? pricing.waitingMinutes, 0));
    if (waitingCost > 0) {
      lines.push({
        label: waitingMinutes > 0
          ? `Waiting time fee (${waitingMinutes.toFixed(1)} min)`
          : 'Waiting time fee',
        component: 'Waiting Time',
        amount: waitingCost,
      });
    }

    const creditAmount = roundCurrency(toFiniteNumber(
      pricing.serviceCreditAmount ?? legacyOperation?.settlementData?.serviceCreditAmount,
      0,
    ));
    const creditPoints = Math.round(toFiniteNumber(
      pricing.serviceCreditPoints ?? legacyOperation?.settlementData?.serviceCreditPoints,
      0,
    ));
    if (creditAmount > 0) {
      lines.push({
        label: creditPoints > 0
          ? `Uncedo points credit applied (${creditPoints} pts)`
          : 'Uncedo service credit applied',
        component: 'Discount / Credit',
        amount: -Math.abs(creditAmount),
      });
    }

    if (!lines.length && targetTotal > 0) {
      lines.push({
        label: sanitizeText(request.serviceSummary || request.subject || 'Uncedo Service', 120),
        component: 'Service',
        amount: targetTotal,
      });
    }
  }

  const lineSum = roundCurrency(lines.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const diff = roundCurrency(targetTotal - lineSum);
  if (Math.abs(diff) >= 0.01 && targetTotal > 0) {
    lines.push({
      label: Math.abs(diff) <= 1 ? 'Whole-Rand rounding adjustment' : 'Price reconciliation adjustment',
      component: 'Adjustment',
      amount: diff,
    });
  }

  return {
    lines,
    totalAmount: targetTotal > 0 ? targetTotal : lineSum,
  };
}

function buildHelperSummary({ request = {}, helperProfile = null } = {}) {
  const assignment = request.helperAssignment || {};
  const helperId = sanitizeText(assignment.helperId || helperProfile?.uid || '', 80);
  const fullName = sanitizeText(
    helperProfile?.fullName
      || helperProfile?.displayName
      || assignment.helperName
      || (helperId ? 'Assigned Uncedo Helper' : 'Not assigned'),
    120,
  );
  const isBusiness = String(helperProfile?.helperType || '').trim().toLowerCase() === 'business'
    && Boolean(sanitizeText(helperProfile?.businessName, 120));
  const partnerType = !helperId
    ? '—'
    : isBusiness
      ? `${sanitizeText(helperProfile.businessName, 120)} (Business Partner)`
      : 'Verified Individual Helper';

  const serviceArea = sanitizeText(
    [helperProfile?.city, helperProfile?.province].filter(Boolean).join(', ')
      || helperProfile?.serviceArea
      || helperProfile?.suburb
      || '',
    120,
  ) || 'Verified Dispatch Area';

  const ratingRaw = toFiniteNumber(helperProfile?.metrics?.overallRating ?? helperProfile?.rating, null);
  const ratingText = ratingRaw !== null && ratingRaw > 0 ? `${ratingRaw.toFixed(1)} / 5.0` : '';
  const helperCode = helperId ? `HLP-${helperId.slice(0, 8).toUpperCase()}` : '';

  return {
    helperId,
    name: fullName,
    partnerType,
    serviceArea,
    ratingText,
    helperCode,
  };
}

function buildServiceInvoiceData({
  requestId = '',
  request = {},
  paymentOperation = null,
  legacyOperation = null,
  helperProfile = null,
  customerProfile = null,
  catalogEntries = [],
  invoiceNumber = '',
  receiptId = '',
  issuedAtMs = Date.now(),
} = {}) {
  const normalizedStatus = String(request.status || '').trim().toLowerCase();
  const isCanceled = normalizedStatus === 'canceled' || normalizedStatus === 'cancelled';
  const settlement = paymentOperation?.settlement || {};

  const paidAtMs = Number(
    settlement.paidAtMs
      || request.paymentSettledAtMs
      || paymentOperation?.settledAtMs
      || legacyOperation?.settledAtMs
      || request.endedAt
      || issuedAtMs
      || Date.now(),
  );
  const paymentMethodRaw = String(
    settlement.method
      || paymentOperation?.method
      || request.paymentMethod
      || legacyOperation?.alternatePaymentMethod
      || (request.chargedCardLast4 ? 'saved_card' : 'paystack'),
  ).trim();
  const gatewayReference = sanitizeText(
    settlement.gatewayReference
      || paymentOperation?.gatewayReference
      || request.paymentReference
      || legacyOperation?.gatewayReference
      || '',
    100,
  );
  const resolvedReceiptId = sanitizeText(
    receiptId
      || settlement.receiptId
      || request.paymentReceiptId
      || paymentOperation?.receiptId
      || legacyOperation?.gatewayTransactionId
      || legacyOperation?.operationId
      || '',
    80,
  ) || `REC-${createHash('sha256').update(String(requestId || 'uncedo')).digest('hex').slice(0, 10).toUpperCase()}`;

  const settledAmount = toFiniteNumber(
    settlement.amount
      ?? paymentOperation?.amount
      ?? (Number.isFinite(Number(legacyOperation?.amountMinor)) ? Number(legacyOperation.amountMinor) / 100 : null)
      ?? (isCanceled
        ? (request.cancellationFeeAmount ?? request.pricingSnapshot?.cancellationAmount)
        : (request.pricingSnapshot?.cashChargeAmount ?? request.totalAmount ?? request.pricingSnapshot?.finalAmount ?? request.pricingSnapshot?.total)),
    0,
  );
  const currency = String(
    settlement.currency || paymentOperation?.currency || request.pricingSnapshot?.currency || 'ZAR',
  ).trim().toUpperCase() || 'ZAR';

  const { lines, totalAmount } = buildPriceBreakdownLines({
    request,
    settledAmount,
    legacyOperation,
    isCanceled,
  });

  const resolvedInvoiceNumber = sanitizeText(invoiceNumber, 60) || deriveInvoiceNumber({ requestId, request });
  const requestReference = sanitizeText(
    request.publicRequestReference || request.requestReference || requestId,
    80,
  );

  const customerName = sanitizeText(
    customerProfile?.fullName || customerProfile?.displayName || request.customerName || 'Uncedo Customer',
    120,
  );
  const customerPhone = sanitizeText(
    request.customerPhone || customerProfile?.phoneNumber || customerProfile?.phone || '',
    40,
  );
  const serviceAddress = sanitizeText(
    request.serviceAddress || request.location?.address || request.requestPayload?.serviceAddress || '',
    220,
  ) || 'Customer service location';

  const serviceName = sanitizeText(
    request.serviceSummary || request.topic || request.subject || 'Uncedo Service',
    160,
  );
  const categoryLabel = sanitizeText(
    request.subject || titleizeKey(request.categoryId || 'Service'),
    100,
  );
  const selectedOption = sanitizeText(
    request.selectedOptionTitle || request.pricingSnapshot?.selectedOptionTitle || '',
    120,
  );
  const timingLabel = String(
    request.timingPreference || request.requestPayload?.timingPreference || 'now',
  ).trim().toLowerCase() === 'later'
    ? `Scheduled (${sanitizeText(request.scheduledForText || request.requestPayload?.scheduledForText || 'Requested slot', 80)})`
    : 'Immediate / On-Demand';

  return {
    invoiceNumber: resolvedInvoiceNumber,
    receiptId: resolvedReceiptId,
    requestId: sanitizeText(requestId, 128),
    requestReference,
    gatewayReference,
    issuedAtMs: Number(issuedAtMs || Date.now()),
    issuedAtLabel: formatSastDateTime(issuedAtMs || Date.now()),
    paidAtMs,
    paidAtLabel: formatSastDateTime(paidAtMs),
    paymentStatus: 'PAID',
    paymentMethodRaw,
    paymentMethodLabel: formatPaymentMethodLabel(paymentMethodRaw),
    currency,
    totalAmount,
    isCanceled,
    customer: {
      name: customerName,
      phone: customerPhone,
      serviceAddress,
    },
    helper: buildHelperSummary({ request, helperProfile }),
    requestDetails: {
      requestType: deriveRequestTypeLabel({ request, isCanceled }),
      category: categoryLabel,
      serviceName,
      selectedOption,
      timing: timingLabel,
      specifications: extractRequestSpecifications({ request, catalogEntries }),
    },
    priceBreakdown: lines,
  };
}

function buildServiceRequestInvoicePdfBuffer(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 34, left: 42, right: 42, bottom: 56 },
      bufferPages: true,
      compress: true,
      info: {
        Title: toPdfSafeText(`Uncedo Invoice ${invoice.invoiceNumber}`, 120),
        Author: toPdfSafeText(LEGAL_ENTITY_NAME, 120),
        Subject: toPdfSafeText(`Service Invoice ${invoice.requestReference}`, 120),
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const contentWidth = right - left;
    const safeBottomY = pageHeight - doc.page.margins.bottom - 12;

    const palette = {
      emerald: '#0B5D56',
      emeraldLight: '#ECFDF5',
      emeraldBorder: '#A7F3D0',
      ink: '#111827',
      muted: '#52525B',
      border: '#E4E4E7',
      well: '#F8FAFC',
      white: '#FFFFFF',
    };

    const drawBreakdownTableHeader = (yPos) => {
      doc.save();
      doc.roundedRect(left, yPos, contentWidth, 24, 5).fill(palette.emerald);
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(palette.white)
        .text('DESCRIPTION', left + 10, yPos + 7, { width: contentWidth - 210, lineBreak: false })
        .text('COMPONENT', left + contentWidth - 195, yPos + 7, { width: 95, lineBreak: false })
        .text(`AMOUNT (${toPdfSafeText(invoice.currency, 8)})`, left + contentWidth - 98, yPos + 7, {
          width: 88,
          align: 'right',
          lineBreak: false,
        });
      doc.y = yPos + 26;
    };

    const ensureSpace = (neededHeight = 40, onNewPage = null) => {
      if (doc.y + neededHeight > safeBottomY) {
        doc.addPage();
        doc.x = left;
        doc.y = doc.page.margins.top;
        if (typeof onNewPage === 'function') {
          onNewPage();
        }
      }
    };

    // Header brand block (crisp vector emblem badge + wordmark)
    doc.save();
    doc.roundedRect(left, 26, 40, 40, 9).fill(palette.emerald);
    doc.path(`M ${left + 12} 37 L ${left + 12} 49 C ${left + 12} 55.5 ${left + 28} 55.5 ${left + 28} 49 L ${left + 28} 37`)
      .lineWidth(3.4)
      .lineCap('round')
      .strokeColor(palette.white)
      .stroke();
    doc.restore();

    const titleX = left + 52;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(palette.emerald)
      .text('UNCEDO', titleX, 27, { width: 240, lineBreak: false });
    doc.font('Helvetica').fontSize(9.5).fillColor(palette.muted)
      .text('Official Service Invoice & Payment Receipt', titleX, 51, { width: 260, lineBreak: false });

    // Right status + invoice badge
    const badgeWidth = 188;
    const badgeX = right - badgeWidth;
    const badgeInvoiceNum = toPdfSafeText(invoice.invoiceNumber, 32);
    const badgeNumFontSize = badgeInvoiceNum.length > 20 ? 9 : 10.5;
    doc.save();
    doc.roundedRect(badgeX, 24, badgeWidth, 46, 8).fillAndStroke(palette.emeraldLight, palette.emeraldBorder);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(badgeNumFontSize).fillColor(palette.emerald)
      .text(badgeInvoiceNum, badgeX + 12, 33, {
        width: badgeWidth - 24,
        align: 'right',
        lineBreak: false,
      });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#047857')
      .text('STATUS: PAID', badgeX + 12, 49, {
        width: badgeWidth - 24,
        align: 'right',
        lineBreak: false,
      });

    doc.save();
    doc.moveTo(left, 80).lineTo(right, 80).lineWidth(1.5).strokeColor(palette.emerald).stroke();
    doc.restore();

    // Summary metadata strip
    let y = 92;
    const metaBoxHeight = 54;
    doc.save();
    doc.roundedRect(left, y, contentWidth, metaBoxHeight, 8).fillAndStroke(palette.well, palette.border);
    doc.restore();

    const metaCols = [
      { label: 'REQUEST REF', value: invoice.requestReference || '-' },
      { label: 'RECEIPT ID', value: invoice.receiptId || '-' },
      { label: 'PAID AT (SAST)', value: invoice.paidAtLabel || '-' },
      { label: 'PAYMENT METHOD', value: invoice.paymentMethodLabel || '-' },
    ];
    const colWidth = contentWidth / metaCols.length;
    metaCols.forEach((col, index) => {
      const cx = left + (index * colWidth) + 10;
      const cw = colWidth - 16;
      doc.font('Helvetica-Bold').fontSize(7.2).fillColor(palette.muted)
        .text(col.label, cx, y + 9, { width: cw, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(palette.ink)
        .text(toPdfSafeText(col.value, 56), cx, y + 22, { width: cw });
    });

    y += metaBoxHeight + 12;

    // Customer & Helper two-column cards
    const gap = 12;
    const cardWidth = (contentWidth - gap) / 2;
    const cardTop = y;

    const customerLines = [
      { k: 'Name', v: toPdfSafeText(invoice.customer.name, 120) },
      ...(invoice.customer.phone ? [{ k: 'Contact', v: toPdfSafeText(invoice.customer.phone, 40) }] : []),
      { k: 'Location', v: toPdfSafeText(invoice.customer.serviceAddress, 220) },
    ];
    const helperLines = [
      { k: 'Helper', v: toPdfSafeText(invoice.helper.name, 120) },
      { k: 'Type', v: toPdfSafeText(invoice.helper.partnerType, 120) },
      { k: 'Area', v: toPdfSafeText(invoice.helper.serviceArea, 120) },
      ...(invoice.helper.ratingText ? [{ k: 'Rating', v: toPdfSafeText(invoice.helper.ratingText, 40) }] : []),
      ...(invoice.helper.helperCode ? [{ k: 'Ref', v: toPdfSafeText(invoice.helper.helperCode, 40) }] : []),
    ];

    const measureCardHeight = (entries) => {
      let h = 30;
      doc.font('Helvetica-Bold').fontSize(8.8);
      entries.forEach((entry) => {
        const lineText = `${entry.k}: ${entry.v || '-'}`;
        h += Math.max(15, doc.heightOfString(lineText, { width: cardWidth - 24 }) + 4);
      });
      return h + 10;
    };

    const cardsHeight = Math.max(measureCardHeight(customerLines), measureCardHeight(helperLines), 96);

    const renderDetailCard = (xPos, heading, entries) => {
      doc.save();
      doc.roundedRect(xPos, cardTop, cardWidth, cardsHeight, 8).fillAndStroke(palette.white, palette.border);
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(palette.emerald)
        .text(heading, xPos + 12, cardTop + 10, { width: cardWidth - 24, lineBreak: false });
      let lineY = cardTop + 27;
      entries.forEach((entry) => {
        doc.font('Helvetica-Bold').fontSize(8.8).fillColor(palette.muted)
          .text(`${entry.k}: `, xPos + 12, lineY, { continued: true, width: cardWidth - 24 });
        doc.font('Helvetica').fontSize(8.8).fillColor(palette.ink)
          .text(entry.v || '-', { width: cardWidth - 24 });
        lineY = doc.y + 3;
      });
    };

    renderDetailCard(left, 'BILLED TO (CUSTOMER)', customerLines);
    renderDetailCard(left + cardWidth + gap, 'SERVICE PROVIDER (HELPER)', helperLines);

    doc.x = left;
    doc.y = cardTop + cardsHeight + 14;

    // Request Type & Specifications
    ensureSpace(80);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(palette.emerald)
      .text('REQUEST TYPE & DETAILS', left, doc.y);
    doc.y += 5;

    const reqRows = [
      { label: 'Request type', value: toPdfSafeText(invoice.requestDetails.requestType, 120) },
      { label: 'Service category', value: toPdfSafeText(invoice.requestDetails.category, 100) },
      { label: 'Requested service', value: toPdfSafeText(invoice.requestDetails.serviceName, 160) },
      ...(invoice.requestDetails.selectedOption
        ? [{ label: 'Selected option', value: toPdfSafeText(invoice.requestDetails.selectedOption, 120) }]
        : []),
      { label: 'Schedule / timing', value: toPdfSafeText(invoice.requestDetails.timing, 120) },
      ...(invoice.gatewayReference
        ? [{ label: 'Payment reference', value: toPdfSafeText(invoice.gatewayReference, 100) }]
        : []),
      ...invoice.requestDetails.specifications.map((spec) => ({
        label: toPdfSafeText(spec.label, 90),
        value: toPdfSafeText(spec.value, 160),
      })),
    ];

    reqRows.forEach((row, index) => {
      doc.font('Helvetica-Bold').fontSize(8.8);
      const labelHeight = doc.heightOfString(row.label || '-', { width: 165 });
      doc.font('Helvetica').fontSize(8.8);
      const valHeight = doc.heightOfString(row.value || '-', { width: contentWidth - 192 });
      const rowHeight = Math.max(20, labelHeight + 10, valHeight + 10);
      ensureSpace(rowHeight + 4);
      const ry = doc.y;
      if (index % 2 === 0) {
        doc.save();
        doc.rect(left, ry, contentWidth, rowHeight).fill(palette.well);
        doc.restore();
      }
      doc.font('Helvetica-Bold').fontSize(8.8).fillColor(palette.muted)
        .text(row.label || '-', left + 10, ry + 5, { width: 165 });
      doc.font('Helvetica').fontSize(8.8).fillColor(palette.ink)
        .text(row.value || '-', left + 182, ry + 5, { width: contentWidth - 192 });
      doc.y = ry + rowHeight;
    });

    doc.y += 14;

    // Price breakdown table
    ensureSpace(84);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(palette.emerald)
      .text('ITEMISED PRICE BREAKDOWN', left, doc.y);
    doc.y += 6;

    drawBreakdownTableHeader(doc.y);

    invoice.priceBreakdown.forEach((item, index) => {
      const safeLabel = toPdfSafeText(item.label || 'Line item', 140);
      const safeComponent = toPdfSafeText(item.component || 'Service', 40);
      doc.font('Helvetica').fontSize(9);
      const descHeight = doc.heightOfString(safeLabel, { width: contentWidth - 210 });
      const rowHeight = Math.max(22, descHeight + 10);
      ensureSpace(rowHeight + 6, () => {
        drawBreakdownTableHeader(doc.y);
      });
      const ry = doc.y;
      if (index % 2 === 1) {
        doc.save();
        doc.rect(left, ry, contentWidth, rowHeight).fill(palette.well);
        doc.restore();
      }
      const amountDisplay = item.amount === 0 && safeLabel.toLowerCase().includes('multiplier')
        ? 'Included'
        : formatMoney(item.amount, invoice.currency);

      doc.font('Helvetica').fontSize(9).fillColor(palette.ink)
        .text(safeLabel, left + 10, ry + 6, { width: contentWidth - 210 });
      doc.font('Helvetica').fontSize(8.5).fillColor(palette.muted)
        .text(safeComponent, left + contentWidth - 195, ry + 6, { width: 95 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(item.amount < 0 ? '#047857' : palette.ink)
        .text(amountDisplay, left + contentWidth - 98, ry + 6, { width: 88, align: 'right', lineBreak: false });

      doc.save();
      doc.moveTo(left, ry + rowHeight).lineTo(right, ry + rowHeight).lineWidth(0.5).strokeColor(palette.border).stroke();
      doc.restore();
      doc.y = ry + rowHeight;
    });

    // Total Paid bar
    ensureSpace(48);
    doc.y += 8;
    const totalY = doc.y;
    doc.save();
    doc.roundedRect(left, totalY, contentWidth, 34, 6).fillAndStroke(palette.emeraldLight, palette.emerald);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(palette.emerald)
      .text(`TOTAL PAID (${toPdfSafeText(invoice.currency, 8)})`, left + 14, totalY + 10, {
        width: contentWidth - 150,
        lineBreak: false,
      });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(palette.emerald)
      .text(formatMoney(invoice.totalAmount, invoice.currency), left + contentWidth - 135, totalY + 9, {
        width: 120,
        align: 'right',
        lineBreak: false,
      });
    doc.y = totalY + 42;

    ensureSpace(34);
    doc.font('Helvetica').fontSize(8).fillColor(palette.muted)
      .text(
        'POPIA & Privacy Notice: Only booking-relevant provider details are displayed on this invoice. All amounts reflect the verified booking calculation and finalized billing record.',
        left,
        doc.y,
        { width: contentWidth },
      );

    // Stamp header bar and page-numbered footer on every buffered page without overflowing margins
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      const originalBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.save();
      doc.rect(0, 0, pageWidth, 8).fill(palette.emerald);
      doc.moveTo(left, pageHeight - 40).lineTo(right, pageHeight - 40).lineWidth(0.5).strokeColor(palette.border).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(palette.muted);
      doc.text(
        toPdfSafeText(`${LEGAL_ENTITY_NAME} - Republic of South Africa - Support via Uncedo WhatsApp`, 140),
        left,
        pageHeight - 32,
        { width: contentWidth - 90, lineBreak: false },
      );
      doc.text(
        `Page ${i + 1} of ${range.count}`,
        right - 85,
        pageHeight - 32,
        { width: 85, align: 'right', lineBreak: false },
      );
      doc.restore();
      doc.page.margins.bottom = originalBottomMargin;
    }

    doc.end();
  });
}

async function fetchCatalogEntriesForRequest(db, request = {}) {
  const serviceIds = [
    ...(Array.isArray(request.serviceIds) ? request.serviceIds : []),
    ...(Array.isArray(request.requestPayload?.serviceIds) ? request.requestPayload.serviceIds : []),
    request.selectedPackageId || request.requestPayload?.selectedPackageId || '',
  ]
    .map((id) => String(id || '').trim().toLowerCase())
    .filter(Boolean);
  const uniqueIds = [...new Set(serviceIds)].slice(0, 25);
  if (!uniqueIds.length) return [];
  const snapshots = await Promise.all(
    uniqueIds.map((id) => db.collection('serviceCatalog').doc(id).get().catch(() => null)),
  );
  return snapshots
    .filter((snap) => snap?.exists)
    .map((snap) => ({ id: snap.id, ...(snap.data() || {}) }));
}

async function ensureAndSendServiceRequestInvoice({
  db,
  admin,
  requestId,
  request = null,
  recipientWaId = '',
  lastInboundAtMs = 0,
  inServiceWindow = false,
  metaClient = null,
  logger = null,
} = {}) {
  const safeRequestId = String(requestId || '').trim();
  if (!safeRequestId || !db || !admin) {
    return { status: 'invalid-input' };
  }

  const invoiceRef = db.collection(SERVICE_INVOICES_COLLECTION).doc(safeRequestId);
  const now = Date.now();
  const leaseClaim = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(invoiceRef);
    const existing = snap.exists ? snap.data() || {} : null;
    if (existing?.whatsappDeliveryStatus === 'sent' && existing?.pdfUrl) {
      return { action: 'already-sent', existing };
    }
    if (existing?.pdfGenerated === true && existing?.pdfUrl && (!inServiceWindow || !recipientWaId || !metaClient)) {
      return { action: 'already-generated', existing };
    }
    if (existing?.processingLeaseExpiresAtMs && Number(existing.processingLeaseExpiresAtMs) > now) {
      return { action: 'in-progress', existing };
    }
    transaction.set(invoiceRef, {
      requestId: safeRequestId,
      processingLeaseExpiresAtMs: now + 45_000,
      updatedAtMs: now,
    }, { merge: true });
    return { action: 'claimed', existing };
  });

  if (leaseClaim.action !== 'claimed') {
    return { status: leaseClaim.action, invoice: leaseClaim.existing || null };
  }

  try {
    const reqData = request || (await db.collection('serviceRequests').doc(safeRequestId).get()).data() || {};
    if (String(reqData.paymentStatus || '').toLowerCase() !== 'paid') {
      await invoiceRef.set({ processingLeaseExpiresAtMs: 0, updatedAtMs: Date.now() }, { merge: true });
      return { status: 'not-paid' };
    }

    const helperId = String(reqData.helperAssignment?.helperId || '').trim();
    const customerId = String(reqData.customerId || '').trim();
    const legacyOpId = `service_${createHash('sha256').update(safeRequestId).digest('hex').slice(0, 40)}`;

    const [
      paymentSnap,
      legacySnap,
      helperSnap,
      customerSnap,
      catalogEntries,
    ] = await Promise.all([
      db.collection('servicePaymentOperations').doc(safeRequestId).get().catch(() => null),
      db.collection('financialOperations').doc(legacyOpId).get().catch(() => null),
      helperId ? db.collection('users').doc(helperId).get().catch(() => null) : Promise.resolve(null),
      customerId && !customerId.startsWith('guest_') ? db.collection('users').doc(customerId).get().catch(() => null) : Promise.resolve(null),
      fetchCatalogEntriesForRequest(db, reqData),
    ]);

    const invoiceData = buildServiceInvoiceData({
      requestId: safeRequestId,
      request: reqData,
      paymentOperation: paymentSnap?.exists ? paymentSnap.data() : null,
      legacyOperation: legacySnap?.exists ? legacySnap.data() : null,
      helperProfile: helperSnap?.exists ? { uid: helperSnap.id, ...(helperSnap.data() || {}) } : null,
      customerProfile: customerSnap?.exists ? { uid: customerSnap.id, ...(customerSnap.data() || {}) } : null,
      catalogEntries,
      issuedAtMs: now,
    });

    const pdfBuffer = await buildServiceRequestInvoicePdfBuffer(invoiceData);

    let pdfUrl = String(leaseClaim.existing?.pdfUrl || '').trim();
    let storagePath = String(leaseClaim.existing?.storagePath || '').trim();
    if (!pdfUrl || !storagePath) {
      const bucket = admin.storage().bucket();
      const downloadToken = randomUUID();
      storagePath = `service-invoices/${safeRequestId}/${invoiceData.invoiceNumber}.pdf`;
      await bucket.file(storagePath).save(pdfBuffer, {
        contentType: 'application/pdf',
        resumable: false,
        metadata: {
          cacheControl: 'private, max-age=0, no-store',
          metadata: {
            requestId: safeRequestId,
            invoiceNumber: invoiceData.invoiceNumber,
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });
      pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
    }

    let whatsappDeliveryStatus = inServiceWindow ? 'skipped_no_recipient' : 'outside_customer_service_window';
    let whatsappMessageId = null;
    let whatsappErrorCode = null;

    if (inServiceWindow && recipientWaId && metaClient?.sendMedia) {
      const safeFileRef = (invoiceData.requestReference || safeRequestId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'Receipt';
      const filename = `Uncedo-Invoice-${safeFileRef}.pdf`;
      const caption = `🧾 *Uncedo Invoice ${invoiceData.invoiceNumber}*\nService: ${invoiceData.requestDetails.serviceName}\nTotal Paid: ${formatMoney(invoiceData.totalAmount, invoiceData.currency)}`;
      try {
        const sendResult = await metaClient.sendMedia({
          to: recipientWaId,
          buffer: pdfBuffer,
          mimeType: 'application/pdf',
          mediaType: 'document',
          filename,
          caption,
          lastInboundAtMs,
        });
        whatsappDeliveryStatus = 'sent';
        whatsappMessageId = sendResult?.messageId || null;
      } catch (sendError) {
        whatsappDeliveryStatus = 'failed';
        whatsappErrorCode = String(sendError?.code || 'meta_document_send_failed').slice(0, 100);
        logger?.warn?.('whatsapp_invoice_pdf_delivery_failed', {
          requestId: safeRequestId,
          invoiceNumber: invoiceData.invoiceNumber,
          errorCode: whatsappErrorCode,
        });
      }
    }

    const record = {
      requestId: safeRequestId,
      customerId,
      helperId: helperId || null,
      invoiceNumber: invoiceData.invoiceNumber,
      receiptId: invoiceData.receiptId,
      requestReference: invoiceData.requestReference,
      amount: invoiceData.totalAmount,
      currency: invoiceData.currency,
      paymentMethod: invoiceData.paymentMethodRaw,
      paidAtMs: invoiceData.paidAtMs,
      pdfGenerated: true,
      storagePath,
      pdfUrl,
      whatsappDeliveryStatus,
      ...(whatsappMessageId ? { whatsappMessageId } : {}),
      ...(whatsappErrorCode ? { whatsappErrorCode } : {}),
      processingLeaseExpiresAtMs: 0,
      updatedAtMs: Date.now(),
      createdAtMs: Number(leaseClaim.existing?.createdAtMs || now),
    };

    await invoiceRef.set(record, { merge: true });
    return { status: whatsappDeliveryStatus === 'sent' ? 'sent' : 'generated', invoice: record };
  } catch (error) {
    await invoiceRef.set({
      processingLeaseExpiresAtMs: 0,
      lastErrorCode: String(error?.code || 'invoice_generation_failed').slice(0, 100),
      updatedAtMs: Date.now(),
    }, { merge: true }).catch(() => null);
    logger?.warn?.('service_request_invoice_generation_failed', {
      requestId: safeRequestId,
      error: String(error?.message || 'unknown_error').slice(0, 200),
    });
    return { status: 'failed', error: error?.message || 'Unable to generate invoice.' };
  }
}

module.exports = {
  SERVICE_INVOICES_COLLECTION,
  buildPriceBreakdownLines,
  buildServiceInvoiceData,
  buildServiceRequestInvoicePdfBuffer,
  deriveInvoiceNumber,
  ensureAndSendServiceRequestInvoice,
  extractRequestSpecifications,
  formatMoney,
  formatSastDateTime,
};
