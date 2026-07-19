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
          value: option,
          label: option.replace(/_/g, ' '),
          priceAdder: 0,
          materialAdder: 0,
          multiplier: 1,
        };
      }

      return {
        value: option.value,
        label: option.label || String(option.value || '').replace(/_/g, ' '),
        priceAdder: Number(option.priceAdder || 0),
        materialAdder: Number(option.materialAdder || 0),
        multiplier: Number(option.multiplier || 1),
      };
    }),
  };
}

const CATEGORY_PRESETS = {
  cleaning: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', ['now', 'later']),
      q('service_address_target', 'Where should the helper come?', ['current_location', 'saved_home_address', 'another_address']),
      q('cleaning_scope_level', 'How much cleaning work is involved?', [
        { value: 'small', label: 'Small', priceAdder: 0 },
        { value: 'medium', label: 'Medium', priceAdder: 20 },
        { value: 'large', label: 'Large', priceAdder: 45 },
        { value: 'deep_clean', label: 'Deep clean', priceAdder: 80 },
      ]),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', [], { required: false }),
      q('cleaning_materials_source', 'Do you need the helper to bring equipment or materials?', [
        { value: 'bring_all', label: 'Bring everything', priceAdder: 35 },
        { value: 'bring_some', label: 'Bring some items', priceAdder: 20 },
        { value: 'use_mine', label: 'Use mine', priceAdder: 0 },
      ], { required: false }),
    ],
  },
  yard_maintenance: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', ['now', 'later']),
      q('service_address_target', 'Where should the helper come?', ['current_location', 'saved_home_address', 'another_address']),
      q('yard_area_size', 'How large is the yard or outdoor area?', [
        { value: 'small', label: 'Small', priceAdder: 0 },
        { value: 'medium', label: 'Medium', priceAdder: 35 },
        { value: 'large', label: 'Large', priceAdder: 70 },
        { value: 'extra_large', label: 'Extra large', priceAdder: 120 },
      ]),
      q('yard_equipment_source', 'Do you want the helper to bring equipment?', [
        { value: 'bring_equipment', label: 'Bring equipment', priceAdder: 35 },
        { value: 'use_my_equipment', label: 'Use my equipment', priceAdder: 0 },
        { value: 'mixed', label: 'Mixed', priceAdder: 15 },
      ]),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', [], { required: false }),
      q('yard_site_utilities', 'Is electricity or water available on site?', ['both', 'electricity_only', 'water_only', 'neither'], { required: false }),
    ],
  },
  beauty: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', ['now', 'later']),
      q('service_for_person', 'Is this for you or someone else?', ['self', 'someone_else']),
      q('service_address_target', 'Where should the beauty service happen?', ['current_location', 'saved_home_address', 'another_address']),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', [], { required: false }),
      q('beauty_reference_photo_preference', 'Would you like to upload a reference photo?', ['yes', 'no'], { required: false }),
    ],
  },
  barber: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', ['now', 'later']),
      q('service_for_person', 'Is this for you or someone else?', ['self', 'someone_else']),
      q('service_address_target', 'Where should the barber come?', ['current_location', 'saved_home_address', 'another_address']),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', [], { required: false }),
    ],
  },
  care: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', ['now', 'later']),
      q('service_address_target', 'Where should the care happen?', ['current_location', 'saved_home_address', 'another_address', 'helper_location']),
      q('care_recipient', 'Who is the service for?'),
      q('care_duration_needed', 'How long do you need the helper for?'),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', [], { required: false }),
    ],
  },
  car_wash: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', ['now', 'later']),
      q('service_address_target', 'Where should the helper come?', ['current_location', 'saved_home_address', 'another_address']),
      q('vehicle_type', 'What type of vehicle should be cleaned?', [
        { value: 'sedan', label: 'Sedan', priceAdder: 0 },
        { value: 'hatchback', label: 'Hatchback', priceAdder: 10 },
        { value: 'suv', label: 'SUV', priceAdder: 35 },
        { value: 'bakkie', label: 'Bakkie', priceAdder: 40 },
        { value: 'van', label: 'Van', priceAdder: 55 },
        { value: 'minibus', label: 'Minibus', priceAdder: 70 },
        { value: 'other', label: 'Other', priceAdder: 25 },
      ]),
      q('car_wash_scope', 'Do you need inside, outside, or both?', [
        { value: 'outside_only', label: 'Outside only', priceAdder: 0 },
        { value: 'inside_only', label: 'Inside only', priceAdder: 20 },
        { value: 'inside_and_outside', label: 'Inside and outside', priceAdder: 45 },
      ]),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', [], { required: false }),
      q('car_wash_site_utilities', 'Do you have water or electricity available on site?', ['both', 'water_only', 'electricity_only', 'neither'], { required: false }),
    ],
  },
};

const SERVICE_PRESETS = {
  dishwashing: {
    required: [
      q('dishwashing_load', 'How many people are the dishes for?', [
        { value: 'up_to_10', label: 'Up to 10 people', priceAdder: 0 },
        { value: '10_to_30', label: '10 to 30 people', priceAdder: 20 },
        { value: '30_to_80', label: '30 to 80 people', priceAdder: 55 },
        { value: '80_plus', label: '80 plus people', priceAdder: 110 },
      ]),
    ],
    optional: [],
  },
  house_cleaning: {
    required: [
      q('house_size_band', 'How many rooms need cleaning?', [
        { value: 'one_to_two', label: '1 to 2 rooms', priceAdder: 0 },
        { value: 'three_to_four', label: '3 to 4 rooms', priceAdder: 35 },
        { value: 'five_to_six', label: '5 to 6 rooms', priceAdder: 80 },
        { value: 'seven_plus', label: '7 plus rooms', priceAdder: 130 },
      ]),
    ],
    optional: [],
  },
  braiding: {
    required: [
      q('braid_style', 'Which braid style do you want?', [
        { value: 'knotless', label: 'Knotless', priceAdder: 60 },
        { value: 'twists', label: 'Twists', priceAdder: 40 },
        { value: 'cornrows', label: 'Cornrows', priceAdder: 20 },
        { value: 'other', label: 'Other', priceAdder: 35 },
      ]),
    ],
    optional: [],
  },
};

export function getAdminQuestionPreset({ serviceId = '', categoryId = '' } = {}) {
  const servicePreset = SERVICE_PRESETS[String(serviceId || '').trim().toLowerCase()] || { required: [], optional: [] };
  const categoryPreset = CATEGORY_PRESETS[String(categoryId || '').trim().toLowerCase()] || { required: [], optional: [] };

  const required = [...categoryPreset.required, ...servicePreset.required];
  const optional = [...categoryPreset.optional, ...servicePreset.optional];

  return {
    required,
    optional,
  };
}
