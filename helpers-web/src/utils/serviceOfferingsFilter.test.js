import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAvailableCatalogEntries,
  groupSubmittedOfferings,
} from './serviceOfferingsFilter.js';

const sampleCatalog = [
  {
    id: 'car_wash',
    label: 'Car Wash',
    categoryId: 'auto',
    categoryName: 'Auto Care',
    optionApplicationMode: 'per_option',
    options: [
      { id: 'exterior', title: 'Exterior Wash' },
      { id: 'interior', title: 'Interior Vacuum' },
      { id: 'full_valet', title: 'Full Valet' },
    ],
  },
  {
    id: 'barber',
    label: 'Barber',
    categoryId: 'grooming',
    categoryName: 'Grooming',
    optionApplicationMode: 'per_option',
    options: [
      { id: 'fade', title: 'Fade' },
      { id: 'beard_trim', title: 'Beard Trim' },
    ],
  },
  {
    id: 'plumbing_leak',
    label: 'Plumbing Leak Repair',
    categoryId: 'plumbing',
    categoryName: 'Plumbing',
    optionApplicationMode: 'unified',
    options: [
      { id: 'sink', title: 'Sink' },
      { id: 'pipe', title: 'Pipe' },
    ],
  },
];

test('hides a service completely when all of its options have been applied for, and re-exposes it if a new option is added later', () => {
  const offerings = [
    { id: 'h1_car_wash__exterior', serviceId: 'car_wash', serviceName: 'Car Wash', optionId: 'exterior', optionTitle: 'Exterior Wash', status: 'approved', approved: true },
    { id: 'h1_car_wash__interior', serviceId: 'car_wash', serviceName: 'Car Wash', optionId: 'interior', optionTitle: 'Interior Vacuum', status: 'approved', approved: true },
    { id: 'h1_car_wash__full_valet', serviceId: 'car_wash', serviceName: 'Car Wash', optionId: 'full_valet', optionTitle: 'Full Valet', status: 'pending', approved: false },
    { id: 'h1_barber__fade', serviceId: 'barber', serviceName: 'Barber', optionId: 'fade', optionTitle: 'Fade', status: 'approved', approved: true },
    { id: 'h1_plumbing_leak', serviceId: 'plumbing_leak', serviceName: 'Plumbing Leak Repair', optionId: '', optionTitle: '', status: 'approved', approved: true },
  ];

  const available = getAvailableCatalogEntries(sampleCatalog, offerings);
  assert.deepEqual(available.map((item) => item.id), ['barber']);
  assert.deepEqual(available[0].options.map((opt) => opt.id), ['beard_trim']);
  assert.equal(available[0].totalOptionsCount, 2);
  assert.equal(available[0].availableOptionsCount, 1);

  // Simulate adding a new 4th option to Car Wash in the catalogue later
  const expandedCatalog = [
    {
      ...sampleCatalog[0],
      options: [...sampleCatalog[0].options, { id: 'engine_clean', title: 'Engine Bay Clean' }],
    },
    ...sampleCatalog.slice(1),
  ];

  const availableAfterNewOption = getAvailableCatalogEntries(expandedCatalog, offerings);
  assert.deepEqual(availableAfterNewOption.map((item) => item.id), ['car_wash', 'barber']);
  assert.deepEqual(availableAfterNewOption[0].options.map((opt) => opt.id), ['engine_clean']);
});

test('allows re-adding options or services that have been removed from the profile', () => {
  const offerings = [
    { id: 'h1_plumbing_leak', serviceId: 'plumbing_leak', serviceName: 'Plumbing Leak Repair', optionId: '', status: 'removed' },
    { id: 'h1_barber__fade', serviceId: 'barber', serviceName: 'Barber', optionId: 'fade', status: 'removed' },
  ];

  const available = getAvailableCatalogEntries(sampleCatalog, offerings);
  assert.deepEqual(available.map((item) => item.id), ['car_wash', 'barber', 'plumbing_leak']);
  assert.equal(available.find((i) => i.id === 'barber').options.length, 2);
});

test('groups submitted offerings under parent service with accurate approved/pending/declined counts', () => {
  const catalogById = new Map(sampleCatalog.map((item) => [item.id, item]));
  const offerings = [
    { id: '1', serviceId: 'barber', serviceName: 'Barber', optionId: 'fade', optionTitle: 'Fade', status: 'approved', approved: true },
    { id: '2', serviceId: 'barber', serviceName: 'Barber', optionId: 'beard_trim', optionTitle: 'Beard Trim', status: 'pending', approved: false },
    { id: '3', serviceId: 'car_wash', serviceName: 'Car Wash', optionId: 'exterior', optionTitle: 'Exterior Wash', status: 'approved', approved: true },
    { id: '4', serviceId: 'plumbing_leak', serviceName: 'Plumbing Leak Repair', optionId: '', optionTitle: '', status: 'declined', approved: false },
  ];

  const grouped = groupSubmittedOfferings(offerings, catalogById);
  assert.deepEqual(grouped.map((g) => g.serviceId), ['barber', 'car_wash', 'plumbing_leak']);
  assert.equal(grouped[0].approvedCount, 1);
  assert.equal(grouped[0].pendingCount, 1);
  assert.deepEqual(grouped[0].items.map((i) => i.optionTitle), ['Beard Trim', 'Fade']);
  assert.equal(grouped[1].approvedCount, 1);
  assert.equal(grouped[2].declinedCount, 1);
});
