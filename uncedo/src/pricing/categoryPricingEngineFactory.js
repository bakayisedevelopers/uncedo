import { getCustomerServiceCategoryById, getCustomerServiceById } from '../constants/serviceCatalog';

const TRAVEL_RATE_PER_KM = 4;
const MINIMUM_TRAVEL_FEE = 32;
const AI_BOOKING_FEE_LABEL = 'Booking fee (AI intake)';
const PRICING_CALIBRATION = {
  region: 'South Africa',
  calibratedFrom: ['SweepSouth market anchors', 'Sorbet salon anchors'],
  aiPricingSource: 'Google Gemini Live pricing baseline',
};

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function toLower(value) {
  return normalizeText(value).toLowerCase();
}

function getAnswer(answers = {}, key) {
  return answers?.[key];
}

function parseNumber(value, fallback = 1) {
  const text = normalizeText(value);
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseCount(value, fallback = 1) {
  return Math.max(1, Math.round(parseNumber(value, fallback)));
}

function parseDimensionsToArea(value) {
  const text = toLower(value).replace(/,/g, '.');
  const pairMatch = text.match(/(\d+(\.\d+)?)\s*(m|meter|metre|meters|metres)?\s*(x|by)\s*(\d+(\.\d+)?)/);
  if (pairMatch) {
    const left = Number(pairMatch[1]);
    const right = Number(pairMatch[5]);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      return left * right;
    }
  }
  const squareMatch = text.match(/(\d+(\.\d+)?)\s*(square meters|square metres|sqm|m2|m\^2)/);
  if (squareMatch) {
    const parsed = Number(squareMatch[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (text.includes('small')) return 25;
  if (text.includes('medium')) return 80;
  if (text.includes('large')) return 180;
  return parseNumber(text, 40);
}

function getAreaTier(area) {
  if (area <= 30) return 'small';
  if (area <= 90) return 'medium';
  if (area <= 180) return 'large';
  return 'extra_large';
}

function areaMultiplier(value) {
  const area = parseDimensionsToArea(value);
  const tier = getAreaTier(area);
  if (tier === 'small') return 1;
  if (tier === 'medium') return 1.2;
  if (tier === 'large') return 1.45;
  return 1.8;
}

function quantityMultiplier(count, step, capMultiplier = 3.2) {
  return clamp(1 + (Math.max(0, count - 1) * step), 1, capMultiplier);
}

function booleanAdder(value, yesAmount = 0, noAmount = 0) {
  const text = toLower(value);
  if (text === 'yes') return yesAmount;
  if (text === 'no') return noAmount;
  return 0;
}

function optionAdder(value, mapping = {}, fallback = 0) {
  const key = toLower(value);
  return Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : fallback;
}

function keywordAdder(value, pairs = []) {
  const text = toLower(value);
  return pairs.reduce((sum, [needle, amount]) => (text.includes(needle) ? sum + amount : sum), 0);
}

function vehicleMultiplier(vehicleType) {
  return {
    sedan: 1,
    hatchback: 0.95,
    suv: 1.2,
    bakkie: 1.2,
    van: 1.3,
    minibus: 1.45,
    other: 1.15,
  }[toLower(vehicleType)] || 1.1;
}

function buildTravelLine(distanceKm) {
  const normalizedDistance = Math.max(0, Number(distanceKm || 0));
  const rawFee = normalizedDistance * TRAVEL_RATE_PER_KM;
  const amount = roundCurrency(Math.max(MINIMUM_TRAVEL_FEE, rawFee));
  return {
    label: normalizedDistance > 0
      ? `Travel (${normalizedDistance.toFixed(1)} km @ R${TRAVEL_RATE_PER_KM.toFixed(2)}/km, min R${MINIMUM_TRAVEL_FEE})`
      : `Travel minimum fee`,
    amount,
  };
}

function buildAiBookingFeeLine(aiUsageSnapshot = null) {
  const amount = roundCurrency(Number(aiUsageSnapshot?.totalCostZar || 0));
  if (!(amount > 0)) return null;
  return {
    label: `${AI_BOOKING_FEE_LABEL}`,
    amount,
  };
}

function buildLine(label, amount) {
  return { label, amount: roundCurrency(amount) };
}

function createServiceResult(service, amount, lines = []) {
  return {
    serviceId: service.id,
    label: service.label,
    subtotal: roundCurrency(amount),
    lines: lines.map((line) => buildLine(`${service.label}: ${line.label}`, line.amount)),
  };
}

function priceCleaning(service, answers = {}) {
  if (service.id === 'dishwashing') {
    const peopleCount = parseCount(getAnswer(answers, 'dishwashing_load_size'), 4);
    const amount = 95
      + optionAdder(getAnswer(answers, 'dishwashing_context'), { household: 0, after_event: 80 }, 0)
      + Math.max(0, peopleCount - 4) * 8
      + booleanAdder(getAnswer(answers, 'dishwashing_include_kitchen'), 45, 0);
    return createServiceResult(service, amount, [
      { label: 'Base dishwashing service', amount: 95 },
      { label: 'Load size adjustment', amount: Math.max(0, peopleCount - 4) * 8 },
      { label: 'Event clean-up context', amount: optionAdder(getAnswer(answers, 'dishwashing_context'), { after_event: 80 }, 0) },
      { label: 'Kitchen add-on', amount: booleanAdder(getAnswer(answers, 'dishwashing_include_kitchen'), 45, 0) },
    ]);
  }

  if (service.id === 'house_cleaning') {
    const roomCount = parseCount(getAnswer(answers, 'house_cleaning_area_count'), 3);
    const deepCleanAdder = optionAdder(getAnswer(answers, 'house_cleaning_depth'), { deep_clean: 130, standard: 0 }, 0);
    const amount = 260 + Math.max(0, roomCount - 3) * 50 + deepCleanAdder;
    return createServiceResult(service, amount, [
      { label: 'Base house cleaning', amount: 260 },
      { label: 'Additional rooms', amount: Math.max(0, roomCount - 3) * 50 },
      { label: 'Deep-clean adjustment', amount: deepCleanAdder },
    ]);
  }

  if (service.id === 'room_cleaning') {
    const roomCount = parseCount(getAnswer(answers, 'room_cleaning_room_count'), 1);
    const amount = 110 * roomCount;
    return createServiceResult(service, amount, [
      { label: 'Room cleaning quantity', amount },
    ]);
  }

  if (service.id === 'kitchen_cleaning') {
    const amount = 175
      + optionAdder(getAnswer(answers, 'kitchen_cleaning_depth'), { deep_clean: 85, basic: 0 }, 0)
      + booleanAdder(getAnswer(answers, 'kitchen_cleaning_include_dishes'), 55, 0);
    return createServiceResult(service, amount, [
      { label: 'Base kitchen clean', amount: 175 },
      { label: 'Deep-clean adjustment', amount: optionAdder(getAnswer(answers, 'kitchen_cleaning_depth'), { deep_clean: 85 }, 0) },
      { label: 'Dishwashing add-on', amount: booleanAdder(getAnswer(answers, 'kitchen_cleaning_include_dishes'), 55, 0) },
    ]);
  }

  if (service.id === 'bathroom_cleaning') {
    const count = parseCount(getAnswer(answers, 'bathroom_cleaning_count'), 1);
    const amount = 120 + Math.max(0, count - 1) * 60 + booleanAdder(getAnswer(answers, 'bathroom_cleaning_treatment'), 55, 0);
    return createServiceResult(service, amount, [
      { label: 'Base bathroom clean', amount: 120 },
      { label: 'Additional bathrooms', amount: Math.max(0, count - 1) * 60 },
      { label: 'Treatment add-on', amount: booleanAdder(getAnswer(answers, 'bathroom_cleaning_treatment'), 55, 0) },
    ]);
  }

  if (service.id === 'floor_cleaning') {
    const surfaceAdder = optionAdder(getAnswer(answers, 'floor_cleaning_surface_type'), {
      tile: 0,
      wood: 45,
      carpet: 70,
      cement: 0,
      mixed: 55,
      other: 30,
    }, 30);
    const amount = roundCurrency((140 + surfaceAdder) * areaMultiplier(getAnswer(answers, 'floor_cleaning_area_size')))
      + optionAdder(getAnswer(answers, 'floor_cleaning_finish'), { clean_and_polish: 70, clean_only: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base floor cleaning', amount: roundCurrency((140 + surfaceAdder) * areaMultiplier(getAnswer(answers, 'floor_cleaning_area_size'))) },
      { label: 'Polish add-on', amount: optionAdder(getAnswer(answers, 'floor_cleaning_finish'), { clean_and_polish: 70 }, 0) },
    ]);
  }

  if (service.id === 'event_cleanup') {
    const guests = parseCount(getAnswer(answers, 'event_cleanup_guest_count'), 20);
    const amount = 350
      + Math.max(0, guests - 20) * 6
      + keywordAdder(getAnswer(answers, 'event_cleanup_additional_tasks'), [['dish', 70], ['waste', 55]]);
    return createServiceResult(service, amount, [
      { label: 'Base event cleanup', amount: 350 },
      { label: 'Guest/load adjustment', amount: Math.max(0, guests - 20) * 6 },
      { label: 'Additional tasks', amount: keywordAdder(getAnswer(answers, 'event_cleanup_additional_tasks'), [['dish', 70], ['waste', 55]]) },
    ]);
  }

  if (service.id === 'laundry') {
    const loads = parseCount(getAnswer(answers, 'laundry_load_count'), 2);
    const scopeAdder = optionAdder(getAnswer(answers, 'laundry_scope'), { wash_only: 0, wash_and_fold: 45 }, 0);
    const extrasAdder = keywordAdder(getAnswer(answers, 'laundry_extra_tasks'), [['iron', 55], ['stain', 45]]);
    const amount = 110 + Math.max(0, loads - 2) * 35 + scopeAdder + extrasAdder;
    return createServiceResult(service, amount, [
      { label: 'Base laundry service', amount: 110 },
      { label: 'Load count adjustment', amount: Math.max(0, loads - 2) * 35 },
      { label: 'Wash and fold add-on', amount: scopeAdder },
      { label: 'Extra treatment add-on', amount: extrasAdder },
    ]);
  }

  if (service.id === 'ironing') {
    const items = parseCount(getAnswer(answers, 'ironing_item_count'), 10);
    const amount = 85 + Math.max(0, items - 10) * 5 + booleanAdder(getAnswer(answers, 'ironing_special_items'), 30, 0);
    return createServiceResult(service, amount, [
      { label: 'Base ironing', amount: 85 },
      { label: 'Item count adjustment', amount: Math.max(0, items - 10) * 5 },
      { label: 'Special-item handling', amount: booleanAdder(getAnswer(answers, 'ironing_special_items'), 30, 0) },
    ]);
  }

  if (service.id === 'folding') {
    const items = parseCount(getAnswer(answers, 'folding_item_count'), 20);
    const amount = 65 + Math.max(0, items - 20) * 2.5;
    return createServiceResult(service, amount, [
      { label: 'Base folding', amount: 65 },
      { label: 'Item count adjustment', amount: Math.max(0, items - 20) * 2.5 },
    ]);
  }

  if (service.id === 'stain_treatment') {
    const items = parseCount(getAnswer(answers, 'stain_treatment_item_count'), 1);
    const amount = 95 + Math.max(0, items - 1) * 28 + keywordAdder(getAnswer(answers, 'stain_treatment_item_type'), [['formal', 35], ['linen', 25], ['blanket', 45]]);
    return createServiceResult(service, amount, [
      { label: 'Base stain treatment', amount: 95 },
      { label: 'Item count adjustment', amount: Math.max(0, items - 1) * 28 },
      { label: 'Fabric/type complexity', amount: keywordAdder(getAnswer(answers, 'stain_treatment_item_type'), [['formal', 35], ['linen', 25], ['blanket', 45]]) },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function priceYardMaintenance(service, answers = {}) {
  if (service.id === 'grass_cutting') {
    const areaPrice = 220 * areaMultiplier(getAnswer(answers, 'yard_area_size') || getAnswer(answers, 'grass_cutting_yard_size'));
    const equipmentAdder = optionAdder(getAnswer(answers, 'grass_cutting_equipment_source') || getAnswer(answers, 'yard_equipment_source'), {
      bring_lawnmower: 70,
      bring_equipment: 70,
      use_my_lawnmower: 0,
      use_my_equipment: 0,
      mixed: 35,
    }, 50);
    const utilityAdder = optionAdder(getAnswer(answers, 'grass_cutting_electricity') || getAnswer(answers, 'yard_site_utilities'), {
      no: 45,
      neither: 60,
      water_only: 25,
      electricity_only: 0,
      both: 0,
    }, 0);
    const amount = roundCurrency(areaPrice + equipmentAdder + utilityAdder);
    return createServiceResult(service, amount, [
      { label: 'Base grass-cutting rate', amount: areaPrice },
      { label: 'Equipment provision', amount: equipmentAdder },
      { label: 'Site utility adjustment', amount: utilityAdder },
    ]);
  }

  if (service.id === 'gardening') {
    const amount = roundCurrency((190 + keywordAdder(getAnswer(answers, 'gardening_scope'), [['prune', 40], ['prepare', 55], ['remove', 35]])) * areaMultiplier(getAnswer(answers, 'gardening_area_size')))
      + booleanAdder(getAnswer(answers, 'gardening_tools_source'), 55, 0);
    return createServiceResult(service, amount, [
      { label: 'Base gardening work', amount: roundCurrency((190 + keywordAdder(getAnswer(answers, 'gardening_scope'), [['prune', 40], ['prepare', 55], ['remove', 35]])) * areaMultiplier(getAnswer(answers, 'gardening_area_size'))) },
      { label: 'Tool provision', amount: booleanAdder(getAnswer(answers, 'gardening_tools_source'), 55, 0) },
    ]);
  }

  if (service.id === 'landscaping') {
    const amount = roundCurrency((320 + keywordAdder(getAnswer(answers, 'landscaping_goal'), [['design', 110], ['level', 85], ['stone', 150], ['path', 100]])) * areaMultiplier(getAnswer(answers, 'landscaping_area_size')));
    return createServiceResult(service, amount, [
      { label: 'Landscaping scope', amount },
    ]);
  }

  if (service.id === 'tree_trimming') {
    const treeCount = parseCount(getAnswer(answers, 'tree_trimming_tree_count'), 1);
    const heightAdder = parseNumber(getAnswer(answers, 'tree_trimming_height'), 3) > 5 ? 140 : 70;
    const equipmentAdder = optionAdder(getAnswer(answers, 'tree_trimming_equipment_source'), { bring_equipment: 100, use_my_equipment: 0 }, 65);
    const amount = 260 + Math.max(0, treeCount - 1) * 110 + heightAdder + equipmentAdder;
    return createServiceResult(service, amount, [
      { label: 'Base tree trimming', amount: 260 },
      { label: 'Additional trees', amount: Math.max(0, treeCount - 1) * 110 },
      { label: 'Height/safety adjustment', amount: heightAdder },
      { label: 'Equipment provision', amount: equipmentAdder },
    ]);
  }

  if (service.id === 'tree_cutting') {
    const treeCount = parseCount(getAnswer(answers, 'tree_cutting_tree_count'), 1);
    const heightAdder = parseNumber(getAnswer(answers, 'tree_cutting_height'), 3) > 5 ? 220 : 110;
    const equipmentAdder = optionAdder(getAnswer(answers, 'tree_cutting_equipment_source'), { bring_equipment: 130, use_my_equipment: 0 }, 90);
    const amount = 390 + Math.max(0, treeCount - 1) * 165 + heightAdder + equipmentAdder;
    return createServiceResult(service, amount, [
      { label: 'Base tree cutting', amount: 390 },
      { label: 'Additional trees', amount: Math.max(0, treeCount - 1) * 165 },
      { label: 'Height/safety adjustment', amount: heightAdder },
      { label: 'Equipment provision', amount: equipmentAdder },
    ]);
  }

  if (service.id === 'hedge_trimming') {
    const length = parseNumber(getAnswer(answers, 'hedge_trimming_length'), 5);
    const amount = 190 + Math.max(0, length - 5) * 14 + booleanAdder(getAnswer(answers, 'hedge_trimming_waste_removal'), 55, 0);
    return createServiceResult(service, amount, [
      { label: 'Base hedge trimming', amount: 190 },
      { label: 'Length adjustment', amount: Math.max(0, length - 5) * 14 },
      { label: 'Waste removal', amount: booleanAdder(getAnswer(answers, 'hedge_trimming_waste_removal'), 55, 0) },
    ]);
  }

  if (service.id === 'weeding') {
    const amount = roundCurrency(145 * areaMultiplier(getAnswer(answers, 'weeding_area_size')))
      + optionAdder(getAnswer(answers, 'weeding_frequency'), { recurring: -25, once_off: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base weeding service', amount: roundCurrency(145 * areaMultiplier(getAnswer(answers, 'weeding_area_size'))) },
      { label: 'Recurring-service discount', amount: optionAdder(getAnswer(answers, 'weeding_frequency'), { recurring: -25 }, 0) },
    ]);
  }

  if (service.id === 'planting_flowers') {
    const bedCount = parseCount(getAnswer(answers, 'planting_flowers_bed_count'), 1);
    const materialAdder = optionAdder(getAnswer(answers, 'planting_flowers_material_owner'), { no: 95, yes: 0 }, 0)
      + booleanAdder(getAnswer(answers, 'planting_flowers_helper_materials'), 75, 0);
    const amount = 155 + Math.max(0, bedCount - 1) * 55 + materialAdder;
    return createServiceResult(service, amount, [
      { label: 'Base flower planting', amount: 155 },
      { label: 'Additional planting beds', amount: Math.max(0, bedCount - 1) * 55 },
      { label: 'Materials provision', amount: materialAdder },
    ]);
  }

  if (service.id === 'planting_trees') {
    const treeCount = parseCount(getAnswer(answers, 'planting_trees_tree_count'), 1);
    const materialAdder = optionAdder(getAnswer(answers, 'planting_trees_material_owner'), { no: 140, yes: 0 }, 0);
    const amount = 220 + Math.max(0, treeCount - 1) * 95 + materialAdder;
    return createServiceResult(service, amount, [
      { label: 'Base tree planting', amount: 220 },
      { label: 'Additional trees', amount: Math.max(0, treeCount - 1) * 95 },
      { label: 'Materials provision', amount: materialAdder },
    ]);
  }

  if (service.id === 'yard_tidy_up') {
    const amount = roundCurrency((175 + keywordAdder(getAnswer(answers, 'yard_tidy_task_mix'), [['trim', 35], ['sweep', 25], ['waste', 50]])) * areaMultiplier(getAnswer(answers, 'yard_tidy_area_size')));
    return createServiceResult(service, amount, [
      { label: 'Base yard tidy-up', amount },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function priceBeauty(service, answers = {}) {
  if (service.id === 'hairstyles') {
    const typeAdder = keywordAdder(getAnswer(answers, 'hairstyle_type'), [['updo', 90], ['wig', 160], ['weave', 180], ['bridal', 240], ['cornrow', 100]]);
    const amount = 320 + typeAdder + optionAdder(getAnswer(answers, 'hairstyle_location_type'), { another_location: 40, my_place: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base hairstyle service', amount: 320 },
      { label: 'Style complexity', amount: typeAdder },
      { label: 'Location adjustment', amount: optionAdder(getAnswer(answers, 'hairstyle_location_type'), { another_location: 40 }, 0) },
    ]);
  }

  if (service.id === 'braiding') {
    const styleAdder = keywordAdder(getAnswer(answers, 'braiding_style'), [['knotless', 220], ['feed', 150], ['box', 180], ['tribal', 210], ['cornrow', 110]]);
    const amount = 450 + styleAdder;
    return createServiceResult(service, amount, [
      { label: 'Base braiding service', amount: 450 },
      { label: 'Style complexity', amount: styleAdder },
    ]);
  }

  if (service.id === 'makeup') {
    const occasionAdder = keywordAdder(getAnswer(answers, 'makeup_occasion'), [['wedding', 260], ['bridal', 260], ['matric', 160], ['photo', 110], ['event', 80]]);
    const amount = 340 + occasionAdder;
    return createServiceResult(service, amount, [
      { label: 'Base makeup booking', amount: 340 },
      { label: 'Occasion adjustment', amount: occasionAdder },
    ]);
  }

  if (service.id === 'lashes') {
    const styleAdder = keywordAdder(getAnswer(answers, 'lash_style'), [['classic', 0], ['hybrid', 90], ['volume', 140], ['mega', 190]]);
    const amount = 280 + styleAdder;
    return createServiceResult(service, amount, [
      { label: 'Base lash set', amount: 280 },
      { label: 'Style adjustment', amount: styleAdder },
    ]);
  }

  if (service.id === 'nails') {
    const typeAdder = keywordAdder(getAnswer(answers, 'nail_service_type'), [['gel', 80], ['acrylic', 140], ['tips', 110], ['overlay', 90], ['art', 100]]);
    const amount = 260 + typeAdder;
    return createServiceResult(service, amount, [
      { label: 'Base nail service', amount: 260 },
      { label: 'Style/material adjustment', amount: typeAdder },
    ]);
  }

  if (service.id === 'manicure') {
    const amount = 190 + optionAdder(getAnswer(answers, 'manicure_finish_type'), { styled: 90, basic: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base manicure', amount: 190 },
      { label: 'Styled-finish add-on', amount: optionAdder(getAnswer(answers, 'manicure_finish_type'), { styled: 90 }, 0) },
    ]);
  }

  if (service.id === 'pedicure') {
    const amount = 220 + optionAdder(getAnswer(answers, 'pedicure_finish_type'), { styled: 95, standard: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base pedicure', amount: 220 },
      { label: 'Styled-finish add-on', amount: optionAdder(getAnswer(answers, 'pedicure_finish_type'), { styled: 95 }, 0) },
    ]);
  }

  if (service.id === 'waxing_prep') {
    const scopeAdder = keywordAdder(getAnswer(answers, 'waxing_prep_scope'), [['full', 100], ['bikini', 75], ['facial', 45]]);
    const amount = 170 + scopeAdder;
    return createServiceResult(service, amount, [
      { label: 'Base waxing prep', amount: 170 },
      { label: 'Scope adjustment', amount: scopeAdder },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function priceBarber(service, answers = {}) {
  if (service.id === 'haircut') {
    const typeAdder = keywordAdder(getAnswer(answers, 'haircut_type'), [['fade', 45], ['design', 65], ['kids', -15], ['beard', 35]]);
    const amount = 130 + typeAdder;
    return createServiceResult(service, amount, [
      { label: 'Base haircut', amount: 130 },
      { label: 'Style adjustment', amount: typeAdder },
    ]);
  }

  if (service.id === 'beard_trim') {
    const amount = 95 + optionAdder(getAnswer(answers, 'beard_trim_scope'), { full_trim: 40, shape_up: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base beard trim', amount: 95 },
      { label: 'Full-trim adjustment', amount: optionAdder(getAnswer(answers, 'beard_trim_scope'), { full_trim: 40 }, 0) },
    ]);
  }

  if (service.id === 'line_up') {
    const amount = 85 + optionAdder(getAnswer(answers, 'line_up_scope'), { hairline_and_beard: 30, hairline_only: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base line-up', amount: 85 },
      { label: 'Beard add-on', amount: optionAdder(getAnswer(answers, 'line_up_scope'), { hairline_and_beard: 30 }, 0) },
    ]);
  }

  if (service.id === 'shave') {
    const amount = 100 + optionAdder(getAnswer(answers, 'shave_scope'), { full_shave: 25, clean_up_shave: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base shave', amount: 100 },
      { label: 'Full-shave adjustment', amount: optionAdder(getAnswer(answers, 'shave_scope'), { full_shave: 25 }, 0) },
    ]);
  }

  if (service.id === 'hair_dye') {
    const scopeAdder = optionAdder(getAnswer(answers, 'hair_dye_scope'), { dye_and_cut: 85, dye_only: 0 }, 0);
    const colorAdder = keywordAdder(getAnswer(answers, 'hair_dye_color'), [['bleach', 150], ['blonde', 130], ['highlight', 165], ['black', 0], ['brown', 40]]);
    const amount = 220 + scopeAdder + colorAdder;
    return createServiceResult(service, amount, [
      { label: 'Base hair dye', amount: 220 },
      { label: 'Cut add-on', amount: scopeAdder },
      { label: 'Colour complexity', amount: colorAdder },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function priceCare(service, answers = {}) {
  if (service.id === 'babysitting') {
    const childCount = parseCount(getAnswer(answers, 'babysitting_child_count'), 1);
    const hours = Math.max(2, parseNumber(getAnswer(answers, 'babysitting_duration'), 3));
    const amount = 220 + Math.max(0, childCount - 1) * 55 + Math.max(0, hours - 3) * 40;
    return createServiceResult(service, amount, [
      { label: 'Base babysitting block', amount: 220 },
      { label: 'Additional children', amount: Math.max(0, childCount - 1) * 55 },
      { label: 'Extra hours', amount: Math.max(0, hours - 3) * 40 },
    ]);
  }

  if (service.id === 'pet_sitting') {
    const hours = Math.max(2, parseNumber(getAnswer(answers, 'pet_sitting_duration'), 3));
    const petCountAdder = keywordAdder(getAnswer(answers, 'pet_sitting_pet_type'), [['dog', 25], ['cat', 15], ['multiple', 40]]);
    const amount = 185 + Math.max(0, hours - 3) * 32 + petCountAdder;
    return createServiceResult(service, amount, [
      { label: 'Base pet sitting block', amount: 185 },
      { label: 'Extra hours', amount: Math.max(0, hours - 3) * 32 },
      { label: 'Pet handling complexity', amount: petCountAdder },
    ]);
  }

  if (service.id === 'pet_feeding') {
    const petCount = parseCount(getAnswer(answers, 'pet_feeding_pet_count'), 1);
    const frequencyAdder = keywordAdder(getAnswer(answers, 'pet_feeding_frequency'), [['twice', 20], ['three', 35], ['daily', 15]]);
    const amount = 95 + Math.max(0, petCount - 1) * 18 + frequencyAdder;
    return createServiceResult(service, amount, [
      { label: 'Base pet feeding visit', amount: 95 },
      { label: 'Additional pets', amount: Math.max(0, petCount - 1) * 18 },
      { label: 'Frequency adjustment', amount: frequencyAdder },
    ]);
  }

  if (service.id === 'house_sitting') {
    const duration = Math.max(1, parseNumber(getAnswer(answers, 'house_sitting_duration'), 1));
    const amount = 280 + Math.max(0, duration - 1) * 140 + keywordAdder(getAnswer(answers, 'house_sitting_extra_duties'), [['pet', 50], ['garden', 40], ['pool', 35]]);
    return createServiceResult(service, amount, [
      { label: 'Base first day', amount: 280 },
      { label: 'Additional days', amount: Math.max(0, duration - 1) * 140 },
      { label: 'Extra duties', amount: keywordAdder(getAnswer(answers, 'house_sitting_extra_duties'), [['pet', 50], ['garden', 40], ['pool', 35]]) },
    ]);
  }

  if (service.id === 'elder_companionship') {
    const hours = Math.max(2, parseNumber(getAnswer(answers, 'elder_support_duration'), 4));
    const scopeAdder = optionAdder(getAnswer(answers, 'elder_support_scope'), { companionship_and_assistance: 95, companionship_only: 0 }, 0);
    const amount = 260 + Math.max(0, hours - 4) * 45 + scopeAdder;
    return createServiceResult(service, amount, [
      { label: 'Base elder support block', amount: 260 },
      { label: 'Extra hours', amount: Math.max(0, hours - 4) * 45 },
      { label: 'Assistance add-on', amount: scopeAdder },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function priceCarWash(service, answers = {}) {
  const vehicleType = getAnswer(answers, 'vehicle_type');
  const vehicleFactor = vehicleMultiplier(vehicleType);

  if (service.id === 'exterior_wash') {
    const amount = roundCurrency(140 * vehicleFactor);
    return createServiceResult(service, amount, [{ label: 'Exterior wash', amount }]);
  }

  if (service.id === 'interior_cleaning') {
    const dirtAdder = optionAdder(getAnswer(answers, 'interior_condition_level'), { light: 0, medium: 45, heavy: 85 }, 25);
    const amount = roundCurrency((180 + dirtAdder) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Interior cleaning base', amount: roundCurrency(180 * vehicleFactor) },
      { label: 'Condition adjustment', amount: roundCurrency(dirtAdder * vehicleFactor) },
    ]);
  }

  if (service.id === 'seat_cleaning') {
    const seatCount = parseCount(getAnswer(answers, 'seat_cleaning_seat_count'), 4);
    const stainAdder = optionAdder(getAnswer(answers, 'seat_cleaning_stain_level'), { heavy: 55, light: 0 }, 0);
    const amount = roundCurrency((130 + Math.max(0, seatCount - 4) * 20 + stainAdder) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Seat cleaning base', amount: roundCurrency(130 * vehicleFactor) },
      { label: 'Additional seats', amount: roundCurrency(Math.max(0, seatCount - 4) * 20 * vehicleFactor) },
      { label: 'Stain adjustment', amount: roundCurrency(stainAdder * vehicleFactor) },
    ]);
  }

  if (service.id === 'full_body_wash') {
    const addon = booleanAdder(getAnswer(answers, 'full_body_wash_detailing_addons'), 45, 0);
    const amount = roundCurrency((190 + addon) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Full body wash base', amount: roundCurrency(190 * vehicleFactor) },
      { label: 'Tyre/rim add-on', amount: roundCurrency(addon * vehicleFactor) },
    ]);
  }

  if (service.id === 'engine_cleaning') {
    const historyAdder = optionAdder(getAnswer(answers, 'engine_cleaning_history'), { no: 80, unknown: 45, yes: 0 }, 0);
    const amount = roundCurrency((230 + historyAdder) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Engine cleaning base', amount: roundCurrency(230 * vehicleFactor) },
      { label: 'Engine condition adjustment', amount: roundCurrency(historyAdder * vehicleFactor) },
    ]);
  }

  if (service.id === 'full_detailing') {
    const scopeAdder = optionAdder(getAnswer(answers, 'full_detailing_scope'), {
      interior_only: 0,
      exterior_only: 0,
      interior_and_exterior: 95,
    }, 50);
    const amount = roundCurrency((320 + scopeAdder) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Full detailing base', amount: roundCurrency(320 * vehicleFactor) },
      { label: 'Scope adjustment', amount: roundCurrency(scopeAdder * vehicleFactor) },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function createServicePricer(categoryId) {
  if (categoryId === 'cleaning') return priceCleaning;
  if (categoryId === 'yard_maintenance') return priceYardMaintenance;
  if (categoryId === 'beauty') return priceBeauty;
  if (categoryId === 'barber') return priceBarber;
  if (categoryId === 'care') return priceCare;
  if (categoryId === 'car_wash') return priceCarWash;
  return (service) => createServiceResult(service, Number(service?.pricing?.basePrice || 0), [{ label: 'Base service rate', amount: Number(service?.pricing?.basePrice || 0) }]);
}

export function createCategoryPricingEngine(categoryId) {
  const priceService = createServicePricer(categoryId);

  return function categoryPricingEngine({
    serviceIds = [],
    structuredAnswers = {},
    serviceOverrides = {},
    currency = 'ZAR',
    travelDistanceKm = null,
    aiUsageSnapshot = null,
  } = {}) {
    const category = getCustomerServiceCategoryById(categoryId);
    const selectedServices = serviceIds
      .map((serviceId) => getCustomerServiceById(serviceId))
      .filter((service) => service && service.categoryId === categoryId);

    const serviceBreakdown = selectedServices.map((service) => {
      const result = priceService(service, structuredAnswers, serviceOverrides[service.id] || {});
      return {
        serviceId: service.id,
        label: service.label,
        subtotal: roundCurrency(result.subtotal),
        lines: Array.isArray(result.lines) ? result.lines : [],
      };
    });

    const travelLine = buildTravelLine(
      travelDistanceKm ?? serviceOverrides.travelDistanceKm ?? structuredAnswers.travel_distance_km ?? 0,
    );
    const aiBookingFeeLine = buildAiBookingFeeLine(aiUsageSnapshot);

    const serviceLines = serviceBreakdown.flatMap((item) => item.lines);
    const serviceTotal = serviceBreakdown.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const bookingFee = Number(aiBookingFeeLine?.amount || 0);
    const total = roundCurrency(serviceTotal + travelLine.amount + bookingFee);
    const allLines = [...serviceLines, travelLine];
    if (aiBookingFeeLine) {
      allLines.push(aiBookingFeeLine);
    }

    return {
      categoryId,
      categoryLabel: category?.label || categoryId,
      estimateLabel: serviceBreakdown.length ? 'South Africa calibrated quote' : 'No services selected',
      pricingCalibration: PRICING_CALIBRATION,
      currency,
      minimumCallout: roundCurrency(MINIMUM_TRAVEL_FEE),
      estimatedDurationMinutes: 0,
      serviceBreakdown,
      lines: allLines,
      total,
      travelFee: travelLine.amount,
      bookingFee,
      aiUsageSnapshot,
      travelRatePerKm: TRAVEL_RATE_PER_KM,
    };
  };
}
