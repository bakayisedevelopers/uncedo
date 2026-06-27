const CATEGORY_LOOKUP = {
  cleaning: {
    id: 'cleaning',
    label: 'Cleaning',
    description: 'Home and event cleaning support, including dishwashing and laundry tasks.',
    pricingEngineId: 'cleaning',
  },
  yard_maintenance: {
    id: 'yard_maintenance',
    label: 'Yard Maintenance',
    description: 'Outdoor upkeep, landscaping, trimming, and garden presentation work.',
    pricingEngineId: 'yard_maintenance',
  },
  beauty: {
    id: 'beauty',
    label: 'Beauty',
    description: 'At-home beauty bookings for nails, makeup, lashes, and hairstyles.',
    pricingEngineId: 'beauty',
  },
  barber: {
    id: 'barber',
    label: 'Barber',
    description: 'Haircuts, trims, shaving, and grooming-focused barber services.',
    pricingEngineId: 'barber',
  },
  body_care: {
    id: 'body_care',
    label: 'Body Care',
    description: 'Non-medical massages, relaxation treatments, foot rubs, and body-care support.',
    pricingEngineId: 'body_care',
  },
  care: {
    id: 'care',
    label: 'Care',
    description: 'Sensitive support services such as babysitting, pet care, and house sitting.',
    pricingEngineId: 'care',
  },
  car_wash: {
    id: 'car_wash',
    label: 'Car Wash',
    description: 'Vehicle washing, interior cleaning, detailing, and engine-care support.',
    pricingEngineId: 'car_wash',
  },
};

const SERVICE_DEFINITIONS = [
  { id: 'dishwashing', categoryId: 'cleaning', label: 'Dishwashing', promptLabel: 'I need dishes washed', pricing: { pricingMode: 'time_based', minimumCallout: 90, basePrice: 90, hourlyRate: 75, durationMinutes: 75, complexityMultiplier: 1.0 } },
  { id: 'house_cleaning', categoryId: 'cleaning', label: 'House cleaning', promptLabel: 'I need house cleaning', pricing: { pricingMode: 'time_based', minimumCallout: 120, basePrice: 120, hourlyRate: 85, durationMinutes: 120, complexityMultiplier: 1.05 } },
  { id: 'room_cleaning', categoryId: 'cleaning', label: 'Room cleaning', promptLabel: 'I need a room cleaned', pricing: { pricingMode: 'time_based', minimumCallout: 105, basePrice: 105, hourlyRate: 80, durationMinutes: 90, complexityMultiplier: 1.0 } },
  { id: 'kitchen_cleaning', categoryId: 'cleaning', label: 'Kitchen cleaning', promptLabel: 'I need my kitchen cleaned', pricing: { pricingMode: 'time_based', minimumCallout: 115, basePrice: 115, hourlyRate: 85, durationMinutes: 105, complexityMultiplier: 1.08 } },
  { id: 'bathroom_cleaning', categoryId: 'cleaning', label: 'Bathroom cleaning', promptLabel: 'I need my bathroom cleaned', pricing: { pricingMode: 'time_based', minimumCallout: 110, basePrice: 110, hourlyRate: 82, durationMinutes: 90, complexityMultiplier: 1.08 } },
  { id: 'floor_cleaning', categoryId: 'cleaning', label: 'Floor cleaning', promptLabel: 'I need my floors cleaned', pricing: { pricingMode: 'time_based', minimumCallout: 100, basePrice: 100, hourlyRate: 78, durationMinutes: 75, complexityMultiplier: 1.0 } },
  { id: 'event_cleanup', categoryId: 'cleaning', label: 'Event cleanup', promptLabel: 'I need event cleanup', pricing: { pricingMode: 'time_based', minimumCallout: 180, basePrice: 180, hourlyRate: 110, durationMinutes: 180, complexityMultiplier: 1.2 } },
  { id: 'laundry', categoryId: 'cleaning', label: 'Laundry', promptLabel: 'I need laundry done', pricing: { pricingMode: 'time_based', minimumCallout: 95, basePrice: 95, hourlyRate: 80, durationMinutes: 90, complexityMultiplier: 1.0 } },
  { id: 'ironing', categoryId: 'cleaning', label: 'Ironing', promptLabel: 'I need ironing done', pricing: { pricingMode: 'time_based', minimumCallout: 90, basePrice: 90, hourlyRate: 78, durationMinutes: 60, complexityMultiplier: 1.0 } },
  { id: 'folding', categoryId: 'cleaning', label: 'Folding', promptLabel: 'I need clothes folded', pricing: { pricingMode: 'fixed', minimumCallout: 75, basePrice: 75, hourlyRate: 0, durationMinutes: 45, complexityMultiplier: 1.0 } },
  { id: 'stain_treatment', categoryId: 'cleaning', label: 'Stain treatment', promptLabel: 'I need stain treatment', pricing: { pricingMode: 'fixed', minimumCallout: 85, basePrice: 85, hourlyRate: 0, durationMinutes: 40, complexityMultiplier: 1.12 } },
  { id: 'grass_cutting', categoryId: 'yard_maintenance', label: 'Grass cutting', promptLabel: 'I need grass cutting', pricing: { pricingMode: 'time_based', minimumCallout: 140, basePrice: 140, hourlyRate: 100, durationMinutes: 120, complexityMultiplier: 1.0 } },
  { id: 'gardening', categoryId: 'yard_maintenance', label: 'Gardening', promptLabel: 'I need gardening help', pricing: { pricingMode: 'time_based', minimumCallout: 140, basePrice: 140, hourlyRate: 100, durationMinutes: 120, complexityMultiplier: 1.0 } },
  { id: 'landscaping', categoryId: 'yard_maintenance', label: 'Landscaping', promptLabel: 'I need landscaping', pricing: { pricingMode: 'time_based', minimumCallout: 220, basePrice: 220, hourlyRate: 145, durationMinutes: 180, complexityMultiplier: 1.22 } },
  { id: 'tree_trimming', categoryId: 'yard_maintenance', label: 'Tree trimming', promptLabel: 'I need tree trimming', pricing: { pricingMode: 'time_based', minimumCallout: 210, basePrice: 210, hourlyRate: 135, durationMinutes: 150, complexityMultiplier: 1.18 } },
  { id: 'tree_cutting', categoryId: 'yard_maintenance', label: 'Tree cutting', promptLabel: 'I need a tree cut down', pricing: { pricingMode: 'time_based', minimumCallout: 260, basePrice: 260, hourlyRate: 160, durationMinutes: 180, complexityMultiplier: 1.3 } },
  { id: 'hedge_trimming', categoryId: 'yard_maintenance', label: 'Hedge trimming', promptLabel: 'I need hedge trimming', pricing: { pricingMode: 'time_based', minimumCallout: 160, basePrice: 160, hourlyRate: 108, durationMinutes: 105, complexityMultiplier: 1.05 } },
  { id: 'weeding', categoryId: 'yard_maintenance', label: 'Weeding', promptLabel: 'I need weeding done', pricing: { pricingMode: 'time_based', minimumCallout: 130, basePrice: 130, hourlyRate: 95, durationMinutes: 90, complexityMultiplier: 1.0 } },
  { id: 'planting_flowers', categoryId: 'yard_maintenance', label: 'Planting flowers', promptLabel: 'I need flowers planted', pricing: { pricingMode: 'time_based', minimumCallout: 140, basePrice: 140, hourlyRate: 98, durationMinutes: 90, complexityMultiplier: 1.04 } },
  { id: 'planting_trees', categoryId: 'yard_maintenance', label: 'Planting trees', promptLabel: 'I need trees planted', pricing: { pricingMode: 'time_based', minimumCallout: 190, basePrice: 190, hourlyRate: 128, durationMinutes: 150, complexityMultiplier: 1.15 } },
  { id: 'yard_tidy_up', categoryId: 'yard_maintenance', label: 'Yard tidy-up', promptLabel: 'I need my yard cleaned', pricing: { pricingMode: 'time_based', minimumCallout: 145, basePrice: 145, hourlyRate: 102, durationMinutes: 100, complexityMultiplier: 1.02 } },
  { id: 'hairstyles', categoryId: 'beauty', label: 'Hairstyles', promptLabel: 'I need a hairstyle', requiresPortfolioSelection: true, pricing: { pricingMode: 'time_based', minimumCallout: 220, basePrice: 220, hourlyRate: 140, durationMinutes: 150, complexityMultiplier: 1.12 } },
  { id: 'braiding', categoryId: 'beauty', label: 'Braiding', promptLabel: 'I need braiding', requiresPortfolioSelection: true, pricing: { pricingMode: 'time_based', minimumCallout: 240, basePrice: 240, hourlyRate: 145, durationMinutes: 180, complexityMultiplier: 1.16 } },
  { id: 'makeup', categoryId: 'beauty', label: 'Makeup', promptLabel: 'I need makeup', requiresPortfolioSelection: true, pricing: { pricingMode: 'fixed', minimumCallout: 180, basePrice: 180, hourlyRate: 0, durationMinutes: 75, complexityMultiplier: 1.08 } },
  { id: 'lashes', categoryId: 'beauty', label: 'Lashes', promptLabel: 'I need lashes', requiresPortfolioSelection: true, pricing: { pricingMode: 'fixed', minimumCallout: 190, basePrice: 190, hourlyRate: 0, durationMinutes: 90, complexityMultiplier: 1.05 } },
  { id: 'nails', categoryId: 'beauty', label: 'Nails', promptLabel: 'I want my nails done', requiresPortfolioSelection: true, pricing: { pricingMode: 'fixed', minimumCallout: 170, basePrice: 170, hourlyRate: 0, durationMinutes: 90, complexityMultiplier: 1.08 } },
  { id: 'manicure', categoryId: 'beauty', label: 'Manicure', promptLabel: 'I need a manicure', requiresPortfolioSelection: true, pricing: { pricingMode: 'fixed', minimumCallout: 150, basePrice: 150, hourlyRate: 0, durationMinutes: 60, complexityMultiplier: 1.02 } },
  { id: 'pedicure', categoryId: 'beauty', label: 'Pedicure', promptLabel: 'I need a pedicure', requiresPortfolioSelection: true, pricing: { pricingMode: 'fixed', minimumCallout: 155, basePrice: 155, hourlyRate: 0, durationMinutes: 60, complexityMultiplier: 1.03 } },
  { id: 'waxing_prep', categoryId: 'beauty', label: 'Waxing prep', promptLabel: 'I need waxing prep', pricing: { pricingMode: 'fixed', minimumCallout: 145, basePrice: 145, hourlyRate: 0, durationMinutes: 50, complexityMultiplier: 1.0 } },
  { id: 'haircut', categoryId: 'barber', label: 'Haircut', promptLabel: 'I need a haircut', pricing: { pricingMode: 'fixed', minimumCallout: 120, basePrice: 120, hourlyRate: 0, durationMinutes: 45, complexityMultiplier: 1.0 } },
  { id: 'beard_trim', categoryId: 'barber', label: 'Beard trim', promptLabel: 'I need a beard trim', pricing: { pricingMode: 'fixed', minimumCallout: 95, basePrice: 95, hourlyRate: 0, durationMinutes: 30, complexityMultiplier: 1.0 } },
  { id: 'line_up', categoryId: 'barber', label: 'Line-up', promptLabel: 'I need a line-up', pricing: { pricingMode: 'fixed', minimumCallout: 90, basePrice: 90, hourlyRate: 0, durationMinutes: 25, complexityMultiplier: 1.0 } },
  { id: 'shave', categoryId: 'barber', label: 'Shave', promptLabel: 'I need a shave', pricing: { pricingMode: 'fixed', minimumCallout: 95, basePrice: 95, hourlyRate: 0, durationMinutes: 30, complexityMultiplier: 1.0 } },
  { id: 'hair_dye', categoryId: 'barber', label: 'Hair dye', promptLabel: 'I need my hair dyed', pricing: { pricingMode: 'fixed', minimumCallout: 150, basePrice: 150, hourlyRate: 0, durationMinutes: 60, complexityMultiplier: 1.1 } },
  { id: 'full_body_massage', categoryId: 'body_care', label: 'Full body massage', promptLabel: 'I need a full body massage', pricing: { pricingMode: 'fixed', minimumCallout: 320, basePrice: 320, hourlyRate: 0, durationMinutes: 75, complexityMultiplier: 1.08 } },
  { id: 'back_neck_shoulder_massage', categoryId: 'body_care', label: 'Back, neck, and shoulder massage', promptLabel: 'I need a back, neck, and shoulder massage', pricing: { pricingMode: 'fixed', minimumCallout: 240, basePrice: 240, hourlyRate: 0, durationMinutes: 45, complexityMultiplier: 1.04 } },
  { id: 'foot_rub', categoryId: 'body_care', label: 'Foot rub', promptLabel: 'I need a foot rub', pricing: { pricingMode: 'fixed', minimumCallout: 180, basePrice: 180, hourlyRate: 0, durationMinutes: 30, complexityMultiplier: 1.0 } },
  { id: 'hand_arm_massage', categoryId: 'body_care', label: 'Hand and arm massage', promptLabel: 'I need a hand and arm massage', pricing: { pricingMode: 'fixed', minimumCallout: 190, basePrice: 190, hourlyRate: 0, durationMinutes: 35, complexityMultiplier: 1.0 } },
  { id: 'aromatherapy_massage', categoryId: 'body_care', label: 'Aromatherapy massage', promptLabel: 'I need an aromatherapy massage', pricing: { pricingMode: 'fixed', minimumCallout: 280, basePrice: 280, hourlyRate: 0, durationMinutes: 60, complexityMultiplier: 1.06 } },
  { id: 'body_scrub_treatment', categoryId: 'body_care', label: 'Body scrub treatment', promptLabel: 'I need a body scrub treatment', pricing: { pricingMode: 'fixed', minimumCallout: 260, basePrice: 260, hourlyRate: 0, durationMinutes: 55, complexityMultiplier: 1.04 } },
  { id: 'babysitting', categoryId: 'care', label: 'Babysitting', promptLabel: 'I need babysitting', sensitive: true, pricing: { pricingMode: 'time_based', minimumCallout: 180, basePrice: 180, hourlyRate: 115, durationMinutes: 180, complexityMultiplier: 1.15 } },
  { id: 'pet_sitting', categoryId: 'care', label: 'Pet sitting', promptLabel: 'I need pet sitting', sensitive: true, pricing: { pricingMode: 'time_based', minimumCallout: 150, basePrice: 150, hourlyRate: 95, durationMinutes: 120, complexityMultiplier: 1.05 } },
  { id: 'pet_feeding', categoryId: 'care', label: 'Pet feeding', promptLabel: 'I need someone to feed my pets', sensitive: true, pricing: { pricingMode: 'fixed', minimumCallout: 90, basePrice: 90, hourlyRate: 0, durationMinutes: 30, complexityMultiplier: 1.0 } },
  { id: 'house_sitting', categoryId: 'care', label: 'House sitting', promptLabel: 'I need house sitting', sensitive: true, pricing: { pricingMode: 'time_based', minimumCallout: 220, basePrice: 220, hourlyRate: 125, durationMinutes: 240, complexityMultiplier: 1.12 } },
  { id: 'elder_companionship', categoryId: 'care', label: 'Elder companionship', promptLabel: 'I need elder care support', sensitive: true, pricing: { pricingMode: 'time_based', minimumCallout: 220, basePrice: 220, hourlyRate: 130, durationMinutes: 240, complexityMultiplier: 1.15 } },
  { id: 'exterior_wash', categoryId: 'car_wash', label: 'Exterior wash', promptLabel: 'I need a car wash', pricing: { pricingMode: 'fixed', minimumCallout: 130, basePrice: 130, hourlyRate: 0, durationMinutes: 45, complexityMultiplier: 1.0 } },
  { id: 'interior_cleaning', categoryId: 'car_wash', label: 'Interior cleaning', promptLabel: 'I need my car interior cleaned', pricing: { pricingMode: 'fixed', minimumCallout: 150, basePrice: 150, hourlyRate: 0, durationMinutes: 60, complexityMultiplier: 1.04 } },
  { id: 'seat_cleaning', categoryId: 'car_wash', label: 'Seat cleaning', promptLabel: 'I need my car seats cleaned', pricing: { pricingMode: 'fixed', minimumCallout: 145, basePrice: 145, hourlyRate: 0, durationMinutes: 55, complexityMultiplier: 1.05 } },
  { id: 'full_body_wash', categoryId: 'car_wash', label: 'Full body wash', promptLabel: 'I need a full body car wash', pricing: { pricingMode: 'fixed', minimumCallout: 160, basePrice: 160, hourlyRate: 0, durationMinutes: 65, complexityMultiplier: 1.06 } },
  { id: 'engine_cleaning', categoryId: 'car_wash', label: 'Engine cleaning', promptLabel: 'I need engine cleaning', pricing: { pricingMode: 'fixed', minimumCallout: 180, basePrice: 180, hourlyRate: 0, durationMinutes: 75, complexityMultiplier: 1.08 } },
  { id: 'full_detailing', categoryId: 'car_wash', label: 'Full detailing', promptLabel: 'I need full car detailing', pricing: { pricingMode: 'time_based', minimumCallout: 260, basePrice: 260, hourlyRate: 145, durationMinutes: 180, complexityMultiplier: 1.2 } },
];

const PACKAGE_DEFINITIONS = [
  {
    id: 'cleaning_home_refresh_package',
    kind: 'package',
    categoryId: 'cleaning',
    label: 'Home refresh package',
    promptLabel: 'I want the home refresh package',
    description: 'A bundled home-cleaning option for common rooms, floors, and finishing tasks.',
    includedServiceIds: ['house_cleaning', 'room_cleaning', 'bathroom_cleaning', 'floor_cleaning'],
    pricing: { pricingMode: 'fixed', minimumCallout: 320, basePrice: 320, hourlyRate: 0, durationMinutes: 180, complexityMultiplier: 1.0 },
    packageQuestions: ['timing_preference', 'service_address_target', 'cleaning_scope_level', 'cleaning_materials_source'],
  },
  {
    id: 'yard_maintenance_yard_refresh_package',
    kind: 'package',
    categoryId: 'yard_maintenance',
    label: 'Yard refresh package',
    promptLabel: 'I want the yard refresh package',
    description: 'A bundled yard-care option for cutting, tidying, and light upkeep.',
    includedServiceIds: ['grass_cutting', 'yard_tidy_up', 'weeding'],
    pricing: { pricingMode: 'fixed', minimumCallout: 420, basePrice: 420, hourlyRate: 0, durationMinutes: 240, complexityMultiplier: 1.0 },
    packageQuestions: ['timing_preference', 'service_address_target', 'yard_area_size', 'yard_equipment_source'],
  },
  {
    id: 'beauty_signature_package',
    kind: 'package',
    categoryId: 'beauty',
    label: 'Signature beauty package',
    promptLabel: 'I want the signature beauty package',
    description: 'A bundled beauty option that covers a full look with a simplified booking flow.',
    includedServiceIds: ['makeup', 'lashes', 'nails', 'hairstyles'],
    pricing: { pricingMode: 'fixed', minimumCallout: 850, basePrice: 850, hourlyRate: 0, durationMinutes: 240, complexityMultiplier: 1.0 },
    packageQuestions: ['timing_preference', 'service_for_person', 'service_address_target', 'beauty_reference_photo_preference'],
  },
  {
    id: 'barber_grooming_package',
    kind: 'package',
    categoryId: 'barber',
    label: 'Grooming package',
    promptLabel: 'I want the grooming package',
    description: 'A bundled barber option for haircut, line-up, and beard finishing.',
    includedServiceIds: ['haircut', 'line_up', 'beard_trim', 'shave'],
    pricing: { pricingMode: 'fixed', minimumCallout: 250, basePrice: 250, hourlyRate: 0, durationMinutes: 120, complexityMultiplier: 1.0 },
    packageQuestions: ['timing_preference', 'service_for_person', 'service_address_target', 'barber_reference_photo_preference'],
  },
  {
    id: 'body_care_relax_package',
    kind: 'package',
    categoryId: 'body_care',
    label: 'Relax package',
    promptLabel: 'I want the relax package',
    description: 'A bundled body-care option for the most common relaxation requests.',
    includedServiceIds: ['full_body_massage', 'foot_rub', 'aromatherapy_massage'],
    pricing: { pricingMode: 'fixed', minimumCallout: 420, basePrice: 420, hourlyRate: 0, durationMinutes: 120, complexityMultiplier: 1.0 },
    packageQuestions: ['timing_preference', 'service_for_person', 'service_address_target', 'body_care_setup'],
  },
  {
    id: 'care_family_support_package',
    kind: 'package',
    categoryId: 'care',
    label: 'Family support package',
    promptLabel: 'I want the family support package',
    description: 'A bundled care option for home support, short-term supervision, and household help.',
    includedServiceIds: ['babysitting', 'pet_sitting', 'house_sitting', 'pet_feeding'],
    pricing: { pricingMode: 'fixed', minimumCallout: 450, basePrice: 450, hourlyRate: 0, durationMinutes: 240, complexityMultiplier: 1.0 },
    packageQuestions: ['timing_preference', 'service_address_target', 'care_recipient', 'care_duration_needed'],
  },
  {
    id: 'car_wash_premium_package',
    kind: 'package',
    categoryId: 'car_wash',
    label: 'Premium wash package',
    promptLabel: 'I want the premium wash package',
    description: 'A bundled vehicle-care option for inside and outside cleaning with a premium finish.',
    includedServiceIds: ['exterior_wash', 'interior_cleaning', 'seat_cleaning', 'full_body_wash'],
    pricing: { pricingMode: 'fixed', minimumCallout: 220, basePrice: 220, hourlyRate: 0, durationMinutes: 120, complexityMultiplier: 1.0 },
    packageQuestions: ['timing_preference', 'service_address_target', 'vehicle_type', 'car_wash_scope'],
  },
];

const ALL_SERVICE_DEFINITIONS = [...PACKAGE_DEFINITIONS, ...SERVICE_DEFINITIONS];

export const CUSTOMER_SERVICE_CATALOG = Object.values(CATEGORY_LOOKUP).map((category) => ({
  ...category,
  packages: PACKAGE_DEFINITIONS.filter((service) => service.categoryId === category.id),
  services: SERVICE_DEFINITIONS.filter((service) => service.categoryId === category.id),
}));

export const CUSTOMER_SERVICE_CATEGORY_OPTIONS = CUSTOMER_SERVICE_CATALOG.map((category) => ({
  id: category.id,
  label: category.label,
  description: category.description,
  pricingEngineId: category.pricingEngineId,
}));

export const CUSTOMER_SERVICE_OPTIONS = ALL_SERVICE_DEFINITIONS.map((service) => ({
  id: service.id,
  categoryId: service.categoryId,
  label: service.label,
  promptLabel: service.promptLabel,
  kind: service.kind || 'service',
  description: service.description || '',
  includedServiceIds: Array.isArray(service.includedServiceIds) ? service.includedServiceIds : [],
  packageQuestions: Array.isArray(service.packageQuestions) ? service.packageQuestions : [],
  pricing: { ...service.pricing },
  requiresPortfolioSelection: Boolean(service.requiresPortfolioSelection),
  sensitive: Boolean(service.sensitive),
}));

export const CUSTOMER_CATEGORY_LABELS = CUSTOMER_SERVICE_CATALOG.map((category) => category.label);
export const CUSTOMER_SERVICE_LABELS = CUSTOMER_SERVICE_OPTIONS.map((service) => service.label);

export function getCustomerServiceCategoryById(categoryId) {
  return CUSTOMER_SERVICE_CATALOG.find((category) => category.id === categoryId) || null;
}

export function getCustomerServiceById(serviceId) {
  return CUSTOMER_SERVICE_OPTIONS.find((service) => service.id === serviceId) || null;
}

export function getCustomerServicesForCategory(categoryId) {
  return CUSTOMER_SERVICE_OPTIONS.filter((service) => service.categoryId === categoryId && service.kind !== 'package');
}

export function getCustomerPackagesForCategory(categoryId) {
  return CUSTOMER_SERVICE_OPTIONS.filter((service) => service.categoryId === categoryId && service.kind === 'package');
}

export function buildJobRequestSuggestions(limit = 8) {
  return CUSTOMER_SERVICE_OPTIONS
    .filter((service) => service.promptLabel)
    .slice(0, Math.max(1, limit))
    .map((service) => service.promptLabel);
}
