export const SERVICE_CATALOG = [
  {
    id: 'cleaning',
    name: 'Cleaning',
    description: 'Home cleaning support across kitchens, bathrooms, living areas, and bedrooms.',
    skills: ['Deep cleaning', 'Kitchen cleaning', 'Bathroom cleaning', 'Dusting', 'Floor care'],
  },
  {
    id: 'laundry',
    name: 'Laundry',
    description: 'Clothing care, washing, pressing, and presentation for household laundry.',
    skills: ['Hand wash', 'Machine wash', 'Ironing', 'Folding', 'Stain treatment'],
  },
  {
    id: 'gardening',
    name: 'Gardening',
    description: 'Garden upkeep, trimming, watering, and outdoor presentation support.',
    skills: ['Lawn care', 'Weeding', 'Pruning', 'Plant watering', 'Garden tidy-up'],
  },
  {
    id: 'beauty',
    name: 'Beauty',
    description: 'At-home beauty services with portfolio-based trust and skill matching.',
    skills: ['Braiding', 'Nail care', 'Makeup', 'Hair styling', 'Waxing prep'],
  },
  {
    id: 'yard_maintenance',
    name: 'Yard Maintenance',
    description: 'Outdoor upkeep, trimming, tree work, and garden presentation support.',
    skills: ['Grass cutting', 'Gardening', 'Tree trimming', 'Weeding', 'Yard tidy-up'],
  },
  {
    id: 'barber',
    name: 'Barber',
    description: 'Haircuts, trims, shaving, and barber-focused grooming requests.',
    skills: ['Haircut', 'Beard trim', 'Line-up', 'Shave', 'Hair dye'],
  },
  {
    id: 'care',
    name: 'Care',
    description: 'Trusted in-home support for children, pets, homes, and companionship.',
    skills: ['Babysitting', 'Pet sitting', 'House sitting', 'Elder companionship', 'Pet feeding'],
  },
  {
    id: 'car_wash',
    name: 'Car Wash',
    description: 'Mobile car washing, interior cleaning, detailing, and related vehicle care.',
    skills: ['Exterior wash', 'Interior cleaning', 'Seat cleaning', 'Full body wash', 'Full detailing'],
  },
];

export function getAdminCatalogCategoryById(categoryId) {
  return SERVICE_CATALOG.find((category) => category.id === categoryId) || null;
}

export function getAdminCatalogSkills() {
  return SERVICE_CATALOG.flatMap((service) => (
    service.skills.map((skillName) => ({
      id: `${service.id}_${skillName}`.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      categoryId: service.id,
      categoryName: service.name,
      categoryDescription: service.description,
      skillName,
      label: skillName,
      description: `${skillName} under ${service.name}.`,
    }))
  ));
}

export function getAdminCatalogServiceById(serviceId) {
  const normalized = String(serviceId || '').trim().toLowerCase();
  return getAdminCatalogSkills().find((service) => service.id === normalized) || null;
}
