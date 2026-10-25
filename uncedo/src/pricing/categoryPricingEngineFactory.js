import { getCustomerServiceCategoryById, getCustomerServiceById } from '../constants/serviceCatalog';

const { createCategoryPricingEngine: createSharedCategoryPricingEngine } = require('../../../functions/shared/categoryPricingEngineFactory.cjs');

export function createCategoryPricingEngine(categoryId) {
  return createSharedCategoryPricingEngine(categoryId, {
    getCategoryById: getCustomerServiceCategoryById,
    getServiceById: getCustomerServiceById,
  });
}
