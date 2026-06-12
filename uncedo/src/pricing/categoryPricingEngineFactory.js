import { getCustomerServiceCategoryById, getCustomerServiceById } from '../constants/serviceCatalog';

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeQuantity(rawQuantity) {
  const parsed = Number(rawQuantity);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.max(1, Math.floor(parsed));
}

function normalizeServiceOverride(overrides = {}) {
  return {
    quantity: normalizeQuantity(overrides.quantity),
    durationMinutes: Number.isFinite(Number(overrides.durationMinutes)) ? Number(overrides.durationMinutes) : null,
    complexityMultiplier: Number.isFinite(Number(overrides.complexityMultiplier))
      ? Math.max(0.5, Number(overrides.complexityMultiplier))
      : null,
  };
}

export function createCategoryPricingEngine(categoryId) {
  return function categoryPricingEngine({
    serviceIds = [],
    serviceOverrides = {},
    currency = 'ZAR',
  } = {}) {
    const category = getCustomerServiceCategoryById(categoryId);
    const selectedServices = serviceIds
      .map((serviceId) => getCustomerServiceById(serviceId))
      .filter((service) => service && service.categoryId === categoryId);

    const serviceBreakdown = selectedServices.map((service) => {
      const servicePricing = service.pricing || {};
      const override = normalizeServiceOverride(serviceOverrides[service.id]);
      const complexityMultiplier = override.complexityMultiplier || Number(servicePricing.complexityMultiplier || 1);
      const quantity = override.quantity;
      const durationMinutes = override.durationMinutes || Number(servicePricing.durationMinutes || 0);
      const basePrice = Number(servicePricing.basePrice || servicePricing.minimumCallout || 0);
      const hourlyRate = Number(servicePricing.hourlyRate || 0);
      const variablePrice = servicePricing.pricingMode === 'time_based'
        ? (hourlyRate * (durationMinutes / 60))
        : 0;
      const subtotal = Math.max(
        Number(servicePricing.minimumCallout || 0),
        (basePrice + variablePrice) * quantity * complexityMultiplier,
      );

      return {
        serviceId: service.id,
        label: service.label,
        pricingMode: servicePricing.pricingMode || 'fixed',
        quantity,
        durationMinutes,
        complexityMultiplier,
        minimumCallout: Number(servicePricing.minimumCallout || 0),
        basePrice: roundCurrency(basePrice),
        hourlyRate: roundCurrency(hourlyRate),
        subtotal: roundCurrency(subtotal),
      };
    });

    const estimatedDurationMinutes = serviceBreakdown.reduce(
      (sum, item) => sum + (Number(item.durationMinutes || 0) * Number(item.quantity || 1)),
      0,
    );
    const minimumCallout = serviceBreakdown.reduce(
      (maxValue, item) => Math.max(maxValue, Number(item.minimumCallout || 0)),
      0,
    );
    const total = roundCurrency(serviceBreakdown.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));

    return {
      categoryId,
      categoryLabel: category?.label || categoryId,
      estimateLabel: serviceBreakdown.length ? 'Placeholder quote' : 'No services selected',
      currency,
      minimumCallout: roundCurrency(minimumCallout),
      estimatedDurationMinutes,
      serviceBreakdown,
      total,
    };
  };
}
