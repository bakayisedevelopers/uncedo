import { buildJobRequestSuggestions, CUSTOMER_CATEGORY_LABELS, CUSTOMER_SERVICE_CATALOG, CUSTOMER_SERVICE_LABELS } from './serviceCatalog';

export const CUSTOMER_ACCOUNT_TYPE_OPTIONS = [
  { key: 'individual', label: 'Individual' },
  { key: 'business', label: 'Business' },
];

export const INDIVIDUAL_CUSTOMER_TYPE_OPTIONS = [
  'Homeowner',
  'Tenant',
  'Family representative',
  'Event organizer',
  'Guest house / accommodation owner',
  'Other',
];

export const BUSINESS_CATEGORY_OPTIONS = [
  'Catering',
  'Mechanic',
  'Salon / beauty',
  'Hospitality',
  'Retail',
  'Office / corporate',
  'Property management',
  'Events',
  'Other',
];

export const JOB_REQUEST_SUGGESTIONS = buildJobRequestSuggestions(8);
export const MVP_SERVICE_CATEGORIES = CUSTOMER_CATEGORY_LABELS;
export const MVP_SERVICE_CATALOG = CUSTOMER_SERVICE_CATALOG;
export const MVP_SERVICE_OPTIONS = CUSTOMER_SERVICE_LABELS;

export const MOCK_PROVIDER_MARKERS = [
  { id: 'provider-1', name: 'Amahle', category: 'Cleaning', x: 22, y: 30, eta: '8 min away' },
  { id: 'provider-2', name: 'Thabo', category: 'Yard Maintenance', x: 58, y: 42, eta: '12 min away' },
  { id: 'provider-3', name: 'Lerato', category: 'Beauty', x: 72, y: 22, eta: '6 min away' },
  { id: 'provider-4', name: 'Sizwe', category: 'Barber', x: 40, y: 66, eta: '10 min away' },
];

export const PLACEHOLDER_THREAD_QUICK_REPLIES = [
  'After an event',
  'Normal household',
  'Today if possible',
  'Tomorrow morning',
];
