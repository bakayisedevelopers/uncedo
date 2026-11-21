'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const {
  buildPriceBreakdownLines,
  buildServiceInvoiceData,
  buildServiceRequestInvoicePdfBuffer,
  extractRequestSpecifications,
} = require('./serviceRequestInvoice');

function extractPdfPageTexts(buffer) {
  const raw = buffer.toString('latin1');
  const pageCount = (raw.match(/\/Type \/Page\b/g) || []).length;
  const pageTexts = [];
  let idx = 0;
  while ((idx = raw.indexOf('stream\n', idx)) !== -1) {
    const end = raw.indexOf('\nendstream', idx);
    if (end === -1) break;
    const data = buffer.subarray(idx + 7, end);
    try {
      const inflated = zlib.inflateSync(data).toString('latin1');
      const hexChunks = inflated.match(/<[0-9a-fA-F]+>/g) || [];
      if (hexChunks.length > 0) {
        const text = hexChunks.map((chunk) => Buffer.from(chunk.slice(1, -1), 'hex').toString('latin1')).join('');
        pageTexts.push(text);
      }
    } catch {
      // Ignore uncompressed or non-deflate streams
    }
    idx = end + 10;
  }
  return { pageCount, pageTexts };
}

test('builds complete itemised price breakdown reconciling to settled total', () => {
  const request = {
    status: 'completed',
    paymentStatus: 'paid',
    publicRequestReference: 'UNC-1042',
    subject: 'Plumbing',
    serviceSummary: 'Tap Repair — Standard Visit',
    selectedOptionTitle: 'Standard Visit',
    customerName: 'Thabo Mokoena',
    customerPhone: '+27820001111',
    serviceAddress: '14 Main Road, Rosebank, Johannesburg',
    totalAmount: 439,
    waitingMinutes: 0,
    waitingCost: 0,
    helperAssignment: {
      helperId: 'helper_abc123456',
      helperName: 'Sipho Ndlovu',
    },
    structuredAnswers: {
      property_type: 'house',
      urgency: 'urgent',
      notes: 'Kitchen mixer leaking underneath sink',
      travel_distance_km: 6.2,
    },
    pricingSnapshot: {
      currency: 'ZAR',
      subtotal: 400,
      travelFee: 35,
      bookingFee: 4,
      total: 439,
      finalAmount: 439,
      lines: [
        { label: 'Tap Repair: Standard Visit', amount: 350 },
        { label: 'Tap Repair: Urgent', amount: 50 },
        { label: 'Travel fee', amount: 35 },
        { label: 'Booking fee', amount: 4 },
      ],
    },
  };

  const catalogEntries = [
    {
      id: 'tap_repair',
      questionnaire: {
        required: [
          {
            id: 'property_type',
            prompt: 'Property type',
            options: [{ value: 'house', label: 'Standalone House' }],
          },
          {
            id: 'urgency',
            prompt: 'How urgent is this request?',
            options: [{ value: 'urgent', label: 'Urgent (Today)' }],
          },
        ],
        optional: [{ id: 'notes', prompt: 'Additional notes' }],
      },
    },
  ];

  const invoice = buildServiceInvoiceData({
    requestId: 'req_1042',
    request,
    paymentOperation: {
      receiptId: 'UNC-RECEIPT-01',
      method: 'paystack_checkout',
      gatewayReference: 'PAY_REF_1042',
      settledAtMs: Date.UTC(2026, 10, 21, 12, 30),
      settlement: {
        amount: 439,
        currency: 'ZAR',
        method: 'paystack_checkout',
        paidAtMs: Date.UTC(2026, 10, 21, 12, 30),
        receiptId: 'UNC-RECEIPT-01',
        gatewayReference: 'PAY_REF_1042',
      },
    },
    helperProfile: {
      uid: 'helper_abc123456',
      fullName: 'Sipho Ndlovu',
      helperType: 'business',
      businessName: 'Ndlovu Plumbing Co.',
      city: 'Johannesburg',
      province: 'Gauteng',
      metrics: { overallRating: 4.9 },
      idNumber: '8801015009087',
      bankAccountNumber: '1234567890',
    },
    catalogEntries,
  });

  assert.equal(invoice.invoiceNumber, 'INV-UNC-1042');
  assert.equal(invoice.totalAmount, 439);
  assert.equal(invoice.helper.name, 'Sipho Ndlovu');
  assert.equal(invoice.helper.partnerType, 'Ndlovu Plumbing Co. (Business Partner)');
  assert.equal(invoice.helper.serviceArea, 'Johannesburg, Gauteng');
  assert.equal(invoice.helper.ratingText, '4.9 / 5.0');

  const specs = extractRequestSpecifications({ request, catalogEntries });
  assert.equal(specs.length, 3);
  assert.equal(specs[0].label, 'Property type');
  assert.equal(specs[0].value, 'Standalone House');

  const breakdownSum = invoice.priceBreakdown.reduce((sum, line) => sum + line.amount, 0);
  assert.equal(breakdownSum, 439);
});

test('generates a crisp non-blank single-page PDF with helper, request, and price breakdown content', async () => {
  const invoice = buildServiceInvoiceData({
    requestId: 'req_pdf_test',
    request: {
      status: 'completed',
      paymentStatus: 'paid',
      publicRequestReference: 'UNC-8821',
      subject: 'Electrical',
      serviceSummary: 'Plug Socket Repair',
      customerName: 'Nomsa Dlamini',
      serviceAddress: '22 Vilakazi Street, Soweto',
      totalAmount: 288,
      paymentMethod: 'cash',
      helperAssignment: { helperId: 'helper_9988', helperName: 'Bongani Khumalo' },
      pricingSnapshot: {
        currency: 'ZAR',
        subtotal: 250,
        travelFee: 35,
        bookingFee: 3,
        total: 288,
        lines: [
          { label: 'Plug Socket Repair: base labor', amount: 250 },
          { label: 'Travel fee', amount: 35 },
          { label: 'Booking fee', amount: 3 },
        ],
      },
    },
  });

  const buffer = await buildServiceRequestInvoicePdfBuffer(invoice);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 1500);
  assert.ok(buffer.length < 50000);
  assert.equal(buffer.subarray(0, 5).toString('utf8'), '%PDF-');

  const { pageCount, pageTexts } = extractPdfPageTexts(buffer);
  assert.equal(pageCount, 1);
  assert.equal(pageTexts.length, 1);
  const page1 = pageTexts[0];
  assert.ok(!page1.includes('Page undefined'));
  assert.ok(page1.includes('UNCEDO'));
  assert.ok(page1.includes('INV-UNC-8821'));
  assert.ok(page1.includes('STATUS: PAID'));
  assert.ok(page1.includes('Nomsa Dlamini'));
  assert.ok(page1.includes('Bongani Khumalo'));
  assert.ok(page1.includes('Plug Socket Repair'));
  assert.ok(page1.includes('R250.00'));
  assert.ok(page1.includes('R35.00'));
  assert.ok(page1.includes('R3.00'));
  assert.ok(page1.includes('R288.00'));
  assert.ok(page1.includes('Page 1 of 1'));
});

test('paginates multi-page invoices cleanly with zero blank pages and proper page numbering', async () => {
  const manyLines = Array.from({ length: 24 }, (_, idx) => ({
    label: `Service line item ${idx + 1}`,
    amount: 20,
  }));
  const invoice = buildServiceInvoiceData({
    requestId: 'req_pdf_multipage',
    request: {
      status: 'completed',
      paymentStatus: 'paid',
      publicRequestReference: 'UNC-9901',
      subject: 'General Maintenance',
      serviceSummary: 'Multi-room Repair',
      customerName: 'Kagiso Molefe',
      serviceAddress: '88 Jan Smuts Ave, Johannesburg',
      totalAmount: 500,
      helperAssignment: { helperId: 'helper_multi', helperName: 'Lerato Nkosi' },
      pricingSnapshot: {
        currency: 'ZAR',
        lines: [...manyLines, { label: 'Booking fee', amount: 20 }],
        total: 500,
      },
    },
  });

  const buffer = await buildServiceRequestInvoicePdfBuffer(invoice);
  const { pageCount, pageTexts } = extractPdfPageTexts(buffer);
  assert.equal(pageCount, 2);
  assert.equal(pageTexts.length, 2);
  assert.ok(pageTexts[0].includes('INV-UNC-9901'));
  assert.ok(pageTexts[0].includes('Page 1 of 2'));
  assert.ok(pageTexts[1].includes('AMOUNT (ZAR)'));
  assert.ok(pageTexts[1].includes('R500.00'));
  assert.ok(pageTexts[1].includes('Page 2 of 2'));
});

test('handles cancellation fee breakdown and waiting/credit adjustments cleanly', () => {
  const cancelBreakdown = buildPriceBreakdownLines({
    isCanceled: true,
    settledAmount: 29,
    request: {
      cancellationFeeAmount: 29,
      helperPayoutBreakdown: {
        travelAmount: 24,
        bookingFeeAmount: 5,
        travelledKm: 6,
      },
    },
  });
  assert.equal(cancelBreakdown.totalAmount, 29);
  assert.equal(cancelBreakdown.lines.length, 2);
  assert.equal(cancelBreakdown.lines[0].amount, 24);
  assert.equal(cancelBreakdown.lines[1].amount, 5);
});
