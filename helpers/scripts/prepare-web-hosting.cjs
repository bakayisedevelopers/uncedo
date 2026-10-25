const fs = require('node:fs');
const path = require('node:path');

const dist = path.resolve(__dirname, '..', 'dist');
const appEntry = path.join(dist, 'index.html');
const landingSource = path.resolve(__dirname, '..', 'web', 'landing.html');
const appEntryTarget = path.join(dist, 'app.html');

if (!fs.existsSync(appEntry)) {
  throw new Error('Expo web export is missing dist/index.html.');
}
if (!fs.existsSync(landingSource)) {
  throw new Error('Helpers web landing source is missing.');
}

fs.copyFileSync(appEntry, appEntryTarget);
fs.copyFileSync(landingSource, appEntry);
process.stdout.write('Prepared static Helpers landing page and Expo auth app entry.\n');
