import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAskAiRequestPayload,
  buildCatalogCategories,
  buildShareServiceUrl,
  buildWhatsAppOptionBookingUrl,
  buildWhatsAppQuestionUrl,
  extractPicturedServiceOptions,
  filterBrowseServiceOptions,
  shuffleServiceOptions,
} from './serviceCatalogModel.js';

test('extractPicturedServiceOptions displays only active approved options that have valid pictures', () => {
  const result = extractPicturedServiceOptions([
    {
      id: 'laundry_care',
      label: 'Laundry Service',
      categoryId: 'home_care',
      categoryName: 'Home & Laundry',
      active: true,
      approved: true,
      pricing: { pricingMode: 'fixed' },
      options: [
        {
          id: 'wash_fold',
          title: 'Wash & Fold Basket',
          description: 'Washed, dried, and neatly folded.',
          price: 180,
          imageUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/wash.jpg?alt=media',
        },
        {
          id: 'ironing_only',
          title: 'Ironing Only',
          description: 'No picture uploaded yet.',
          price: 120,
          imageUrl: '',
        },
      ],
    },
    {
      id: 'inactive_svc',
      label: 'Paused Service',
      active: false,
      approved: true,
      options: [
        {
          id: 'opt_paused',
          title: 'Should Be Hidden',
          price: 100,
          imageUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/paused.jpg?alt=media',
        },
      ],
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Wash & Fold Basket');
  assert.equal(result[0].parentServiceLabel, 'Laundry Service');
  assert.equal(result[0].categoryName, 'Home & Laundry');
  assert.equal(result[0].priceLabel, 'R180');
  assert.match(result[0].whatsappUrl, /Wash%20%26%20Fold%20Basket/);
});

test('filterBrowseServiceOptions and buildCatalogCategories filter by search, category, and liked state', () => {
  const items = extractPicturedServiceOptions([
    {
      id: 'hair_braids',
      label: 'Hair Braiding',
      categoryId: 'beauty',
      categoryName: 'Beauty',
      options: [
        {
          id: 'knotless',
          title: 'Knotless Braids',
          price: 280,
          imageUrl: 'https://example.com/braids.jpg',
        },
      ],
    },
    {
      id: 'garden',
      label: 'Garden Care',
      categoryId: 'outdoor',
      categoryName: 'Outdoor',
      options: [
        {
          id: 'lawn_mow',
          title: 'Lawn Mowing',
          price: 220,
          imageUrl: 'https://example.com/lawn.jpg',
        },
      ],
    },
  ]);

  const categories = buildCatalogCategories(items);
  assert.deepEqual(categories.map((c) => c.id), ['beauty', 'outdoor']);

  assert.equal(filterBrowseServiceOptions(items, { searchQuery: 'knotless' }).length, 1);
  assert.equal(filterBrowseServiceOptions(items, { categoryId: 'outdoor' }).length, 1);
  assert.equal(
    filterBrowseServiceOptions(items, { onlyLiked: true, likedIds: new Set([items[0].id]) }).length,
    1,
  );
  assert.match(
    buildWhatsAppOptionBookingUrl({ title: 'Knotless Braids', parentServiceLabel: 'Hair Braiding' }),
    /^https:\/\/wa\.me\/27605239926\?text=/,
  );
  assert.match(
    buildWhatsAppQuestionUrl({
      title: 'Knotless Braids',
      parentServiceLabel: 'Hair Braiding',
      question: 'Do you include hair?',
    }),
    /Do%20you%20include%20hair%3F/,
  );
  assert.equal(
    buildShareServiceUrl('https://bakayise-uncedo-latest.web.app/', 'hair_braids__knotless_0'),
    'https://bakayise-uncedo-latest.web.app/?service=hair_braids__knotless_0',
  );

  const prioritized = shuffleServiceOptions(items, { priorityId: items[1].id });
  assert.equal(prioritized[0].id, items[1].id);
  const rotated = shuffleServiceOptions(items, { excludeFirstId: items[0].id });
  assert.notEqual(rotated[0].id, items[0].id);

  const aiPayload = buildAskAiRequestPayload({
    item: items[0],
    message: '  How long does knotless braiding take?  ',
    history: [
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello!' },
      { role: 'user', text: '   ' },
    ],
  });
  assert.equal(aiPayload.serviceId, 'hair_braids');
  assert.equal(aiPayload.optionId, 'knotless');
  assert.equal(aiPayload.optionTitle, 'Knotless Braids');
  assert.equal(aiPayload.message, 'How long does knotless braiding take?');
  assert.equal(aiPayload.history.length, 2);
});
