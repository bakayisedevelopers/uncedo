import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BRAND_STAMP_CHAR,
  CUSTOMER_APP_GREEN,
  computeBrandStampGeometry,
  stampUncedoBrandMarkOnCanvas,
} from './aiImageBranding.js';

test('computeBrandStampGeometry anchors small green ô mark in bottom-right corner', () => {
  const geom = computeBrandStampGeometry(1024, 1024);
  assert.equal(geom.char, 'ô');
  assert.equal(BRAND_STAMP_CHAR, 'ô');
  assert.equal(geom.color, CUSTOMER_APP_GREEN);
  assert.equal(CUSTOMER_APP_GREEN, '#10b981');
  assert.ok(geom.x > 960 && geom.x < 1024);
  assert.ok(geom.y > 960 && geom.y < 1024);
  assert.ok(geom.fontSize >= 48 && geom.fontSize <= 80);
});

test('stampUncedoBrandMarkOnCanvas renders green ô at computed bottom-right coordinates', () => {
  const ops = [];
  const fakeCtx = {
    save: () => ops.push(['save']),
    restore: () => ops.push(['restore']),
    strokeText: (text, x, y) => ops.push(['strokeText', text, x, y, fakeCtx.strokeStyle]),
    fillText: (text, x, y) => ops.push(['fillText', text, x, y, fakeCtx.fillStyle]),
  };

  stampUncedoBrandMarkOnCanvas(fakeCtx, 1024, 1024);

  assert.equal(ops[0][0], 'save');
  assert.deepEqual(
    ops.find((entry) => entry[0] === 'fillText'),
    ['fillText', 'ô', 1024 - 33, 1024 - 25, '#10b981'],
  );
  assert.equal(ops[ops.length - 1][0], 'restore');
});
