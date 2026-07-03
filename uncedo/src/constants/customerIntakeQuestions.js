import { CUSTOMER_SERVICE_CATALOG, getCustomerPackagesForCategory, getCustomerServiceById, getCustomerServicesForCategory } from './serviceCatalog';

function q(id, prompt, config = {}) {
  return {
    id,
    prompt,
    answerType: config.answerType || 'text',
    options: Array.isArray(config.options) ? config.options : [],
    answerHint: config.answerHint || '',
  };
}

function normalizeAnswerValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return value;
  return String(value || '').trim();
}

function hasAnswerValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return String(value || '').trim().length > 0;
}

const CATEGORY_QUESTION_PLAN = {
  cleaning: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', {
        answerType: 'enum',
        options: ['now', 'later'],
      }),
      q('service_address_target', 'Where should the helper come?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address'],
      }),
      q('cleaning_scope_level', 'How much cleaning work is involved?', {
        answerType: 'enum',
        options: ['small', 'medium', 'large', 'deep_clean'],
      }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', {
        answerType: 'text',
      }),
      q('cleaning_materials_source', 'Do you need the helper to bring equipment or materials?', {
        answerType: 'enum',
        options: ['bring_all', 'bring_some', 'use_mine'],
      }),
      q('cleaning_reference_photos', 'Do you want to upload reference photos of the area?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
    ],
  },
  yard_maintenance: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', {
        answerType: 'enum',
        options: ['now', 'later'],
      }),
      q('service_address_target', 'Where should the helper come?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address'],
      }),
      q('yard_area_size', 'How large is the yard or outdoor area?', {
        answerType: 'dimension',
        answerHint: 'Capture a precise size such as 6m x 7m, 40 square meters, small yard, medium yard, or large yard.',
      }),
      q('yard_equipment_source', 'Do you want the helper to bring equipment?', {
        answerType: 'enum',
        options: ['bring_equipment', 'use_my_equipment', 'mixed'],
      }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', {
        answerType: 'text',
      }),
      q('yard_reference_photos', 'Do you want to upload photos of the yard?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
      q('yard_site_utilities', 'Is electricity or water available on site?', {
        answerType: 'enum',
        options: ['both', 'electricity_only', 'water_only', 'neither'],
      }),
    ],
  },
  beauty: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', {
        answerType: 'enum',
        options: ['now', 'later'],
      }),
      q('service_for_person', 'Is this for you or someone else?', {
        answerType: 'enum',
        options: ['self', 'someone_else'],
      }),
      q('service_address_target', 'Where should the beauty service happen?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address'],
      }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', {
        answerType: 'text',
      }),
      q('beauty_reference_photo_preference', 'Would you like to upload a reference photo?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
      q('beauty_style_selection_timing', 'Would you prefer to choose the style when the helper arrives?', {
        answerType: 'enum',
        options: ['choose_now', 'choose_on_arrival'],
      }),
    ],
  },
  barber: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', {
        answerType: 'enum',
        options: ['now', 'later'],
      }),
      q('service_for_person', 'Is this for you or someone else?', {
        answerType: 'enum',
        options: ['self', 'someone_else'],
      }),
      q('service_address_target', 'Where should the barber come?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address'],
      }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', {
        answerType: 'text',
      }),
      q('barber_reference_photo_preference', 'Would you like to upload a haircut reference photo?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
      q('barber_product_scope', 'Should the barber bring products or only tools?', {
        answerType: 'enum',
        options: ['tools_only', 'tools_and_products'],
      }),
    ],
  },
  body_care: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', {
        answerType: 'enum',
        options: ['now', 'later'],
      }),
      q('service_for_person', 'Is this for you or someone else?', {
        answerType: 'enum',
        options: ['self', 'someone_else'],
      }),
      q('service_address_target', 'Where should the body care service happen?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address'],
      }),
      q('body_care_setup', 'Should the helper bring oils, towels, and treatment items?', {
        answerType: 'enum',
        options: ['bring_everything', 'bring_some_items', 'use_mine'],
      }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', {
        answerType: 'text',
      }),
      q('body_care_preference_notes', 'Any pressure, comfort, or scent preferences to share?', {
        answerType: 'text',
      }),
      q('body_care_reference_photo_preference', 'Would you like to upload any reference photo or treatment inspiration?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
    ],
  },
  care: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', {
        answerType: 'enum',
        options: ['now', 'later'],
      }),
      q('service_address_target', 'Where should the care happen?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address', 'helper_location'],
      }),
      q('care_recipient', 'Who is the service for?', {
        answerType: 'text',
      }),
      q('care_duration_needed', 'How long do you need the helper for?', {
        answerType: 'text',
      }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', {
        answerType: 'text',
      }),
      q('care_safety_notes', 'Would you like to share any safety or preference notes?', {
        answerType: 'text',
      }),
      q('care_contact_person', 'Do you want to add a contact person or emergency note?', {
        answerType: 'text',
      }),
    ],
  },
  car_wash: {
    required: [
      q('timing_preference', 'Do you need this help now or later?', {
        answerType: 'enum',
        options: ['now', 'later'],
      }),
      q('service_address_target', 'Where should the helper come?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address'],
      }),
      q('vehicle_type', 'What type of vehicle should be cleaned?', {
        answerType: 'enum',
        options: ['sedan', 'hatchback', 'suv', 'bakkie', 'van', 'minibus', 'other'],
      }),
      q('car_wash_scope', 'Do you need inside, outside, or both?', {
        answerType: 'enum',
        options: ['outside_only', 'inside_only', 'inside_and_outside'],
      }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', {
        answerType: 'text',
      }),
      q('car_condition_photos', 'Would you like to upload photos of the vehicle condition?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
      q('car_wash_site_utilities', 'Do you have water or electricity available on site?', {
        answerType: 'enum',
        options: ['both', 'water_only', 'electricity_only', 'neither'],
      }),
    ],
  },
};

const SERVICE_QUESTION_PLAN = {
  dishwashing: {
    required: [
      q('dishwashing_context', 'Is this normal household dishwashing or after an event?', {
        answerType: 'enum',
        options: ['household', 'after_event'],
      }),
      q('dishwashing_load_size', 'About how many dishes or people is this for?', {
        answerType: 'text',
      }),
      q('dishwashing_include_kitchen', 'Do you also need kitchen cleaning?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
    optional: [],
  },
  house_cleaning: {
    required: [
      q('house_cleaning_area_count', 'How many rooms or areas need cleaning?', { answerType: 'text' }),
      q('house_cleaning_depth', 'Do you need deep cleaning or standard cleaning?', {
        answerType: 'enum',
        options: ['standard', 'deep_clean'],
      }),
    ],
    optional: [q('house_cleaning_supply_source', 'Should the helper bring supplies?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  room_cleaning: {
    required: [q('room_cleaning_room_count', 'How many rooms need cleaning?', { answerType: 'text' })],
    optional: [q('room_cleaning_notes', 'Any specific room instructions?', { answerType: 'text' })],
  },
  kitchen_cleaning: {
    required: [
      q('kitchen_cleaning_depth', 'Is this a basic clean or deep clean?', {
        answerType: 'enum',
        options: ['basic', 'deep_clean'],
      }),
      q('kitchen_cleaning_include_dishes', 'Do you also need dishes washed?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
    ],
    optional: [q('kitchen_cleaning_appliance_notes', 'Are there appliances that need special attention?', { answerType: 'text' })],
  },
  bathroom_cleaning: {
    required: [
      q('bathroom_cleaning_count', 'How many bathrooms need cleaning?', { answerType: 'text' }),
      q('bathroom_cleaning_treatment', 'Do you need stain or mold treatment?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
    optional: [],
  },
  floor_cleaning: {
    required: [
      q('floor_cleaning_surface_type', 'What type of floors need cleaning?', {
        answerType: 'enum',
        options: ['tile', 'wood', 'carpet', 'cement', 'mixed', 'other'],
      }),
      q('floor_cleaning_area_size', 'How many rooms or how large is the area?', { answerType: 'text' }),
      q('floor_cleaning_finish', 'Do you need polishing or only cleaning?', { answerType: 'enum', options: ['clean_only', 'clean_and_polish'] }),
    ],
    optional: [],
  },
  event_cleanup: {
    required: [
      q('event_cleanup_guest_count', 'How many guests or how large was the event?', { answerType: 'text' }),
      q('event_cleanup_area_scope', 'What areas need to be cleaned?', { answerType: 'text' }),
      q('event_cleanup_additional_tasks', 'Do you need dishwashing or waste removal too?', { answerType: 'text' }),
    ],
    optional: [],
  },
  laundry: {
    required: [
      q('laundry_load_count', 'How many loads or how many people is the laundry for?', { answerType: 'text' }),
      q('laundry_scope', 'Do you need wash only or wash and fold?', {
        answerType: 'enum',
        options: ['wash_only', 'wash_and_fold'],
      }),
      q('laundry_extra_tasks', 'Do you also need ironing or stain treatment?', { answerType: 'text' }),
    ],
    optional: [],
  },
  ironing: {
    required: [
      q('ironing_item_count', 'How many clothing items need ironing?', { answerType: 'text' }),
      q('ironing_special_items', 'Are any items delicate or formal wear?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
    optional: [],
  },
  folding: {
    required: [q('folding_item_count', 'About how many items need folding?', { answerType: 'text' })],
    optional: [q('folding_sort_preference', 'Should items be sorted in a certain way?', { answerType: 'text' })],
  },
  stain_treatment: {
    required: [
      q('stain_treatment_item_type', 'What type of items have stains?', { answerType: 'text' }),
      q('stain_treatment_item_count', 'How many items need stain treatment?', { answerType: 'text' }),
    ],
    optional: [q('stain_treatment_cause', 'Do you know what caused the stains?', { answerType: 'text' })],
  },
  grass_cutting: {
    required: [
      q('yard_area_size', 'How big is the yard?', { answerType: 'dimension', answerHint: 'Capture exact size such as 6m x 7m or a clear size description.' }),
      q('grass_cutting_equipment_source', 'Should the helper bring a lawnmower?', {
        answerType: 'enum',
        options: ['bring_lawnmower', 'use_my_lawnmower'],
      }),
      q('grass_cutting_electricity', 'Is electricity available if needed?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
    optional: [],
  },
  gardening: {
    required: [
      q('gardening_scope', 'What gardening work do you need done?', { answerType: 'text' }),
      q('gardening_area_size', 'How large is the garden area?', { answerType: 'text' }),
      q('gardening_tools_source', 'Should the helper bring tools and gloves?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
    optional: [],
  },
  landscaping: {
    required: [
      q('landscaping_goal', 'What landscaping result are you looking for?', { answerType: 'text' }),
      q('landscaping_area_size', 'How large is the outdoor area?', { answerType: 'text' }),
    ],
    optional: [q('landscaping_reference_photo', 'Would you like to upload a photo of the yard?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  tree_trimming: {
    required: [
      q('tree_trimming_tree_count', 'How many trees need trimming?', { answerType: 'text' }),
      q('tree_trimming_height', 'How tall are the trees?', { answerType: 'text' }),
      q('tree_trimming_equipment_source', 'Should the helper bring trimming equipment?', {
        answerType: 'enum',
        options: ['bring_equipment', 'use_my_equipment'],
      }),
    ],
    optional: [q('tree_trimming_reference_photo', 'Would you like to upload a photo of the trees?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  tree_cutting: {
    required: [
      q('tree_cutting_tree_count', 'How many trees need cutting?', { answerType: 'text' }),
      q('tree_cutting_height', 'How large or tall are the trees?', { answerType: 'text' }),
      q('tree_cutting_equipment_source', 'Should the helper bring cutting equipment?', {
        answerType: 'enum',
        options: ['bring_equipment', 'use_my_equipment'],
      }),
    ],
    optional: [q('tree_cutting_reference_photo', 'Would you like to upload a photo for safety review?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  hedge_trimming: {
    required: [
      q('hedge_trimming_length', 'How long are the hedges that need trimming?', { answerType: 'text' }),
      q('hedge_trimming_waste_removal', 'Do you need waste removed afterwards?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
    optional: [],
  },
  weeding: {
    required: [
      q('weeding_area_size', 'How large is the area that needs weeding?', { answerType: 'text' }),
      q('weeding_frequency', 'Is this a one-time job or recurring?', { answerType: 'enum', options: ['once_off', 'recurring'] }),
    ],
    optional: [],
  },
  planting_flowers: {
    required: [
      q('planting_flowers_bed_count', 'How many flower beds or areas need planting?', { answerType: 'text' }),
      q('planting_flowers_material_owner', 'Do you already have the flowers?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
      q('planting_flowers_helper_materials', 'Would you like the helper to bring materials?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
    optional: [],
  },
  planting_trees: {
    required: [
      q('planting_trees_tree_count', 'How many trees need planting?', { answerType: 'text' }),
      q('planting_trees_material_owner', 'Do you already have the trees?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
    ],
    optional: [q('planting_trees_reference_photo', 'Would you like to upload a photo of the planting area?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  yard_tidy_up: {
    required: [
      q('yard_tidy_scope', 'What parts of the yard need attention?', { answerType: 'text' }),
      q('yard_tidy_area_size', 'How large is the area?', { answerType: 'text' }),
      q('yard_tidy_task_mix', 'Do you need trimming, sweeping, or waste removal?', { answerType: 'text' }),
    ],
    optional: [],
  },
  hairstyles: {
    required: [
      q('hairstyle_type', 'What type of hairstyle are you looking for?', { answerType: 'text' }),
      q('hairstyle_location_type', 'Will this happen at your place or another location?', {
        answerType: 'enum',
        options: ['my_place', 'another_location'],
      }),
    ],
    optional: [q('hairstyle_reference_photo', 'Would you like to upload a hairstyle reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  braiding: {
    required: [
      q('braiding_style', 'What type of braiding do you want?', { answerType: 'text' }),
      q('braiding_appointment_time', 'How soon do you need the appointment?', { answerType: 'text' }),
    ],
    optional: [q('braiding_reference_photo', 'Would you like to upload a braid reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  makeup: {
    required: [
      q('makeup_occasion', 'What is the occasion for the makeup?', { answerType: 'text' }),
      q('makeup_appointment_time', 'When do you need the appointment?', { answerType: 'text' }),
    ],
    optional: [q('makeup_reference_photo', 'Would you like to upload a makeup reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  lashes: {
    required: [
      q('lash_style', 'What lash style are you looking for?', { answerType: 'text' }),
      q('lash_appointment_time', 'When do you need the appointment?', { answerType: 'text' }),
    ],
    optional: [q('lash_reference_photo', 'Would you like to upload a lash reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  nails: {
    required: [
      q('nail_service_type', 'What type of nail service do you want?', { answerType: 'text' }),
      q('nail_appointment_time', 'When do you need the appointment?', { answerType: 'text' }),
    ],
    optional: [q('nail_reference_photo', 'Would you like to upload a nail reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  manicure: {
    required: [q('manicure_finish_type', 'Do you want a basic manicure or a styled finish?', {
      answerType: 'enum',
      options: ['basic', 'styled'],
    })],
    optional: [q('manicure_reference_photo', 'Would you like to upload a reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  pedicure: {
    required: [q('pedicure_finish_type', 'Do you want a standard pedicure or a styled finish?', {
      answerType: 'enum',
      options: ['standard', 'styled'],
    })],
    optional: [q('pedicure_reference_photo', 'Would you like to upload a reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  waxing_prep: {
    required: [q('waxing_prep_scope', 'What kind of waxing prep do you need?', { answerType: 'text' })],
    optional: [q('waxing_prep_same_visit', 'Is this part of a beauty appointment today?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  haircut: {
    required: [
      q('haircut_type', 'What type of haircut do you want?', { answerType: 'text' }),
      q('haircut_appointment_time', 'When do you need the appointment?', { answerType: 'text' }),
    ],
    optional: [q('haircut_reference_photo', 'Would you like to upload a haircut reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  beard_trim: {
    required: [q('beard_trim_scope', 'Do you want a shape-up or a full beard trim?', {
      answerType: 'enum',
      options: ['shape_up', 'full_trim'],
    })],
    optional: [q('beard_trim_style_notes', 'Any preferred beard style?', { answerType: 'text' })],
  },
  line_up: {
    required: [q('line_up_scope', 'Is this for hairline only or hairline and beard?', {
      answerType: 'enum',
      options: ['hairline_only', 'hairline_and_beard'],
    })],
    optional: [q('line_up_style_notes', 'Any style notes for the barber?', { answerType: 'text' })],
  },
  shave: {
    required: [q('shave_scope', 'Do you want a full shave or a clean-up shave?', {
      answerType: 'enum',
      options: ['full_shave', 'clean_up_shave'],
    })],
    optional: [q('shave_skin_sensitivity', 'Any skin sensitivity the barber should know about?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  hair_dye: {
    required: [
      q('hair_dye_color', 'What hair color do you want?', { answerType: 'text' }),
      q('hair_dye_scope', 'Do you need dye only or dye with cut?', {
        answerType: 'enum',
        options: ['dye_only', 'dye_and_cut'],
      }),
    ],
    optional: [q('hair_dye_reference_photo', 'Would you like to upload a reference photo?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  full_body_massage: {
    required: [
      q('massage_duration_preference', 'Would you like a 60-minute, 90-minute, or 120-minute session?', {
        answerType: 'enum',
        options: ['60_minutes', '90_minutes', '120_minutes'],
      }),
      q('massage_pressure_preference', 'What pressure do you prefer?', {
        answerType: 'enum',
        options: ['gentle', 'medium', 'firm'],
      }),
      q('massage_focus_goal', 'Is this for relaxation, tension relief, or recovery after activity?', {
        answerType: 'enum',
        options: ['relaxation', 'tension_relief', 'post_activity_recovery'],
      }),
    ],
    optional: [q('massage_oil_preference', 'Do you want aromatherapy oils included?', {
      answerType: 'enum',
      options: ['yes', 'no'],
    })],
  },
  back_neck_shoulder_massage: {
    required: [
      q('targeted_massage_duration', 'Would you like a 30-minute, 45-minute, or 60-minute session?', {
        answerType: 'enum',
        options: ['30_minutes', '45_minutes', '60_minutes'],
      }),
      q('targeted_massage_focus_area', 'Is the main focus your back, neck, shoulders, or all three?', {
        answerType: 'enum',
        options: ['back', 'neck', 'shoulders', 'all_three'],
      }),
      q('massage_pressure_preference', 'What pressure do you prefer?', {
        answerType: 'enum',
        options: ['gentle', 'medium', 'firm'],
      }),
    ],
    optional: [q('targeted_massage_pain_notes', 'Any comfort notes the helper should know about?', { answerType: 'text' })],
  },
  foot_rub: {
    required: [
      q('foot_rub_duration', 'Would you like a 20-minute, 30-minute, or 45-minute foot rub?', {
        answerType: 'enum',
        options: ['20_minutes', '30_minutes', '45_minutes'],
      }),
      q('foot_rub_scope', 'Do you want feet only or feet and calves?', {
        answerType: 'enum',
        options: ['feet_only', 'feet_and_calves'],
      }),
      q('foot_rub_pressure_preference', 'What pressure do you prefer?', {
        answerType: 'enum',
        options: ['gentle', 'medium', 'firm'],
      }),
    ],
    optional: [q('foot_rub_soak_addon', 'Would you like a warm soak included if available?', {
      answerType: 'enum',
      options: ['yes', 'no'],
    })],
  },
  hand_arm_massage: {
    required: [
      q('hand_arm_massage_duration', 'Would you like a 20-minute, 30-minute, or 45-minute session?', {
        answerType: 'enum',
        options: ['20_minutes', '30_minutes', '45_minutes'],
      }),
      q('hand_arm_massage_scope', 'Do you want hands only, forearms only, or both?', {
        answerType: 'enum',
        options: ['hands_only', 'forearms_only', 'hands_and_forearms'],
      }),
      q('massage_pressure_preference', 'What pressure do you prefer?', {
        answerType: 'enum',
        options: ['gentle', 'medium', 'firm'],
      }),
    ],
    optional: [q('hand_arm_massage_notes', 'Any comfort or sensitivity notes?', { answerType: 'text' })],
  },
  aromatherapy_massage: {
    required: [
      q('aromatherapy_duration', 'Would you like a 60-minute, 90-minute, or 120-minute session?', {
        answerType: 'enum',
        options: ['60_minutes', '90_minutes', '120_minutes'],
      }),
      q('aromatherapy_goal', 'Is this for relaxation, stress relief, or better sleep support?', {
        answerType: 'enum',
        options: ['relaxation', 'stress_relief', 'sleep_support'],
      }),
      q('aromatherapy_scent_profile', 'Do you prefer floral, citrus, mint, or unscented oils?', {
        answerType: 'enum',
        options: ['floral', 'citrus', 'mint', 'unscented'],
      }),
    ],
    optional: [q('aromatherapy_skin_sensitivity', 'Any skin sensitivity the helper should know about?', {
      answerType: 'enum',
      options: ['yes', 'no'],
    })],
  },
  body_scrub_treatment: {
    required: [
      q('body_scrub_scope', 'Do you want upper body, lower body, or a full body scrub?', {
        answerType: 'enum',
        options: ['upper_body', 'lower_body', 'full_body'],
      }),
      q('body_scrub_texture_preference', 'Do you want a gentle, medium, or exfoliating scrub?', {
        answerType: 'enum',
        options: ['gentle', 'medium', 'exfoliating'],
      }),
      q('body_scrub_finish', 'Should this include moisturising after the treatment?', {
        answerType: 'enum',
        options: ['yes', 'no'],
      }),
    ],
    optional: [q('body_scrub_skin_notes', 'Any skin notes or product preferences?', { answerType: 'text' })],
  },
  babysitting: {
    required: [
      q('babysitting_child_count', 'How many children need care?', { answerType: 'text' }),
      q('babysitting_duration', 'How long do you need the babysitter for?', { answerType: 'text' }),
    ],
    optional: [q('babysitting_routine_notes', 'Any feeding, sleep, or safety instructions?', { answerType: 'text' })],
  },
  pet_sitting: {
    required: [
      q('pet_sitting_pet_type', 'What type of pets need care?', { answerType: 'text' }),
      q('pet_sitting_duration', 'How long do you need the sitter for?', { answerType: 'text' }),
    ],
    optional: [q('pet_sitting_care_notes', 'Any feeding or medication instructions?', { answerType: 'text' })],
  },
  pet_feeding: {
    required: [
      q('pet_feeding_pet_count', 'How many pets need feeding?', { answerType: 'text' }),
      q('pet_feeding_frequency', 'How often should they be fed?', { answerType: 'text' }),
    ],
    optional: [q('pet_feeding_access_notes', 'Any location or access notes?', { answerType: 'text' })],
  },
  house_sitting: {
    required: [
      q('house_sitting_duration', 'How long do you need house sitting for?', { answerType: 'text' }),
      q('house_sitting_property_location', 'Where is the property located?', { answerType: 'text' }),
      q('house_sitting_extra_duties', 'Any pets or extra duties involved?', { answerType: 'text' }),
    ],
    optional: [],
  },
  elder_companionship: {
    required: [
      q('elder_support_duration', 'How long do you need support for?', { answerType: 'text' }),
      q('elder_support_scope', 'Is this companionship only or daily assistance too?', {
        answerType: 'enum',
        options: ['companionship_only', 'companionship_and_assistance'],
      }),
    ],
    optional: [q('elder_support_notes', 'Any special care notes or preferences?', { answerType: 'text' })],
  },
  exterior_wash: {
    required: [
      q('vehicle_type', 'What type of vehicle needs washing?', {
        answerType: 'enum',
        options: ['sedan', 'hatchback', 'suv', 'bakkie', 'van', 'minibus', 'other'],
      }),
      q('service_address_target', 'Where should the helper come?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address'],
      }),
    ],
    optional: [q('vehicle_reference_photo', 'Would you like to upload a picture of the vehicle?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  interior_cleaning: {
    required: [
      q('vehicle_type', 'What type of vehicle needs interior cleaning?', {
        answerType: 'enum',
        options: ['sedan', 'hatchback', 'suv', 'bakkie', 'van', 'minibus', 'other'],
      }),
      q('interior_condition_level', 'How dirty is the interior?', {
        answerType: 'enum',
        options: ['light', 'medium', 'heavy'],
      }),
    ],
    optional: [q('interior_cleaning_focus_notes', 'Any spill or stain areas to focus on?', { answerType: 'text' })],
  },
  seat_cleaning: {
    required: [
      q('seat_cleaning_seat_count', 'How many seats need cleaning?', { answerType: 'text' }),
      q('seat_cleaning_stain_level', 'Are the stains light or heavy?', {
        answerType: 'enum',
        options: ['light', 'heavy'],
      }),
    ],
    optional: [q('seat_cleaning_reference_photos', 'Would you like to upload seat photos?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  full_body_wash: {
    required: [
      q('vehicle_type', 'What type of vehicle needs a full body wash?', {
        answerType: 'enum',
        options: ['sedan', 'hatchback', 'suv', 'bakkie', 'van', 'minibus', 'other'],
      }),
      q('service_address_target', 'Where should the helper come?', {
        answerType: 'enum',
        options: ['current_location', 'saved_home_address', 'another_address'],
      }),
      q('full_body_wash_detailing_addons', 'Do you also want tyre or rim detailing?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
    optional: [],
  },
  engine_cleaning: {
    required: [
      q('vehicle_type', 'What type of vehicle needs engine cleaning?', {
        answerType: 'enum',
        options: ['sedan', 'hatchback', 'suv', 'bakkie', 'van', 'minibus', 'other'],
      }),
      q('engine_cleaning_history', 'Has the engine been cleaned recently?', {
        answerType: 'enum',
        options: ['yes', 'no', 'unknown'],
      }),
    ],
    optional: [q('engine_cleaning_reference_photo', 'Would you like to upload a picture for review?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
  full_detailing: {
    required: [
      q('vehicle_type', 'What type of vehicle needs detailing?', {
        answerType: 'enum',
        options: ['sedan', 'hatchback', 'suv', 'bakkie', 'van', 'minibus', 'other'],
      }),
      q('full_detailing_scope', 'Do you need interior, exterior, or both?', {
        answerType: 'enum',
        options: ['interior_only', 'exterior_only', 'interior_and_exterior'],
      }),
    ],
    optional: [q('full_detailing_reference_photos', 'Would you like to upload photos of the vehicle condition?', { answerType: 'enum', options: ['yes', 'no'] })],
  },
};

const PACKAGE_QUESTION_PLAN = {
  cleaning_home_refresh_package: {
    required: [
      q('timing_preference', 'Do you need this package now or later?', { answerType: 'enum', options: ['now', 'later'] }),
      q('service_address_target', 'Where should the helper come?', { answerType: 'enum', options: ['current_location', 'saved_home_address', 'another_address'] }),
      q('cleaning_scope_level', 'How big is the home refresh job?', { answerType: 'enum', options: ['small', 'standard', 'large', 'deep_clean'] }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', { answerType: 'text' }),
      q('cleaning_materials_source', 'Do you need the helper to bring equipment or materials?', { answerType: 'enum', options: ['bring_all', 'bring_some', 'use_mine'] }),
      q('cleaning_reference_photos', 'Do you want to upload reference photos of the area?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
  },
  yard_maintenance_yard_refresh_package: {
    required: [
      q('timing_preference', 'Do you need this package now or later?', { answerType: 'enum', options: ['now', 'later'] }),
      q('service_address_target', 'Where should the helper come?', { answerType: 'enum', options: ['current_location', 'saved_home_address', 'another_address'] }),
      q('yard_area_size', 'How large is the yard or outdoor area?', { answerType: 'dimension', answerHint: 'You can answer with small, standard, large, or a rough size if you know it.' }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', { answerType: 'text' }),
      q('yard_equipment_source', 'Do you want the helper to bring equipment?', { answerType: 'enum', options: ['bring_equipment', 'use_my_equipment', 'mixed'] }),
      q('yard_reference_photos', 'Do you want to upload photos of the yard?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
  },
  beauty_signature_package: {
    required: [
      q('timing_preference', 'Do you need this package now or later?', { answerType: 'enum', options: ['now', 'later'] }),
      q('service_for_person', 'Is this for you or someone else?', { answerType: 'enum', options: ['self', 'someone_else'] }),
      q('service_address_target', 'Where should the beauty service happen?', { answerType: 'enum', options: ['current_location', 'saved_home_address', 'another_address'] }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', { answerType: 'text' }),
      q('beauty_reference_photo_preference', 'Would you like to upload a reference photo?', { answerType: 'enum', options: ['yes', 'no'] }),
      q('beauty_style_selection_timing', 'Would you prefer to choose the style when the helper arrives?', { answerType: 'enum', options: ['choose_now', 'choose_on_arrival'] }),
    ],
  },
  barber_grooming_package: {
    required: [
      q('timing_preference', 'Do you need this package now or later?', { answerType: 'enum', options: ['now', 'later'] }),
      q('service_for_person', 'Is this for you or someone else?', { answerType: 'enum', options: ['self', 'someone_else'] }),
      q('service_address_target', 'Where should the barber come?', { answerType: 'enum', options: ['current_location', 'saved_home_address', 'another_address'] }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', { answerType: 'text' }),
      q('barber_reference_photo_preference', 'Would you like to upload a haircut reference photo?', { answerType: 'enum', options: ['yes', 'no'] }),
      q('barber_product_scope', 'Should the barber bring products or only tools?', { answerType: 'enum', options: ['tools_only', 'tools_and_products'] }),
    ],
  },
  body_care_relax_package: {
    required: [
      q('timing_preference', 'Do you need this package now or later?', { answerType: 'enum', options: ['now', 'later'] }),
      q('service_for_person', 'Is this for you or someone else?', { answerType: 'enum', options: ['self', 'someone_else'] }),
      q('service_address_target', 'Where should the body care service happen?', { answerType: 'enum', options: ['current_location', 'saved_home_address', 'another_address'] }),
      q('body_care_setup', 'Should the helper bring oils, towels, and treatment items?', { answerType: 'enum', options: ['bring_everything', 'bring_some_items', 'use_mine'] }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', { answerType: 'text' }),
      q('body_care_preference_notes', 'Any pressure, comfort, or scent preferences to share?', { answerType: 'text' }),
      q('body_care_reference_photo_preference', 'Would you like to upload any reference photo or treatment inspiration?', { answerType: 'enum', options: ['yes', 'no'] }),
    ],
  },
  care_family_support_package: {
    required: [
      q('timing_preference', 'Do you need this package now or later?', { answerType: 'enum', options: ['now', 'later'] }),
      q('service_address_target', 'Where should the care happen?', { answerType: 'enum', options: ['current_location', 'saved_home_address', 'another_address', 'helper_location'] }),
      q('care_recipient', 'Who is the service for?', { answerType: 'text' }),
      q('care_duration_needed', 'How long do you need the helper for?', { answerType: 'text' }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', { answerType: 'text' }),
      q('care_safety_notes', 'Would you like to share any safety or preference notes?', { answerType: 'text' }),
      q('care_contact_person', 'Do you want to add a contact person or emergency note?', { answerType: 'text' }),
    ],
  },
  car_wash_premium_package: {
    required: [
      q('timing_preference', 'Do you need this package now or later?', { answerType: 'enum', options: ['now', 'later'] }),
      q('service_address_target', 'Where should the helper come?', { answerType: 'enum', options: ['current_location', 'saved_home_address', 'another_address'] }),
      q('vehicle_type', 'What type of vehicle should be cleaned?', { answerType: 'enum', options: ['sedan', 'hatchback', 'suv', 'bakkie', 'van', 'minibus', 'other'] }),
      q('car_wash_scope', 'Do you need inside, outside, or both?', { answerType: 'enum', options: ['outside_only', 'inside_only', 'inside_and_outside'] }),
    ],
    optional: [
      q('scheduled_for_text', 'If this is for later, what date and time do you want the helper to come?', { answerType: 'text' }),
      q('car_condition_photos', 'Would you like to upload photos of the vehicle condition?', { answerType: 'enum', options: ['yes', 'no'] }),
      q('car_wash_site_utilities', 'Do you have water or electricity available on site?', { answerType: 'enum', options: ['both', 'water_only', 'electricity_only', 'neither'] }),
    ],
  },
};

export function getServiceQuestionPlan(serviceId) {
  return SERVICE_QUESTION_PLAN[serviceId] || PACKAGE_QUESTION_PLAN[serviceId] || { required: [], optional: [] };
}

export function getCategoryQuestionPlan(categoryId) {
  return CATEGORY_QUESTION_PLAN[categoryId] || { required: [], optional: [] };
}

export function buildCustomerIntakeQuestionPlan() {
  return CUSTOMER_SERVICE_CATALOG.reduce((acc, category) => {
    acc[category.id] = {
      categoryLabel: category.label,
      required: getCategoryQuestionPlan(category.id).required,
      optional: getCategoryQuestionPlan(category.id).optional,
      services: category.services.reduce((serviceAcc, service) => {
        serviceAcc[service.id] = {
          serviceLabel: service.label,
          required: getServiceQuestionPlan(service.id).required,
          optional: getServiceQuestionPlan(service.id).optional,
          requiresPortfolioSelection: Boolean(service.requiresPortfolioSelection),
        };
        return serviceAcc;
      }, {}),
      packages: (category.packages || []).reduce((packageAcc, packageItem) => {
        packageAcc[packageItem.id] = {
          packageLabel: packageItem.label,
          includedServiceIds: Array.isArray(packageItem.includedServiceIds) ? packageItem.includedServiceIds : [],
          required: getServiceQuestionPlan(packageItem.id).required,
          optional: getServiceQuestionPlan(packageItem.id).optional,
        };
        return packageAcc;
      }, {}),
    };
    return acc;
  }, {});
}

export function buildCustomerIntakePromptCatalog() {
  return CUSTOMER_SERVICE_CATALOG.map((category) => ({
    id: category.id,
    label: category.label,
    description: category.description,
    services: getCustomerServicesForCategory(category.id).map((service) => ({
      id: service.id,
      label: service.label,
      promptLabel: service.promptLabel,
      requiresPortfolioSelection: Boolean(service.requiresPortfolioSelection),
    })),
    packages: getCustomerPackagesForCategory(category.id).map((service) => ({
      id: service.id,
      label: service.label,
      promptLabel: service.promptLabel,
      includedServiceIds: Array.isArray(service.includedServiceIds) ? service.includedServiceIds : [],
      description: service.description || '',
    })),
  }));
}

export function getSelectedServiceMetadata(serviceIds = []) {
  return serviceIds
    .map((serviceId) => getCustomerServiceById(serviceId))
    .filter(Boolean)
    .map((service) => ({
      id: service.id,
      label: service.label,
      categoryId: service.categoryId,
      requiresPortfolioSelection: Boolean(service.requiresPortfolioSelection),
    }));
}

export function getRequiredQuestionDefinitions({ categoryId = '', serviceIds = [], selectedPackageId = '' } = {}) {
  const categoryRequired = getCategoryQuestionPlan(categoryId).required;
  const seen = new Set(categoryRequired.map((question) => question.id));
  const allRequired = [...categoryRequired];

  if (selectedPackageId) {
    getServiceQuestionPlan(selectedPackageId).required.forEach((question) => {
      if (!seen.has(question.id)) {
        seen.add(question.id);
        allRequired.push(question);
      }
    });
  }

  (serviceIds || []).forEach((serviceId) => {
    getServiceQuestionPlan(serviceId).required.forEach((question) => {
      if (!seen.has(question.id)) {
        seen.add(question.id);
        allRequired.push(question);
      }
    });
  });

  return allRequired;
}

export function getOptionalQuestionDefinitions({ categoryId = '', serviceIds = [], selectedPackageId = '' } = {}) {
  const categoryOptional = getCategoryQuestionPlan(categoryId).optional;
  const seen = new Set(categoryOptional.map((question) => question.id));
  const allOptional = [...categoryOptional];

  if (selectedPackageId) {
    getServiceQuestionPlan(selectedPackageId).optional.forEach((question) => {
      if (!seen.has(question.id)) {
        seen.add(question.id);
        allOptional.push(question);
      }
    });
  }

  (serviceIds || []).forEach((serviceId) => {
    getServiceQuestionPlan(serviceId).optional.forEach((question) => {
      if (!seen.has(question.id)) {
        seen.add(question.id);
        allOptional.push(question);
      }
    });
  });

  return allOptional;
}

export function getQuestionDefinitionById({ categoryId = '', serviceIds = [], selectedPackageId = '', questionId = '' } = {}) {
  const targetId = String(questionId || '').trim();
  if (!targetId) return null;
  return [
    ...getRequiredQuestionDefinitions({ categoryId, serviceIds, selectedPackageId }),
    ...getOptionalQuestionDefinitions({ categoryId, serviceIds, selectedPackageId }),
  ].find((question) => question.id === targetId) || null;
}

export function getNextCustomerIntakeQuestion({ categoryId = '', serviceIds = [], selectedPackageId = '', structuredAnswers = {} } = {}) {
  const missingRequired = buildMissingRequiredFields({ categoryId, serviceIds, selectedPackageId, structuredAnswers });
  const nextQuestionId = missingRequired.find((item) => !['category', 'service'].includes(String(item || '').trim()));
  if (!nextQuestionId) return null;
  return getQuestionDefinitionById({ categoryId, serviceIds, selectedPackageId, questionId: nextQuestionId });
}

export function getQuestionIdsForSelection({ categoryId = '', serviceIds = [], selectedPackageId = '' } = {}) {
  return [
    ...getRequiredQuestionDefinitions({ categoryId, serviceIds, selectedPackageId }),
    ...getOptionalQuestionDefinitions({ categoryId, serviceIds, selectedPackageId }),
  ].map((question) => question.id);
}

export function formatCustomerIntakeOptionLabel(value = '') {
  const normalized = String(value || '').trim();
  const friendlyMap = {
    now: 'Now',
    later: 'Later',
    current_location: 'My current location',
    saved_home_address: 'My saved address',
    another_address: 'Another address',
    helper_location: 'Helper location',
    yes: 'Yes',
    no: 'No',
    self: 'For me',
    someone_else: 'Someone else',
    bring_all: 'Bring everything',
    bring_some: 'Bring some',
    use_mine: 'Use mine',
    bring_equipment: 'Bring equipment',
    use_my_equipment: 'Use my equipment',
    mixed: 'Mixed',
    bring_lawnmower: 'Bring a lawnmower',
    use_my_lawnmower: 'Use my lawnmower',
    choose_now: 'Choose now',
    choose_on_arrival: 'Choose on arrival',
    bring_everything: 'Bring everything',
    bring_some_items: 'Bring some items',
    household: 'Household',
    after_event: 'After an event',
    deep_clean: 'Deep clean',
    standard: 'Standard',
    basic: 'Basic',
    clean_only: 'Clean only',
    clean_and_polish: 'Clean and polish',
    once_off: 'Once off',
    recurring: 'Recurring',
    outside_only: 'Outside only',
    inside_only: 'Inside only',
    inside_and_outside: 'Inside and outside',
    interior_only: 'Interior only',
    exterior_only: 'Exterior only',
    interior_and_exterior: 'Interior and exterior',
    hairline_only: 'Hairline only',
    hairline_and_beard: 'Hairline and beard',
    full_shave: 'Full shave',
    clean_up_shave: 'Clean-up shave',
    shape_up: 'Shape-up',
    full_trim: 'Full trim',
  };

  if (friendlyMap[normalized]) {
    return friendlyMap[normalized];
  }

  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createQuickReply(value, label = '') {
  return {
    value,
    label: label || formatCustomerIntakeOptionLabel(value),
  };
}

function createRangeReplies(values = []) {
  return values.map((entry) => (
    typeof entry === 'string'
      ? createQuickReply(entry)
      : createQuickReply(entry.value, entry.label)
  ));
}

function createCountReplies(counts = []) {
  return counts.map((count) => {
    const value = typeof count === 'number' ? String(count) : String(count?.value || '').trim();
    const label = typeof count === 'number'
      ? String(count)
      : String(count?.label || value).trim();
    return createQuickReply(value, label);
  });
}

export function getCustomerIntakeQuickReplyOptions(question = {}, context = {}) {
  const questionId = String(question?.id || '').trim().toLowerCase();
  const prompt = String(question?.prompt || '').trim().toLowerCase();
  const answerType = String(question?.answerType || 'text').trim().toLowerCase();
  const categoryId = String(context?.categoryId || '').trim().toLowerCase();

  if (!questionId && !prompt) {
    return [];
  }

  if (answerType === 'enum' && Array.isArray(question?.options) && question.options.length) {
    return question.options.map((option) => createQuickReply(option));
  }

  if (questionId.includes('timing_preference') || prompt.includes('now or later')) {
    return createRangeReplies([
      'now',
      'later',
    ]);
  }

  if (
    questionId.includes('service_address_target')
    || prompt.includes('where should the helper come')
    || prompt.includes('where should the service happen')
  ) {
    return createRangeReplies([
      'current_location',
      'saved_home_address',
      'another_address',
      'helper_location',
    ]);
  }

  if (questionId.includes('service_for_person')) {
    return createRangeReplies(['self', 'someone_else']);
  }

  if (
    questionId.includes('yard_area_size')
    || (answerType === 'dimension' && (prompt.includes('how large') || prompt.includes('how big')))
  ) {
    return createQuickReplyOptionsFromLabels([
      ['small yard', 'Small yard'],
      ['standard yard', 'Standard yard'],
      ['large yard', 'Large yard'],
      ['extra large yard', 'Extra large yard'],
    ]);
  }

  if (
    questionId.includes('room_count')
    || questionId.includes('bathroom_count')
    || questionId.includes('seat_count')
    || questionId.includes('tree_count')
    || questionId.includes('guest_count')
    || questionId.includes('child_count')
    || questionId.includes('pet_count')
    || questionId.includes('item_count')
    || questionId.includes('load_count')
    || questionId.includes('vehicle_count')
  ) {
    return createCountReplies([
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4+', label: '4+' },
    ]);
  }

  if (questionId.includes('duration') || prompt.includes('how long')) {
    return createQuickReplyOptionsFromLabels([
      ['2 hours', '2 hours'],
      ['4 hours', '4 hours'],
      ['half day', 'Half day'],
      ['full day', 'Full day'],
    ]);
  }

  if (questionId.includes('yard_equipment_source')) {
    return createRangeReplies([
      'bring_equipment',
      'use_my_equipment',
      'mixed',
    ]);
  }

  if (questionId.includes('vehicle_type')) {
    return createRangeReplies([
      'sedan',
      'hatchback',
      'suv',
      'bakkie',
      'van',
      'minibus',
      'other',
    ]);
  }

  if (questionId.includes('style') || questionId.includes('look') || questionId.includes('type')) {
    if (categoryId === 'beauty') {
      if (questionId.includes('hairstyle') || questionId.includes('braiding')) {
        return createQuickReplyOptionsFromLabels([
          ['braids', 'Braids'],
          ['twists', 'Twists'],
          ['cornrows', 'Cornrows'],
          ['ponytail', 'Ponytail'],
          ['not_sure_yet', 'Not sure yet'],
        ]);
      }
      if (questionId.includes('lash')) {
        return createQuickReplyOptionsFromLabels([
          ['classic', 'Classic'],
          ['hybrid', 'Hybrid'],
          ['volume', 'Volume'],
          ['not_sure_yet', 'Not sure yet'],
        ]);
      }
      if (questionId.includes('nail')) {
        return createQuickReplyOptionsFromLabels([
          ['simple', 'Simple'],
          ['styled', 'Styled'],
          ['gel', 'Gel'],
          ['acrylic', 'Acrylic'],
        ]);
      }
      if (questionId.includes('makeup')) {
        return createQuickReplyOptionsFromLabels([
          ['natural', 'Natural'],
          ['glam', 'Glam'],
          ['bridal', 'Bridal'],
          ['not_sure_yet', 'Not sure yet'],
        ]);
      }
    }

    if (categoryId === 'barber') {
      return createQuickReplyOptionsFromLabels([
        ['fade', 'Fade'],
        ['trim', 'Trim'],
        ['shape_up', 'Shape-up'],
        ['full_trim', 'Full trim'],
      ]);
    }
  }

  if (questionId.includes('size') || questionId.includes('level') || questionId.includes('scope')) {
    return createQuickReplyOptionsFromLabels([
      ['small', 'Small'],
      ['standard', 'Standard'],
      ['large', 'Large'],
      ['deep_clean', 'Deep clean'],
    ]);
  }

  return createQuickReplyOptionsFromLabels([
    ['not_sure_yet', 'Not sure yet'],
    ['let_ai_help', 'Let AI help'],
    ['i_will_type_it', 'I will type it'],
  ]);
}

function createQuickReplyOptionsFromLabels(entries = []) {
  return entries.map(([value, label]) => createQuickReply(value, label));
}

export function buildMissingRequiredFields({ categoryId = '', serviceIds = [], selectedPackageId = '', structuredAnswers = {} } = {}) {
  const missing = [];
  if (!categoryId) missing.push('category');
  if (!Array.isArray(serviceIds) || !serviceIds.length) missing.push('service');
  if (missing.length) return missing;

  const requiredQuestions = getRequiredQuestionDefinitions({ categoryId, serviceIds, selectedPackageId });
  requiredQuestions.forEach((question) => {
    const answerValue = normalizeAnswerValue(structuredAnswers?.[question.id]);
    if (!hasAnswerValue(answerValue)) {
      missing.push(question.id);
    }
  });

  if (String(structuredAnswers?.timing_preference || '').trim().toLowerCase() === 'later') {
    const scheduledForValue = normalizeAnswerValue(structuredAnswers?.scheduled_for_text);
    if (!hasAnswerValue(scheduledForValue)) {
      missing.push('scheduled_for_text');
    }
  }

  return missing;
}
