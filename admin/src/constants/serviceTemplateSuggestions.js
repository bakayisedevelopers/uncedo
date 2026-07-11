function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function q(id, prompt, options = [], config = {}) {
  return {
    id,
    prompt,
    answerType: Array.isArray(options) && options.length ? 'enum' : 'text',
    required: config.required !== false,
    answerHint: config.answerHint || '',
    options: (Array.isArray(options) ? options : []).map((option) => {
      if (typeof option === 'string') {
        return {
          value: slugify(option),
          label: option,
          priceAdder: 0,
          materialAdder: 0,
          multiplier: 1,
        };
      }

      return {
        value: slugify(option.value || option.label || ''),
        label: option.label || String(option.value || '').replace(/_/g, ' '),
        priceAdder: Number(option.priceAdder || 0),
        materialAdder: Number(option.materialAdder || 0),
        multiplier: Number(option.multiplier || 1),
      };
    }),
  };
}

function serviceTemplate(config) {
  return {
    id: slugify(config.id || config.label),
    label: config.label || '',
    promptLabel: config.promptLabel || `I need ${config.label || 'this service'}`,
    description: config.description || '',
    pricing: {
      basePrice: Number(config.pricing?.basePrice ?? 120),
      travelFee: Number(config.pricing?.travelFee ?? 35),
      minimumTotal: Number(config.pricing?.minimumTotal ?? 80),
      maximumTotal: Number(config.pricing?.maximumTotal ?? 500),
    },
    requiresPortfolioSelection: Boolean(config.requiresPortfolioSelection),
    requiredQuestions: config.requiredQuestions || [],
    optionalQuestions: config.optionalQuestions || [],
  };
}

const CATEGORY_SERVICE_TEMPLATES = {
  cleaning: [
    serviceTemplate({
      id: 'dishwashing',
      label: 'Dishwashing',
      promptLabel: 'I need help with dishwashing',
      description: 'Dishwashing support for homes, events, shared kitchens, and post-function clean-up.',
      pricing: { basePrice: 90, travelFee: 35, minimumTotal: 90, maximumTotal: 420 },
      requiredQuestions: [
        q('dishwashing_load', 'How many people are the dishes for?', [
          { value: 'up_to_10', label: 'Up to 10 people', priceAdder: 0 },
          { value: '10_to_30', label: '10 to 30 people', priceAdder: 25 },
          { value: '30_to_80', label: '30 to 80 people', priceAdder: 60 },
          { value: '80_plus', label: '80 plus people', priceAdder: 120 },
        ]),
      ],
      optionalQuestions: [
        q('dishwashing_breakables', 'Are there fragile dishes, pots, or serving trays that need extra care?', ['yes', 'no'], { required: false }),
      ],
    }),
    serviceTemplate({
      id: 'house_cleaning',
      label: 'House Cleaning',
      promptLabel: 'I need house cleaning',
      description: 'General home cleaning for bedrooms, kitchens, bathrooms, lounges, and shared spaces.',
      pricing: { basePrice: 140, travelFee: 35, minimumTotal: 120, maximumTotal: 800 },
      requiredQuestions: [
        q('house_size_band', 'How many rooms need cleaning?', [
          { value: 'one_to_two', label: '1 to 2 rooms', priceAdder: 0 },
          { value: 'three_to_four', label: '3 to 4 rooms', priceAdder: 40 },
          { value: 'five_to_six', label: '5 to 6 rooms', priceAdder: 90 },
          { value: 'seven_plus', label: '7 plus rooms', priceAdder: 150 },
        ]),
      ],
      optionalQuestions: [
        q('house_cleaning_focus_area', 'Is there a specific focus area?', ['kitchen', 'bathroom', 'bedrooms', 'living_area', 'whole_house'], { required: false }),
      ],
    }),
    serviceTemplate({
      id: 'deep_cleaning',
      label: 'Deep Cleaning',
      promptLabel: 'I need a deep cleaning service',
      description: 'Detailed deep cleaning for move-ins, move-outs, neglected rooms, and heavy-duty cleaning jobs.',
      pricing: { basePrice: 220, travelFee: 35, minimumTotal: 180, maximumTotal: 1400 },
      requiredQuestions: [
        q('deep_clean_condition', 'What is the current condition of the space?', [
          { value: 'light_buildup', label: 'Light build-up', priceAdder: 0 },
          { value: 'moderate_buildup', label: 'Moderate build-up', priceAdder: 60 },
          { value: 'heavy_buildup', label: 'Heavy build-up', priceAdder: 140 },
        ]),
      ],
    }),
  ],
  laundry: [
    serviceTemplate({
      id: 'washing_and_folding',
      label: 'Washing and Folding',
      promptLabel: 'I need washing and folding',
      description: 'Everyday laundry support including sorting, washing, drying, folding, and basic garment care.',
      pricing: { basePrice: 100, travelFee: 35, minimumTotal: 90, maximumTotal: 420 },
      requiredQuestions: [
        q('laundry_load_size', 'How much laundry needs attention?', [
          { value: 'small', label: 'Small basket', priceAdder: 0 },
          { value: 'medium', label: 'Medium load', priceAdder: 30 },
          { value: 'large', label: 'Large load', priceAdder: 70 },
          { value: 'bulk', label: 'Bulk / multiple loads', priceAdder: 120 },
        ]),
      ],
    }),
    serviceTemplate({
      id: 'ironing',
      label: 'Ironing',
      promptLabel: 'I need ironing help',
      description: 'Ironing and garment finishing for workwear, school uniforms, bedding, and everyday clothing.',
      pricing: { basePrice: 80, travelFee: 35, minimumTotal: 80, maximumTotal: 360 },
      requiredQuestions: [
        q('ironing_item_count', 'How many items need ironing?', [
          { value: 'up_to_10', label: 'Up to 10 items', priceAdder: 0 },
          { value: '11_to_25', label: '11 to 25 items', priceAdder: 30 },
          { value: '26_to_50', label: '26 to 50 items', priceAdder: 65 },
          { value: '50_plus', label: '50 plus items', priceAdder: 110 },
        ]),
      ],
    }),
  ],
  gardening: [
    serviceTemplate({
      id: 'garden_tidy_up',
      label: 'Garden Tidy-Up',
      promptLabel: 'I need a garden tidy-up',
      description: 'General gardening help for leaves, light trimming, sweeping, and restoring a neat outdoor space.',
      pricing: { basePrice: 150, travelFee: 35, minimumTotal: 130, maximumTotal: 900 },
      requiredQuestions: [
        q('garden_tidy_scope', 'What needs the most attention?', ['leaves', 'flower_beds', 'walkways', 'general_tidy', 'everything']),
      ],
    }),
    serviceTemplate({
      id: 'plant_watering',
      label: 'Plant Watering',
      promptLabel: 'I need plant watering support',
      description: 'Scheduled watering support for gardens, balconies, and potted plants while the customer is away or busy.',
      pricing: { basePrice: 70, travelFee: 25, minimumTotal: 70, maximumTotal: 260 },
    }),
  ],
  beauty: [
    serviceTemplate({
      id: 'braiding',
      label: 'Braiding',
      promptLabel: 'I want braiding services',
      description: 'Mobile braiding services for protective styles, salon-quality finish, and portfolio-backed selection.',
      pricing: { basePrice: 280, travelFee: 35, minimumTotal: 250, maximumTotal: 1800 },
      requiresPortfolioSelection: true,
      requiredQuestions: [
        q('braid_style', 'Which braid style do you want?', [
          { value: 'knotless', label: 'Knotless', priceAdder: 60 },
          { value: 'twists', label: 'Twists', priceAdder: 40 },
          { value: 'cornrows', label: 'Cornrows', priceAdder: 20 },
          { value: 'other', label: 'Other', priceAdder: 35 },
        ]),
        q('braid_length', 'What braid length do you want?', [
          { value: 'short', label: 'Short', priceAdder: 0 },
          { value: 'medium', label: 'Medium', priceAdder: 70 },
          { value: 'long', label: 'Long', priceAdder: 150 },
        ]),
      ],
    }),
    serviceTemplate({
      id: 'makeup',
      label: 'Makeup',
      promptLabel: 'I need a makeup artist',
      description: 'At-home makeup services for events, shoots, bridal prep, and everyday glam.',
      pricing: { basePrice: 240, travelFee: 35, minimumTotal: 220, maximumTotal: 1400 },
      requiresPortfolioSelection: true,
      requiredQuestions: [
        q('makeup_occasion', 'What is the makeup for?', ['casual', 'party', 'bridal', 'photoshoot', 'other']),
      ],
    }),
    serviceTemplate({
      id: 'nail_care',
      label: 'Nail Care',
      promptLabel: 'I need nail care services',
      description: 'Home nail services for manicures, pedicures, gel sets, and simple maintenance.',
      pricing: { basePrice: 180, travelFee: 35, minimumTotal: 160, maximumTotal: 900 },
      requiresPortfolioSelection: true,
    }),
  ],
  yard_maintenance: [
    serviceTemplate({
      id: 'grass_cutting',
      label: 'Grass Cutting',
      promptLabel: 'I need grass cutting',
      description: 'Grass cutting and trimming for residential yards, rentals, and outdoor common areas.',
      pricing: { basePrice: 170, travelFee: 35, minimumTotal: 150, maximumTotal: 1100 },
      requiredQuestions: [
        q('grass_height', 'How overgrown is the grass?', [
          { value: 'light', label: 'Light trim', priceAdder: 0 },
          { value: 'moderate', label: 'Moderate growth', priceAdder: 50 },
          { value: 'heavy', label: 'Heavy overgrowth', priceAdder: 110 },
        ]),
      ],
    }),
    serviceTemplate({
      id: 'tree_trimming',
      label: 'Tree Trimming',
      promptLabel: 'I need tree trimming',
      description: 'Tree and hedge trimming for safety, presentation, and light shape correction.',
      pricing: { basePrice: 260, travelFee: 35, minimumTotal: 220, maximumTotal: 1800 },
    }),
  ],
  barber: [
    serviceTemplate({
      id: 'haircut',
      label: 'Haircut',
      promptLabel: 'I need a haircut',
      description: 'Mobile barber haircut service for adults and children, including standard trims and shape-ups.',
      pricing: { basePrice: 120, travelFee: 35, minimumTotal: 110, maximumTotal: 420 },
    }),
    serviceTemplate({
      id: 'beard_trim',
      label: 'Beard Trim',
      promptLabel: 'I need a beard trim',
      description: 'Barber beard trimming, shaping, lining, and grooming at the customer location.',
      pricing: { basePrice: 90, travelFee: 35, minimumTotal: 90, maximumTotal: 280 },
    }),
  ],
  care: [
    serviceTemplate({
      id: 'babysitting',
      label: 'Babysitting',
      promptLabel: 'I need babysitting support',
      description: 'Reliable child supervision and support for daytime, evening, event, and emergency needs.',
      pricing: { basePrice: 160, travelFee: 35, minimumTotal: 150, maximumTotal: 1200 },
      requiredQuestions: [
        q('babysitting_children_count', 'How many children need care?', [
          { value: 'one', label: '1 child', priceAdder: 0 },
          { value: 'two', label: '2 children', priceAdder: 35 },
          { value: 'three_plus', label: '3 or more children', priceAdder: 80 },
        ]),
      ],
    }),
    serviceTemplate({
      id: 'pet_sitting',
      label: 'Pet Sitting',
      promptLabel: 'I need pet sitting',
      description: 'In-home pet support for feeding, company, short visits, and simple pet routines.',
      pricing: { basePrice: 130, travelFee: 35, minimumTotal: 120, maximumTotal: 700 },
    }),
  ],
  car_wash: [
    serviceTemplate({
      id: 'exterior_wash',
      label: 'Exterior Wash',
      promptLabel: 'I need an exterior car wash',
      description: 'Mobile exterior wash for dust, mud, and road grime with a quick clean finish.',
      pricing: { basePrice: 110, travelFee: 35, minimumTotal: 100, maximumTotal: 420 },
    }),
    serviceTemplate({
      id: 'interior_cleaning',
      label: 'Interior Cleaning',
      promptLabel: 'I need interior car cleaning',
      description: 'Interior vacuuming, dashboard wipe-down, seat cleaning, and light detailing.',
      pricing: { basePrice: 140, travelFee: 35, minimumTotal: 130, maximumTotal: 560 },
    }),
    serviceTemplate({
      id: 'full_detailing',
      label: 'Full Detailing',
      promptLabel: 'I need full car detailing',
      description: 'Comprehensive interior and exterior detailing with added time for deep cleaning and finishing.',
      pricing: { basePrice: 260, travelFee: 35, minimumTotal: 240, maximumTotal: 1500 },
    }),
  ],
};

export function getAdminServiceSuggestionsByCategory(categoryId = '') {
  return CATEGORY_SERVICE_TEMPLATES[String(categoryId || '').trim().toLowerCase()] || [];
}

export function getAdminServiceSuggestionMatch({ categoryId = '', serviceId = '', label = '' } = {}) {
  const suggestions = getAdminServiceSuggestionsByCategory(categoryId);
  const normalizedNeedle = slugify(serviceId || label);
  if (!normalizedNeedle) return null;

  return suggestions.find((suggestion) => (
    suggestion.id === normalizedNeedle
    || slugify(suggestion.label) === normalizedNeedle
    || normalizedNeedle.includes(suggestion.id)
    || suggestion.id.includes(normalizedNeedle)
  )) || null;
}
