'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWhatsAppToolRegistry } = require('./toolRegistry');

const services = [
  {
    id: 'wash', categoryId: 'car_wash', categoryName: 'Car wash', label: 'Full wash',
    description: 'An approved vehicle wash service.', type: 'service', active: true, approved: true,
    includedServiceIds: [], pricing: { pricingMode: 'fixed', basePrice: 100, materialFee: 0, minimumTotal: 0 },
    questionnaire: { required: [{ id: 'vehicle_type', prompt: 'Vehicle type?', required: true, answerType: 'enum', options: [{ value: 'sedan', label: 'Sedan' }] }], optional: [] },
  },
  {
    id: 'hidden', categoryId: 'car_wash', label: 'Hidden', description: '', type: 'service', active: false, approved: true,
    includedServiceIds: [], pricing: {}, questionnaire: { required: [], optional: [] },
  },
];

test('public catalogue tools expose only active approved services and no internal fields', async () => {
  const registry = createWhatsAppToolRegistry({ getCatalogEntries: async () => services });
  const result = await registry.execute('listAvailableServices', {}, { kind: 'guest' });
  assert.deepEqual(result.services.map((service) => service.id), ['wash']);
  assert.equal(result.services[0].pricing.basePrice, 100);
  assert.equal('createdBy' in result.services[0], false);
});

test('tool input rejects unknown fields, unknown services and unsupported tools', async () => {
  const registry = createWhatsAppToolRegistry({ getCatalogEntries: async () => services });
  await assert.rejects(registry.execute('listAvailableServices', { uid: 'forged' }, { kind: 'guest' }), /unsupported fields/);
  await assert.rejects(registry.execute('getServiceDetails', { serviceId: 'made_up' }, { kind: 'guest' }), { code: 'service-not-found' });
  await assert.rejects(registry.execute('confirmServiceRequest', {}, { kind: 'guest' }), /not available/);
});

test('questionnaire tool returns exact active service question IDs and validates them', async () => {
  const registry = createWhatsAppToolRegistry({ getCatalogEntries: async () => services });
  const questionnaire = await registry.execute('getServiceQuestionnaire', { serviceId: 'wash' }, { kind: 'guest' });
  assert.deepEqual(questionnaire.questions.map((question) => question.id), ['vehicle_type']);
  assert.deepEqual(await registry.validateServiceAnswers({ serviceId: 'wash', answers: { vehicle_type: 'sedan' } }), {
    answers: { vehicle_type: 'sedan' }, missingRequired: [],
  });
  await assert.rejects(registry.validateServiceAnswers({ serviceId: 'wash', answers: { vehicle_type: 'truck' } }), /Invalid option/);
});
