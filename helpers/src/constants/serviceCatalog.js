export const SERVICE_CATALOG = [
  {
    id: 'laundry',
    name: 'Laundry',
    description: 'Clothing care, washing, pressing, and presentation for household laundry.',
    skills: ['Hand wash', 'Machine wash', 'Ironing', 'Folding', 'Stain treatment'],
  },
  {
    id: 'cleaning',
    name: 'Cleaning',
    description: 'Home cleaning support across kitchens, bathrooms, living areas, and bedrooms.',
    skills: ['Deep cleaning', 'Kitchen cleaning', 'Bathroom cleaning', 'Dusting', 'Floor care'],
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
];

export function getServiceById(serviceId) {
  return SERVICE_CATALOG.find((service) => service.id === serviceId) || null;
}
