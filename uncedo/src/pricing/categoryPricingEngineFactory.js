import { getCustomerServiceCategoryById, getCustomerServiceById } from '../constants/serviceCatalog';

const TRAVEL_RATE_PER_KM = 4;
const MINIMUM_TRAVEL_FEE = 32;

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
    const amount = 85
      + optionAdder(getAnswer(answers, 'dishwashing_context'), { household: 0, after_event: 65 }, 0)
      + Math.max(0, peopleCount - 4) * 6
      + booleanAdder(getAnswer(answers, 'dishwashing_include_kitchen'), 35, 0);
    return createServiceResult(service, amount, [
      { label: 'Base dishwashing service', amount: 85 },
      { label: 'Load size adjustment', amount: Math.max(0, peopleCount - 4) * 6 },
      { label: 'Event clean-up context', amount: optionAdder(getAnswer(answers, 'dishwashing_context'), { after_event: 65 }, 0) },
      { label: 'Kitchen add-on', amount: booleanAdder(getAnswer(answers, 'dishwashing_include_kitchen'), 35, 0) },
    ]);
  }

  if (service.id === 'house_cleaning') {
    const roomCount = parseCount(getAnswer(answers, 'house_cleaning_area_count'), 3);
    const deepCleanAdder = optionAdder(getAnswer(answers, 'house_cleaning_depth'), { deep_clean: 110, standard: 0 }, 0);
    const amount = 220 + Math.max(0, roomCount - 3) * 45 + deepCleanAdder;
    return createServiceResult(service, amount, [
      { label: 'Base house cleaning', amount: 220 },
      { label: 'Additional rooms', amount: Math.max(0, roomCount - 3) * 45 },
      { label: 'Deep-clean adjustment', amount: deepCleanAdder },
    ]);
  }

  if (service.id === 'room_cleaning') {
    const roomCount = parseCount(getAnswer(answers, 'room_cleaning_room_count'), 1);
    const amount = 90 * roomCount;
    return createServiceResult(service, amount, [
      { label: 'Room cleaning quantity', amount },
    ]);
  }

  if (service.id === 'kitchen_cleaning') {
    const amount = 150
      + optionAdder(getAnswer(answers, 'kitchen_cleaning_depth'), { deep_clean: 70, basic: 0 }, 0)
      + booleanAdder(getAnswer(answers, 'kitchen_cleaning_include_dishes'), 45, 0);
    return createServiceResult(service, amount, [
      { label: 'Base kitchen clean', amount: 150 },
      { label: 'Deep-clean adjustment', amount: optionAdder(getAnswer(answers, 'kitchen_cleaning_depth'), { deep_clean: 70 }, 0) },
      { label: 'Dishwashing add-on', amount: booleanAdder(getAnswer(answers, 'kitchen_cleaning_include_dishes'), 45, 0) },
    ]);
  }

  if (service.id === 'bathroom_cleaning') {
    const count = parseCount(getAnswer(answers, 'bathroom_cleaning_count'), 1);
    const amount = 105 + Math.max(0, count - 1) * 55 + booleanAdder(getAnswer(answers, 'bathroom_cleaning_treatment'), 40, 0);
    return createServiceResult(service, amount, [
      { label: 'Base bathroom clean', amount: 105 },
      { label: 'Additional bathrooms', amount: Math.max(0, count - 1) * 55 },
      { label: 'Treatment add-on', amount: booleanAdder(getAnswer(answers, 'bathroom_cleaning_treatment'), 40, 0) },
    ]);
  }

  if (service.id === 'floor_cleaning') {
    const surfaceAdder = optionAdder(getAnswer(answers, 'floor_cleaning_surface_type'), {
      tile: 0,
      wood: 35,
      carpet: 55,
      cement: 0,
      mixed: 45,
      other: 25,
    }, 25);
    const amount = roundCurrency((110 + surfaceAdder) * areaMultiplier(getAnswer(answers, 'floor_cleaning_area_size')))
      + optionAdder(getAnswer(answers, 'floor_cleaning_finish'), { clean_and_polish: 55, clean_only: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base floor cleaning', amount: roundCurrency((110 + surfaceAdder) * areaMultiplier(getAnswer(answers, 'floor_cleaning_area_size'))) },
      { label: 'Polish add-on', amount: optionAdder(getAnswer(answers, 'floor_cleaning_finish'), { clean_and_polish: 55 }, 0) },
    ]);
  }

  if (service.id === 'event_cleanup') {
    const guests = parseCount(getAnswer(answers, 'event_cleanup_guest_count'), 20);
    const amount = 280
      + Math.max(0, guests - 20) * 4
      + keywordAdder(getAnswer(answers, 'event_cleanup_additional_tasks'), [['dish', 55], ['waste', 40]]);
    return createServiceResult(service, amount, [
      { label: 'Base event cleanup', amount: 280 },
      { label: 'Guest/load adjustment', amount: Math.max(0, guests - 20) * 4 },
      { label: 'Additional tasks', amount: keywordAdder(getAnswer(answers, 'event_cleanup_additional_tasks'), [['dish', 55], ['waste', 40]]) },
    ]);
  }

  if (service.id === 'laundry') {
    const loads = parseCount(getAnswer(answers, 'laundry_load_count'), 2);
    const scopeAdder = optionAdder(getAnswer(answers, 'laundry_scope'), { wash_only: 0, wash_and_fold: 35 }, 0);
    const extrasAdder = keywordAdder(getAnswer(answers, 'laundry_extra_tasks'), [['iron', 45], ['stain', 35]]);
    const amount = 90 + Math.max(0, loads - 2) * 30 + scopeAdder + extrasAdder;
    return createServiceResult(service, amount, [
      { label: 'Base laundry service', amount: 90 },
      { label: 'Load count adjustment', amount: Math.max(0, loads - 2) * 30 },
      { label: 'Wash and fold add-on', amount: scopeAdder },
      { label: 'Extra treatment add-on', amount: extrasAdder },
    ]);
  }

  if (service.id === 'ironing') {
    const items = parseCount(getAnswer(answers, 'ironing_item_count'), 10);
    const amount = 70 + Math.max(0, items - 10) * 4 + booleanAdder(getAnswer(answers, 'ironing_special_items'), 25, 0);
    return createServiceResult(service, amount, [
      { label: 'Base ironing', amount: 70 },
      { label: 'Item count adjustment', amount: Math.max(0, items - 10) * 4 },
      { label: 'Special-item handling', amount: booleanAdder(getAnswer(answers, 'ironing_special_items'), 25, 0) },
    ]);
  }

  if (service.id === 'folding') {
    const items = parseCount(getAnswer(answers, 'folding_item_count'), 20);
    const amount = 55 + Math.max(0, items - 20) * 2;
    return createServiceResult(service, amount, [
      { label: 'Base folding', amount: 55 },
      { label: 'Item count adjustment', amount: Math.max(0, items - 20) * 2 },
    ]);
  }

  if (service.id === 'stain_treatment') {
    const items = parseCount(getAnswer(answers, 'stain_treatment_item_count'), 1);
    const amount = 80 + Math.max(0, items - 1) * 22 + keywordAdder(getAnswer(answers, 'stain_treatment_item_type'), [['formal', 30], ['linen', 20], ['blanket', 35]]);
    return createServiceResult(service, amount, [
      { label: 'Base stain treatment', amount: 80 },
      { label: 'Item count adjustment', amount: Math.max(0, items - 1) * 22 },
      { label: 'Fabric/type complexity', amount: keywordAdder(getAnswer(answers, 'stain_treatment_item_type'), [['formal', 30], ['linen', 20], ['blanket', 35]]) },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function priceYardMaintenance(service, answers = {}) {
  if (service.id === 'grass_cutting') {
    const areaPrice = 180 * areaMultiplier(getAnswer(answers, 'yard_area_size') || getAnswer(answers, 'grass_cutting_yard_size'));
    const equipmentAdder = optionAdder(getAnswer(answers, 'grass_cutting_equipment_source') || getAnswer(answers, 'yard_equipment_source'), {
      bring_lawnmower: 55,
      bring_equipment: 55,
      use_my_lawnmower: 0,
      use_my_equipment: 0,
      mixed: 25,
    }, 40);
    const utilityAdder = optionAdder(getAnswer(answers, 'grass_cutting_electricity') || getAnswer(answers, 'yard_site_utilities'), {
      no: 35,
      neither: 45,
      water_only: 20,
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
    const amount = roundCurrency((160 + keywordAdder(getAnswer(answers, 'gardening_scope'), [['prune', 30], ['prepare', 40], ['remove', 25]])) * areaMultiplier(getAnswer(answers, 'gardening_area_size')))
      + booleanAdder(getAnswer(answers, 'gardening_tools_source'), 45, 0);
    return createServiceResult(service, amount, [
      { label: 'Base gardening work', amount: roundCurrency((160 + keywordAdder(getAnswer(answers, 'gardening_scope'), [['prune', 30], ['prepare', 40], ['remove', 25]])) * areaMultiplier(getAnswer(answers, 'gardening_area_size'))) },
      { label: 'Tool provision', amount: booleanAdder(getAnswer(answers, 'gardening_tools_source'), 45, 0) },
    ]);
  }

  if (service.id === 'landscaping') {
    const amount = roundCurrency((260 + keywordAdder(getAnswer(answers, 'landscaping_goal'), [['design', 90], ['level', 70], ['stone', 120], ['path', 85]])) * areaMultiplier(getAnswer(answers, 'landscaping_area_size')));
    return createServiceResult(service, amount, [
      { label: 'Landscaping scope', amount },
    ]);
  }

  if (service.id === 'tree_trimming') {
    const treeCount = parseCount(getAnswer(answers, 'tree_trimming_tree_count'), 1);
    const heightAdder = parseNumber(getAnswer(answers, 'tree_trimming_height'), 3) > 5 ? 120 : 55;
    const equipmentAdder = optionAdder(getAnswer(answers, 'tree_trimming_equipment_source'), { bring_equipment: 85, use_my_equipment: 0 }, 55);
    const amount = 220 + Math.max(0, treeCount - 1) * 95 + heightAdder + equipmentAdder;
    return createServiceResult(service, amount, [
      { label: 'Base tree trimming', amount: 220 },
      { label: 'Additional trees', amount: Math.max(0, treeCount - 1) * 95 },
      { label: 'Height/safety adjustment', amount: heightAdder },
      { label: 'Equipment provision', amount: equipmentAdder },
    ]);
  }

  if (service.id === 'tree_cutting') {
    const treeCount = parseCount(getAnswer(answers, 'tree_cutting_tree_count'), 1);
    const heightAdder = parseNumber(getAnswer(answers, 'tree_cutting_height'), 3) > 5 ? 180 : 90;
    const equipmentAdder = optionAdder(getAnswer(answers, 'tree_cutting_equipment_source'), { bring_equipment: 110, use_my_equipment: 0 }, 75);
    const amount = 320 + Math.max(0, treeCount - 1) * 140 + heightAdder + equipmentAdder;
    return createServiceResult(service, amount, [
      { label: 'Base tree cutting', amount: 320 },
      { label: 'Additional trees', amount: Math.max(0, treeCount - 1) * 140 },
      { label: 'Height/safety adjustment', amount: heightAdder },
      { label: 'Equipment provision', amount: equipmentAdder },
    ]);
  }

  if (service.id === 'hedge_trimming') {
    const length = parseNumber(getAnswer(answers, 'hedge_trimming_length'), 5);
    const amount = 160 + Math.max(0, length - 5) * 12 + booleanAdder(getAnswer(answers, 'hedge_trimming_waste_removal'), 45, 0);
    return createServiceResult(service, amount, [
      { label: 'Base hedge trimming', amount: 160 },
      { label: 'Length adjustment', amount: Math.max(0, length - 5) * 12 },
      { label: 'Waste removal', amount: booleanAdder(getAnswer(answers, 'hedge_trimming_waste_removal'), 45, 0) },
    ]);
  }

  if (service.id === 'weeding') {
    const amount = roundCurrency(120 * areaMultiplier(getAnswer(answers, 'weeding_area_size')))
      + optionAdder(getAnswer(answers, 'weeding_frequency'), { recurring: -20, once_off: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base weeding service', amount: roundCurrency(120 * areaMultiplier(getAnswer(answers, 'weeding_area_size'))) },
      { label: 'Recurring-service discount', amount: optionAdder(getAnswer(answers, 'weeding_frequency'), { recurring: -20 }, 0) },
    ]);
  }

  if (service.id === 'planting_flowers') {
    const bedCount = parseCount(getAnswer(answers, 'planting_flowers_bed_count'), 1);
    const materialAdder = optionAdder(getAnswer(answers, 'planting_flowers_material_owner'), { no: 80, yes: 0 }, 0)
      + booleanAdder(getAnswer(answers, 'planting_flowers_helper_materials'), 60, 0);
    const amount = 130 + Math.max(0, bedCount - 1) * 45 + materialAdder;
    return createServiceResult(service, amount, [
      { label: 'Base flower planting', amount: 130 },
      { label: 'Additional planting beds', amount: Math.max(0, bedCount - 1) * 45 },
      { label: 'Materials provision', amount: materialAdder },
    ]);
  }

  if (service.id === 'planting_trees') {
    const treeCount = parseCount(getAnswer(answers, 'planting_trees_tree_count'), 1);
    const materialAdder = optionAdder(getAnswer(answers, 'planting_trees_material_owner'), { no: 120, yes: 0 }, 0);
    const amount = 180 + Math.max(0, treeCount - 1) * 85 + materialAdder;
    return createServiceResult(service, amount, [
      { label: 'Base tree planting', amount: 180 },
      { label: 'Additional trees', amount: Math.max(0, treeCount - 1) * 85 },
      { label: 'Materials provision', amount: materialAdder },
    ]);
  }

  if (service.id === 'yard_tidy_up') {
    const amount = roundCurrency((145 + keywordAdder(getAnswer(answers, 'yard_tidy_task_mix'), [['trim', 30], ['sweep', 20], ['waste', 40]])) * areaMultiplier(getAnswer(answers, 'yard_tidy_area_size')));
    return createServiceResult(service, amount, [
      { label: 'Base yard tidy-up', amount },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function priceBeauty(service, answers = {}) {
  if (service.id === 'hairstyles') {
    const typeAdder = keywordAdder(getAnswer(answers, 'hairstyle_type'), [['updo', 70], ['wig', 120], ['weave', 140], ['bridal', 180], ['cornrow', 80]]);
    const amount = 280 + typeAdder + optionAdder(getAnswer(answers, 'hairstyle_location_type'), { another_location: 30, my_place: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base hairstyle service', amount: 280 },
      { label: 'Style complexity', amount: typeAdder },
      { label: 'Location adjustment', amount: optionAdder(getAnswer(answers, 'hairstyle_location_type'), { another_location: 30 }, 0) },
    ]);
  }

  if (service.id === 'braiding') {
    const styleAdder = keywordAdder(getAnswer(answers, 'braiding_style'), [['knotless', 180], ['feed', 120], ['box', 140], ['tribal', 160], ['cornrow', 90]]);
    const amount = 380 + styleAdder;
    return createServiceResult(service, amount, [
      { label: 'Base braiding service', amount: 380 },
      { label: 'Style complexity', amount: styleAdder },
    ]);
  }

  if (service.id === 'makeup') {
    const occasionAdder = keywordAdder(getAnswer(answers, 'makeup_occasion'), [['wedding', 220], ['bridal', 220], ['matric', 140], ['photo', 90], ['event', 60]]);
    const amount = 260 + occasionAdder;
    return createServiceResult(service, amount, [
      { label: 'Base makeup booking', amount: 260 },
      { label: 'Occasion adjustment', amount: occasionAdder },
    ]);
  }

  if (service.id === 'lashes') {
    const styleAdder = keywordAdder(getAnswer(answers, 'lash_style'), [['classic', 0], ['hybrid', 70], ['volume', 120], ['mega', 160]]);
    const amount = 220 + styleAdder;
    return createServiceResult(service, amount, [
      { label: 'Base lash set', amount: 220 },
      { label: 'Style adjustment', amount: styleAdder },
    ]);
  }

  if (service.id === 'nails') {
    const typeAdder = keywordAdder(getAnswer(answers, 'nail_service_type'), [['gel', 60], ['acrylic', 110], ['tips', 90], ['overlay', 70], ['art', 80]]);
    const amount = 210 + typeAdder;
    return createServiceResult(service, amount, [
      { label: 'Base nail service', amount: 210 },
      { label: 'Style/material adjustment', amount: typeAdder },
    ]);
  }

  if (service.id === 'manicure') {
    const amount = 160 + optionAdder(getAnswer(answers, 'manicure_finish_type'), { styled: 70, basic: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base manicure', amount: 160 },
      { label: 'Styled-finish add-on', amount: optionAdder(getAnswer(answers, 'manicure_finish_type'), { styled: 70 }, 0) },
    ]);
  }

  if (service.id === 'pedicure') {
    const amount = 180 + optionAdder(getAnswer(answers, 'pedicure_finish_type'), { styled: 80, standard: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base pedicure', amount: 180 },
      { label: 'Styled-finish add-on', amount: optionAdder(getAnswer(answers, 'pedicure_finish_type'), { styled: 80 }, 0) },
    ]);
  }

  if (service.id === 'waxing_prep') {
    const scopeAdder = keywordAdder(getAnswer(answers, 'waxing_prep_scope'), [['full', 80], ['bikini', 60], ['facial', 35]]);
    const amount = 140 + scopeAdder;
    return createServiceResult(service, amount, [
      { label: 'Base waxing prep', amount: 140 },
      { label: 'Scope adjustment', amount: scopeAdder },
    ]);
  }

  const amount = Number(service?.pricing?.basePrice || 0);
  return createServiceResult(service, amount, [{ label: 'Base service rate', amount }]);
}

function priceBarber(service, answers = {}) {
  if (service.id === 'haircut') {
    const typeAdder = keywordAdder(getAnswer(answers, 'haircut_type'), [['fade', 35], ['design', 55], ['kids', -10], ['beard', 25]]);
    const amount = 110 + typeAdder;
    return createServiceResult(service, amount, [
      { label: 'Base haircut', amount: 110 },
      { label: 'Style adjustment', amount: typeAdder },
    ]);
  }

  if (service.id === 'beard_trim') {
    const amount = 85 + optionAdder(getAnswer(answers, 'beard_trim_scope'), { full_trim: 35, shape_up: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base beard trim', amount: 85 },
      { label: 'Full-trim adjustment', amount: optionAdder(getAnswer(answers, 'beard_trim_scope'), { full_trim: 35 }, 0) },
    ]);
  }

  if (service.id === 'line_up') {
    const amount = 75 + optionAdder(getAnswer(answers, 'line_up_scope'), { hairline_and_beard: 25, hairline_only: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base line-up', amount: 75 },
      { label: 'Beard add-on', amount: optionAdder(getAnswer(answers, 'line_up_scope'), { hairline_and_beard: 25 }, 0) },
    ]);
  }

  if (service.id === 'shave') {
    const amount = 90 + optionAdder(getAnswer(answers, 'shave_scope'), { full_shave: 20, clean_up_shave: 0 }, 0);
    return createServiceResult(service, amount, [
      { label: 'Base shave', amount: 90 },
      { label: 'Full-shave adjustment', amount: optionAdder(getAnswer(answers, 'shave_scope'), { full_shave: 20 }, 0) },
    ]);
  }

  if (service.id === 'hair_dye') {
    const scopeAdder = optionAdder(getAnswer(answers, 'hair_dye_scope'), { dye_and_cut: 70, dye_only: 0 }, 0);
    const colorAdder = keywordAdder(getAnswer(answers, 'hair_dye_color'), [['bleach', 120], ['blonde', 110], ['highlight', 140], ['black', 0], ['brown', 30]]);
    const amount = 180 + scopeAdder + colorAdder;
    return createServiceResult(service, amount, [
      { label: 'Base hair dye', amount: 180 },
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
    const amount = 180 + Math.max(0, childCount - 1) * 45 + Math.max(0, hours - 3) * 35;
    return createServiceResult(service, amount, [
      { label: 'Base babysitting block', amount: 180 },
      { label: 'Additional children', amount: Math.max(0, childCount - 1) * 45 },
      { label: 'Extra hours', amount: Math.max(0, hours - 3) * 35 },
    ]);
  }

  if (service.id === 'pet_sitting') {
    const hours = Math.max(2, parseNumber(getAnswer(answers, 'pet_sitting_duration'), 3));
    const petCountAdder = keywordAdder(getAnswer(answers, 'pet_sitting_pet_type'), [['dog', 25], ['cat', 15], ['multiple', 40]]);
    const amount = 160 + Math.max(0, hours - 3) * 28 + petCountAdder;
    return createServiceResult(service, amount, [
      { label: 'Base pet sitting block', amount: 160 },
      { label: 'Extra hours', amount: Math.max(0, hours - 3) * 28 },
      { label: 'Pet handling complexity', amount: petCountAdder },
    ]);
  }

  if (service.id === 'pet_feeding') {
    const petCount = parseCount(getAnswer(answers, 'pet_feeding_pet_count'), 1);
    const frequencyAdder = keywordAdder(getAnswer(answers, 'pet_feeding_frequency'), [['twice', 20], ['three', 35], ['daily', 15]]);
    const amount = 85 + Math.max(0, petCount - 1) * 15 + frequencyAdder;
    return createServiceResult(service, amount, [
      { label: 'Base pet feeding visit', amount: 85 },
      { label: 'Additional pets', amount: Math.max(0, petCount - 1) * 15 },
      { label: 'Frequency adjustment', amount: frequencyAdder },
    ]);
  }

  if (service.id === 'house_sitting') {
    const duration = Math.max(1, parseNumber(getAnswer(answers, 'house_sitting_duration'), 1));
    const amount = 240 + Math.max(0, duration - 1) * 120 + keywordAdder(getAnswer(answers, 'house_sitting_extra_duties'), [['pet', 40], ['garden', 35], ['pool', 30]]);
    return createServiceResult(service, amount, [
      { label: 'Base first day', amount: 240 },
      { label: 'Additional days', amount: Math.max(0, duration - 1) * 120 },
      { label: 'Extra duties', amount: keywordAdder(getAnswer(answers, 'house_sitting_extra_duties'), [['pet', 40], ['garden', 35], ['pool', 30]]) },
    ]);
  }

  if (service.id === 'elder_companionship') {
    const hours = Math.max(2, parseNumber(getAnswer(answers, 'elder_support_duration'), 4));
    const scopeAdder = optionAdder(getAnswer(answers, 'elder_support_scope'), { companionship_and_assistance: 85, companionship_only: 0 }, 0);
    const amount = 220 + Math.max(0, hours - 4) * 40 + scopeAdder;
    return createServiceResult(service, amount, [
      { label: 'Base elder support block', amount: 220 },
      { label: 'Extra hours', amount: Math.max(0, hours - 4) * 40 },
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
    const amount = roundCurrency(120 * vehicleFactor);
    return createServiceResult(service, amount, [{ label: 'Exterior wash', amount }]);
  }

  if (service.id === 'interior_cleaning') {
    const dirtAdder = optionAdder(getAnswer(answers, 'interior_condition_level'), { light: 0, medium: 35, heavy: 70 }, 20);
    const amount = roundCurrency((150 + dirtAdder) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Interior cleaning base', amount: roundCurrency(150 * vehicleFactor) },
      { label: 'Condition adjustment', amount: roundCurrency(dirtAdder * vehicleFactor) },
    ]);
  }

  if (service.id === 'seat_cleaning') {
    const seatCount = parseCount(getAnswer(answers, 'seat_cleaning_seat_count'), 4);
    const stainAdder = optionAdder(getAnswer(answers, 'seat_cleaning_stain_level'), { heavy: 55, light: 0 }, 0);
    const amount = roundCurrency((110 + Math.max(0, seatCount - 4) * 18 + stainAdder) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Seat cleaning base', amount: roundCurrency(110 * vehicleFactor) },
      { label: 'Additional seats', amount: roundCurrency(Math.max(0, seatCount - 4) * 18 * vehicleFactor) },
      { label: 'Stain adjustment', amount: roundCurrency(stainAdder * vehicleFactor) },
    ]);
  }

  if (service.id === 'full_body_wash') {
    const addon = booleanAdder(getAnswer(answers, 'full_body_wash_detailing_addons'), 35, 0);
    const amount = roundCurrency((160 + addon) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Full body wash base', amount: roundCurrency(160 * vehicleFactor) },
      { label: 'Tyre/rim add-on', amount: roundCurrency(addon * vehicleFactor) },
    ]);
  }

  if (service.id === 'engine_cleaning') {
    const historyAdder = optionAdder(getAnswer(answers, 'engine_cleaning_history'), { no: 65, unknown: 35, yes: 0 }, 0);
    const amount = roundCurrency((190 + historyAdder) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Engine cleaning base', amount: roundCurrency(190 * vehicleFactor) },
      { label: 'Engine condition adjustment', amount: roundCurrency(historyAdder * vehicleFactor) },
    ]);
  }

  if (service.id === 'full_detailing') {
    const scopeAdder = optionAdder(getAnswer(answers, 'full_detailing_scope'), {
      interior_only: 0,
      exterior_only: 0,
      interior_and_exterior: 80,
    }, 40);
    const amount = roundCurrency((260 + scopeAdder) * vehicleFactor);
    return createServiceResult(service, amount, [
      { label: 'Full detailing base', amount: roundCurrency(260 * vehicleFactor) },
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

    const serviceLines = serviceBreakdown.flatMap((item) => item.lines);
    const serviceTotal = serviceBreakdown.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const total = roundCurrency(serviceTotal + travelLine.amount);

    return {
      categoryId,
      categoryLabel: category?.label || categoryId,
      estimateLabel: serviceBreakdown.length ? 'South Africa calibrated quote' : 'No services selected',
      currency,
      minimumCallout: roundCurrency(MINIMUM_TRAVEL_FEE),
      estimatedDurationMinutes: 0,
      serviceBreakdown,
      lines: [...serviceLines, travelLine],
      total,
      travelFee: travelLine.amount,
      travelRatePerKm: TRAVEL_RATE_PER_KM,
    };
  };
}
