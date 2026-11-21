import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHelperApprovedMasteryList,
  buildMasteryProgressModel,
  buildServiceOptionMasteryKey,
  DEFAULT_MASTERY_CONFIG,
  resolveOfferingMastery,
} from './masteryModel.js';

test('buildServiceOptionMasteryKey builds backend-aligned option keys', () => {
  assert.equal(buildServiceOptionMasteryKey('cleaning', 'deep-clean'), 'cleaning__deep-clean');
  assert.equal(buildServiceOptionMasteryKey('plumbing', 'Tap Repair'), 'plumbing__tap_repair');
  assert.equal(buildServiceOptionMasteryKey('plumbing', ''), 'plumbing');
});

test('resolveOfferingMastery keeps options under same service strictly independent', () => {
  const optionMap = new Map([
    [
      'plumbing__leak_repair',
      {
        id: 'plumbing__leak_repair',
        serviceId: 'plumbing',
        optionId: 'leak_repair',
        level: 'master',
        highestLevel: 'master',
        eligibleCompletedJobCount: 215,
        averageRating: 4.88,
        ratingCount: 54,
      },
    ],
  ]);

  const serviceMap = new Map([
    [
      'plumbing',
      {
        id: 'plumbing',
        serviceId: 'plumbing',
        level: 'master',
        eligibleCompletedJobCount: 215,
        averageRating: 4.88,
        ratingCount: 54,
      },
    ],
  ]);

  const leakOffering = {
    id: 'h1_plumbing__leak_repair',
    serviceId: 'plumbing',
    serviceName: 'Plumbing',
    optionId: 'leak_repair',
    optionTitle: 'Leak Repair',
    status: 'approved',
    approved: true,
  };
  const geyserOffering = {
    id: 'h1_plumbing__geyser_install',
    serviceId: 'plumbing',
    serviceName: 'Plumbing',
    optionId: 'geyser_install',
    optionTitle: 'Geyser Installation',
    status: 'approved',
    approved: true,
  };

  const leakMastery = resolveOfferingMastery({
    offering: leakOffering,
    serviceOptionMasteryMap: optionMap,
    serviceMasteryMap: serviceMap,
  });
  const geyserMastery = resolveOfferingMastery({
    offering: geyserOffering,
    serviceOptionMasteryMap: optionMap,
    serviceMasteryMap: serviceMap,
  });

  assert.equal(leakMastery.level, 'master');
  assert.equal(leakMastery.eligibleCompletedJobCount, 215);
  assert.equal(leakMastery.source, 'service_option');

  // Must NOT inherit Leak Repair's service roll-up into Geyser Installation!
  assert.equal(geyserMastery.level, 'beginner');
  assert.equal(geyserMastery.eligibleCompletedJobCount, 0);
  assert.equal(geyserMastery.source, 'default');
});

test('resolveOfferingMastery falls back to service rollup only for optionless offerings', () => {
  const serviceMap = new Map([
    [
      'lawn_care',
      {
        id: 'lawn_care',
        serviceId: 'lawn_care',
        level: 'specialist',
        eligibleCompletedJobCount: 64,
        averageRating: 4.72,
        ratingCount: 15,
      },
    ],
  ]);

  const resolved = resolveOfferingMastery({
    offering: {
      id: 'h1_lawn_care',
      serviceId: 'lawn_care',
      serviceName: 'Lawn Care',
      optionId: '',
      status: 'approved',
      approved: true,
    },
    serviceOptionMasteryMap: new Map(),
    serviceMasteryMap: serviceMap,
  });

  assert.equal(resolved.level, 'specialist');
  assert.equal(resolved.eligibleCompletedJobCount, 64);
  assert.equal(resolved.source, 'service_rollup');
});

test('buildMasteryProgressModel computes next tier requirements cleanly', () => {
  const progress = buildMasteryProgressModel({
    mastery: {
      level: 'beginner',
      eligibleCompletedJobCount: 25,
      averageRating: 4.7,
      ratingCount: 5,
    },
    masteryConfig: DEFAULT_MASTERY_CONFIG,
  });

  assert.equal(progress.nextLevel, 'specialist');
  assert.equal(progress.requirements[0].met, false);
  assert.equal(progress.requirements[0].targetValue, 50);
  assert.equal(progress.requirements[1].met, true);
  assert.equal(progress.requirements[2].met, false);
});

test('buildHelperApprovedMasteryList filters to approved offerings and sorts by highest rank first', () => {
  const optionMap = new Map([
    ['cleaning__standard', { level: 'specialist', eligibleCompletedJobCount: 55, averageRating: 4.65, ratingCount: 14 }],
  ]);

  const list = buildHelperApprovedMasteryList({
    offerings: [
      { id: '1', serviceId: 'cleaning', serviceName: 'Cleaning', optionId: 'standard', optionTitle: 'Standard', status: 'approved', approved: true },
      { id: '2', serviceId: 'cleaning', serviceName: 'Cleaning', optionId: 'move_out', optionTitle: 'Move-out', status: 'approved', approved: true },
      { id: '3', serviceId: 'painting', serviceName: 'Painting', optionId: 'interior', optionTitle: 'Interior', status: 'pending', approved: false },
    ],
    serviceOptionMasteryMap: optionMap,
  });

  assert.equal(list.length, 2);
  assert.equal(list[0].optionTitle, 'Standard');
  assert.equal(list[0].mastery.level, 'specialist');
  assert.equal(list[1].optionTitle, 'Move-out');
  assert.equal(list[1].mastery.level, 'beginner');
});
