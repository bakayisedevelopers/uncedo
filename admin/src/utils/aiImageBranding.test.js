import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOMER_BRAND_WHITE,
  CUSTOMER_LOGO_COLOR,
  CUSTOMER_LOGO_PATH,
  aliasCleanReferenceImage,
  clearCleanReferenceImageCache,
  computeBrandStampGeometry,
  rememberCleanReferenceImage,
  resolveCleanReferenceImageUrl,
  stampUncedoBrandMarkOnCanvas,
} from './aiImageBranding.js';

test('computeBrandStampGeometry anchors compact white transparent customer logo in bottom-right corner', () => {
  const geom = computeBrandStampGeometry(1024, 1024);
  assert.equal(geom.logoPath, CUSTOMER_LOGO_PATH);
  assert.equal(CUSTOMER_LOGO_PATH, '/customer-logo-transparent.png');
  assert.equal(geom.color, CUSTOMER_BRAND_WHITE);
  assert.equal(CUSTOMER_LOGO_COLOR, '#FFFFFF');
  assert.match(geom.shadowColor, /rgba\(0,\s*0,\s*0/);
  assert.ok(geom.width >= 110 && geom.width <= 160);
  assert.ok(geom.height >= 24 && geom.height <= 40);
  assert.ok((geom.width * geom.height) / (1024 * 1024) < 0.01);
  assert.ok(geom.x > 800 && geom.x + geom.width < 1024);
  assert.ok(geom.y > 930 && geom.y + geom.height < 1024);
});

test('stampUncedoBrandMarkOnCanvas draws transparent white logo at computed bottom-right bounds', () => {
  const ops = [];
  const fakeLogo = { naturalWidth: 512, naturalHeight: 110 };
  const fakeCtx = {
    save: () => ops.push(['save']),
    restore: () => ops.push(['restore']),
    drawImage: (img, x, y, w, h) => ops.push(['drawImage', img, x, y, w, h]),
  };

  stampUncedoBrandMarkOnCanvas(fakeCtx, 1024, 1024, fakeLogo);

  assert.equal(ops[0][0], 'save');
  const drawCall = ops.find((entry) => entry[0] === 'drawImage');
  assert.deepEqual(drawCall, ['drawImage', fakeLogo, 857, 969, 138, 30]);
  assert.equal(ops[ops.length - 1][0], 'restore');
});

test('resolveCleanReferenceImageUrl returns raw unstamped image across stamped previews and saved HTTPS URLs', () => {
  clearCleanReferenceImageCache();
  const raw = 'data:image/jpeg;base64,RAW_UNSTAMPED';
  const stamped = 'data:image/jpeg;base64,STAMPED_PREVIEW';
  const uploaded = 'https://firebasestorage.googleapis.com/v0/b/app/o/saved.jpg';

  rememberCleanReferenceImage(stamped, raw);
  assert.equal(resolveCleanReferenceImageUrl(stamped), raw);

  aliasCleanReferenceImage(stamped, uploaded);
  assert.equal(resolveCleanReferenceImageUrl(uploaded), raw);
  assert.equal(resolveCleanReferenceImageUrl('https://example.com/other.jpg'), 'https://example.com/other.jpg');
});
