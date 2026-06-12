import { CUSTOMER_SERVICE_CATALOG, getCustomerServiceById, getCustomerServicesForCategory } from './serviceCatalog';

const CATEGORY_QUESTION_PLAN = {
  cleaning: {
    required: [
      'Which cleaning service do you need?',
      'Do you need this help now or later?',
      'Where should the helper come?',
      'How much cleaning work is involved?',
    ],
    optional: [
      'Do you need the helper to bring equipment or materials?',
      'Do you want to upload reference photos of the area?',
    ],
  },
  yard_maintenance: {
    required: [
      'Which yard maintenance service do you need?',
      'Do you need this help now or later?',
      'Where should the helper come?',
      'How large is the yard or outdoor area?',
      'Do you want the helper to bring equipment?',
    ],
    optional: [
      'Do you want to upload photos of the yard?',
      'Is electricity or water available on site?',
    ],
  },
  beauty: {
    required: [
      'Which beauty service do you need?',
      'Do you need this help now or later?',
      'Is this for you or someone else?',
      'Where should the beauty service happen?',
    ],
    optional: [
      'Would you like to upload a reference photo?',
      'Would you prefer to choose the style when the helper arrives?',
    ],
  },
  barber: {
    required: [
      'Which barber service do you need?',
      'Do you need this help now or later?',
      'Is this for you or someone else?',
      'Where should the barber come?',
    ],
    optional: [
      'Would you like to upload a haircut reference photo?',
      'Should the barber bring products or only tools?',
    ],
  },
  care: {
    required: [
      'Which care service do you need?',
      'Do you need this help now or later?',
      'Where should the care happen?',
      'Who is the service for?',
      'How long do you need the helper for?',
    ],
    optional: [
      'Would you like to share any safety or preference notes?',
      'Do you want to add a contact person or emergency note?',
    ],
  },
  car_wash: {
    required: [
      'Which car wash service do you need?',
      'Do you need this help now or later?',
      'Where should the helper come?',
      'What type of vehicle should be cleaned?',
      'Do you need inside, outside, or both?',
    ],
    optional: [
      'Would you like to upload photos of the vehicle condition?',
      'Do you have water or electricity available on site?',
    ],
  },
};

const SERVICE_QUESTION_PLAN = {
  dishwashing: {
    required: ['Is this normal household dishwashing or after an event?', 'About how many dishes or people is this for?'],
    optional: ['Do you also need kitchen cleaning?'],
  },
  house_cleaning: {
    required: ['How many rooms or areas need cleaning?', 'Do you need deep cleaning or standard cleaning?'],
    optional: ['Should the helper bring supplies?'],
  },
  room_cleaning: {
    required: ['How many rooms need cleaning?'],
    optional: ['Any specific room instructions?'],
  },
  kitchen_cleaning: {
    required: ['Is this a basic clean or deep clean?', 'Do you also need dishes washed?'],
    optional: ['Are there appliances that need special attention?'],
  },
  bathroom_cleaning: {
    required: ['How many bathrooms need cleaning?'],
    optional: ['Do you need stain or mold treatment?'],
  },
  floor_cleaning: {
    required: ['What type of floors need cleaning?', 'How many rooms or how large is the area?'],
    optional: ['Do you need polishing or only cleaning?'],
  },
  event_cleanup: {
    required: ['How many guests or how large was the event?', 'What areas need to be cleaned?'],
    optional: ['Do you need dishwashing or waste removal too?'],
  },
  laundry: {
    required: ['How many loads or how many people is the laundry for?', 'Do you need wash only or wash and fold?'],
    optional: ['Do you also need ironing or stain treatment?'],
  },
  ironing: {
    required: ['How many clothing items need ironing?'],
    optional: ['Are any items delicate or formal wear?'],
  },
  folding: {
    required: ['About how many items need folding?'],
    optional: ['Should items be sorted in a certain way?'],
  },
  stain_treatment: {
    required: ['What type of items have stains?', 'How many items need stain treatment?'],
    optional: ['Do you know what caused the stains?'],
  },
  grass_cutting: {
    required: ['How big is the yard?', 'Should the helper bring a lawnmower?'],
    optional: ['Is electricity available if needed?'],
  },
  gardening: {
    required: ['What gardening work do you need done?', 'How large is the garden area?'],
    optional: ['Should the helper bring tools and gloves?'],
  },
  landscaping: {
    required: ['What landscaping result are you looking for?', 'How large is the outdoor area?'],
    optional: ['Would you like to upload a photo of the yard?'],
  },
  tree_trimming: {
    required: ['How many trees need trimming?', 'How tall are the trees?'],
    optional: ['Would you like to upload a photo of the trees?'],
  },
  tree_cutting: {
    required: ['How many trees need cutting?', 'How large or tall are the trees?'],
    optional: ['Would you like to upload a photo for safety review?'],
  },
  hedge_trimming: {
    required: ['How long are the hedges that need trimming?'],
    optional: ['Do you need waste removed afterwards?'],
  },
  weeding: {
    required: ['How large is the area that needs weeding?'],
    optional: ['Is this a one-time job or recurring?'],
  },
  planting_flowers: {
    required: ['How many flower beds or areas need planting?', 'Do you already have the flowers?'],
    optional: ['Would you like the helper to bring materials?'],
  },
  planting_trees: {
    required: ['How many trees need planting?', 'Do you already have the trees?'],
    optional: ['Would you like to upload a photo of the planting area?'],
  },
  yard_tidy_up: {
    required: ['What parts of the yard need attention?', 'How large is the area?'],
    optional: ['Do you need trimming, sweeping, or waste removal?'],
  },
  hairstyles: {
    required: ['What type of hairstyle are you looking for?', 'Will this happen at your place or another location?'],
    optional: ['Would you like to upload a hairstyle reference photo?'],
  },
  braiding: {
    required: ['What type of braiding do you want?', 'How soon do you need the appointment?'],
    optional: ['Would you like to upload a braid reference photo?'],
  },
  makeup: {
    required: ['What is the occasion for the makeup?', 'When do you need the appointment?'],
    optional: ['Would you like to upload a makeup reference photo?'],
  },
  lashes: {
    required: ['What lash style are you looking for?', 'When do you need the appointment?'],
    optional: ['Would you like to upload a lash reference photo?'],
  },
  nails: {
    required: ['What type of nail service do you want?', 'When do you need the appointment?'],
    optional: ['Would you like to upload a nail reference photo?'],
  },
  manicure: {
    required: ['Do you want a basic manicure or a styled finish?'],
    optional: ['Would you like to upload a reference photo?'],
  },
  pedicure: {
    required: ['Do you want a standard pedicure or a styled finish?'],
    optional: ['Would you like to upload a reference photo?'],
  },
  waxing_prep: {
    required: ['What kind of waxing prep do you need?'],
    optional: ['Is this part of a beauty appointment today?'],
  },
  haircut: {
    required: ['What type of haircut do you want?', 'When do you need the appointment?'],
    optional: ['Would you like to upload a haircut reference photo?'],
  },
  beard_trim: {
    required: ['Do you want a shape-up or a full beard trim?'],
    optional: ['Any preferred beard style?'],
  },
  line_up: {
    required: ['Is this for hairline only or hairline and beard?'],
    optional: ['Any style notes for the barber?'],
  },
  shave: {
    required: ['Do you want a full shave or a clean-up shave?'],
    optional: ['Any skin sensitivity the barber should know about?'],
  },
  hair_dye: {
    required: ['What hair color do you want?', 'Do you need dye only or dye with cut?'],
    optional: ['Would you like to upload a reference photo?'],
  },
  babysitting: {
    required: ['How many children need care?', 'How long do you need the babysitter for?'],
    optional: ['Any feeding, sleep, or safety instructions?'],
  },
  pet_sitting: {
    required: ['What type of pets need care?', 'How long do you need the sitter for?'],
    optional: ['Any feeding or medication instructions?'],
  },
  pet_feeding: {
    required: ['How many pets need feeding?', 'How often should they be fed?'],
    optional: ['Any location or access notes?'],
  },
  house_sitting: {
    required: ['How long do you need house sitting for?', 'Where is the property located?'],
    optional: ['Any pets or extra duties involved?'],
  },
  elder_companionship: {
    required: ['How long do you need support for?', 'Is this companionship only or daily assistance too?'],
    optional: ['Any special care notes or preferences?'],
  },
  exterior_wash: {
    required: ['What type of vehicle needs washing?', 'Where should the helper come?'],
    optional: ['Would you like to upload a picture of the vehicle?'],
  },
  interior_cleaning: {
    required: ['What type of vehicle needs interior cleaning?', 'How dirty is the interior?'],
    optional: ['Any spill or stain areas to focus on?'],
  },
  seat_cleaning: {
    required: ['How many seats need cleaning?', 'Are the stains light or heavy?'],
    optional: ['Would you like to upload seat photos?'],
  },
  full_body_wash: {
    required: ['What type of vehicle needs a full body wash?', 'Where should the helper come?'],
    optional: ['Do you also want tyre or rim detailing?'],
  },
  engine_cleaning: {
    required: ['What type of vehicle needs engine cleaning?', 'Has the engine been cleaned recently?'],
    optional: ['Would you like to upload a picture for review?'],
  },
  full_detailing: {
    required: ['What type of vehicle needs detailing?', 'Do you need interior, exterior, or both?'],
    optional: ['Would you like to upload photos of the vehicle condition?'],
  },
};

export function getServiceQuestionPlan(serviceId) {
  return SERVICE_QUESTION_PLAN[serviceId] || { required: [], optional: [] };
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
