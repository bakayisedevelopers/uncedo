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

test('computeBrandStampGeometry anchors compact white transparent customer logo in top-left corner', () => {
  const geom = computeBrandStampGeometry(768, 1344);
  assert.equal(geom.logoPath, CUSTOMER_LOGO_PATH);
  assert.equal(CUSTOMER_LOGO_PATH, '/customer-logo-transparent.png');
  assert.equal(geom.color, CUSTOMER_BRAND_WHITE);
  assert.equal(CUSTOMER_LOGO_COLOR, '#FFFFFF');
  assert.match(geom.shadowColor, /rgba\(0,\s*0,\s*0/);
  assert.ok(geom.width >= 100 && geom.width <= 160);
  assert.ok(geom.height >= 20 && geom.height <= 40);
  assert.ok((geom.width * geom.height) / (768 * 1344) < 0.01);
  assert.equal(geom.x, geom.padX);
  assert.equal(geom.y, geom.padY);
  assert.ok(geom.x >= 16 && geom.x < 80);
  assert.ok(geom.y >= 16 && geom.y < 80);
});

test('stampUncedoBrandMarkOnCanvas draws transparent white logo at top-left (default) and bottom-right (service gallery)', () => {
  const opsTopLeft = [];
  const fakeLogo = { naturalWidth: 512, naturalHeight: 110 };
  const fakeCtxTopLeft = {
    save: () => opsTopLeft.push(['save']),
    restore: () => opsTopLeft.push(['restore']),
    drawImage: (img, x, y, w, h) => opsTopLeft.push(['drawImage', img, x, y, w, h]),
  };

  stampUncedoBrandMarkOnCanvas(fakeCtxTopLeft, 768, 1344, fakeLogo, 'top-left');

  assert.equal(opsTopLeft[0][0], 'save');
  const topLeftCall = opsTopLeft.find((entry) => entry[0] === 'drawImage');
  assert.deepEqual(topLeftCall, ['drawImage', fakeLogo, 35, 43, 123, 26]);
  assert.equal(opsTopLeft[opsTopLeft.length - 1][0], 'restore');

  const opsBottomRight = [];
  const fakeCtxBottomRight = {
    save: () => opsBottomRight.push(['save']),
    restore: () => opsBottomRight.push(['restore']),
    drawImage: (img, x, y, w, h) => opsBottomRight.push(['drawImage', img, x, y, w, h]),
  };
  stampUncedoBrandMarkOnCanvas(fakeCtxBottomRight, 1024, 1024, fakeLogo, 'bottom-right');
  const bottomRightCall = opsBottomRight.find((entry) => entry[0] === 'drawImage');
  assert.deepEqual(bottomRightCall, ['drawImage', fakeLogo, 857, 969, 138, 30]);
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
