export const SERVICE_CATALOG = [
  {
    id: 'cleaning',
    name: 'Cleaning',
    description: 'Home cleaning support across kitchens, bathrooms, living areas, and bedrooms.',
    services: ['Deep cleaning', 'Kitchen cleaning', 'Bathroom cleaning', 'Dusting', 'Floor care'],
  },
  {
    id: 'laundry',
    name: 'Laundry',
    description: 'Clothing care, washing, pressing, and presentation for household laundry.',
    services: ['Hand wash', 'Machine wash', 'Ironing', 'Folding', 'Stain treatment'],
  },
  {
    id: 'beauty',
    name: 'Beauty',
    description: 'At-home beauty services with portfolio-based trust and service matching.',
    services: ['Braiding', 'Nail care', 'Makeup', 'Hair styling', 'Waxing prep'],
  },
  {
    id: 'yard_maintenance',
    name: 'Yard Maintenance',
    description: 'Outdoor upkeep, trimming, tree work, and garden presentation support.',
    services: ['Grass cutting', 'Gardening', 'Tree trimming', 'Weeding', 'Yard tidy-up'],
  },
  {
    id: 'barber',
    name: 'Barber',
    description: 'Haircuts, trims, shaving, and barber-focused grooming requests.',
    services: ['Haircut', 'Beard trim', 'Line-up', 'Shave', 'Hair dye'],
  },
  {
    id: 'care',
    name: 'Care',
    description: 'Trusted in-home support for children, pets, homes, and companionship.',
    services: ['Babysitting', 'Pet sitting', 'House sitting', 'Elder companionship', 'Pet feeding'],
  },
  {
    id: 'car_wash',
    name: 'Car Wash',
    description: 'Mobile car washing, interior cleaning, detailing, and related vehicle care.',
    services: ['Exterior wash', 'Interior cleaning', 'Seat cleaning', 'Full body wash', 'Full detailing'],
  },
  {
    id: 'tutoring',
    name: 'Tutoring',
    description: 'Academic support for homework, exam prep, subject coaching, and study guidance.',
    services: ['Homework help', 'Exam preparation', 'Math tutoring', 'Reading support', 'Language tutoring'],
  },
];

export function getAdminCatalogCategories() {
  return SERVICE_CATALOG.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
  }));
}

export function getAdminCatalogCategoryById(categoryId) {
  return SERVICE_CATALOG.find((category) => category.id === categoryId) || null;
}

export function getAdminCatalogServices() {
  return SERVICE_CATALOG.flatMap((service) => (
    service.services.map((serviceName) => ({
      id: `${service.id}_${serviceName}`.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      categoryId: service.id,
      categoryName: service.name,
      categoryDescription: service.description,
      serviceName,
      label: serviceName,
      description: `${serviceName} under ${service.name}.`,
    }))
  ));
}

export function getAdminCatalogServiceById(serviceId) {
  const normalized = String(serviceId || '').trim().toLowerCase();
  return getAdminCatalogServices().find((service) => service.id === normalized) || null;
}
