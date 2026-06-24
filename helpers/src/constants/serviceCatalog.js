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

const LEGACY_SERVICE_ALIASES = {
  yard_maintenance: 'gardening',
};

const liveCategoryMap = new Map();

function rebuildServiceCatalog() {
  const staticEntries = [
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

  const next = [...staticEntries];
  liveCategoryMap.forEach((category) => {
    if (!next.some((entry) => entry.id === category.id)) {
      next.push({
        id: category.id,
        name: category.name,
        description: category.description,
        skills: [],
      });
    }
  });

  SERVICE_CATALOG.splice(0, SERVICE_CATALOG.length, ...next);
}

export function hydrateHelperServiceCategories(entries = []) {
  liveCategoryMap.clear();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const categoryId = String(entry.categoryId || '').trim().toLowerCase();
    if (!categoryId) return;
    liveCategoryMap.set(categoryId, {
      id: categoryId,
      name: String(entry.categoryName || categoryId).trim(),
      description: String(entry.description || '').trim(),
    });
  });
  rebuildServiceCatalog();
}

export function getServiceById(serviceId) {
  const normalizedServiceId = LEGACY_SERVICE_ALIASES[serviceId] || serviceId;
  return SERVICE_CATALOG.find((service) => service.id === normalizedServiceId) || null;
}
