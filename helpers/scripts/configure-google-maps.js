const fs = require('fs');
const path = require('path');

const PLACEHOLDER = '__GOOGLE_MAPS_API_KEY__';
const root = path.resolve(__dirname, '..');
const mode = String(process.argv[2] || 'inject').trim().toLowerCase();
const shouldFailWithoutKey = String(process.env.EAS_BUILD || '').toLowerCase() === 'true'
  || String(process.env.CI || '').toLowerCase() === 'true';

const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .reduce((accumulator, line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return accumulator;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
}

const envValues = {
  ...readEnvFile(path.join(root, '..', 'uncedo', '.env')),
  ...readEnvFile(path.join(root, '.env')),
  ...process.env,
};

const apiKey = String(
  envValues.GOOGLE_MAPS_API_KEY
  || envValues.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '',
).trim();

if (mode !== 'restore' && !apiKey) {
  const message = 'GOOGLE_MAPS_API_KEY is missing. Set it in EAS secrets or your local environment before building.';
  if (shouldFailWithoutKey) {
    throw new Error(message);
  }
  console.warn(`[google-maps-config] ${message}`);
  process.exit(0);
}

const current = fs.readFileSync(manifestPath, 'utf8');
const next = current.replace(
  /(<meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value=")([^"]*)(")/,
  `$1${mode === 'restore' ? PLACEHOLDER : apiKey}$3`,
);

if (next !== current) {
  fs.writeFileSync(manifestPath, next, 'utf8');
}

if (mode === 'restore') {
  console.log('[google-maps-config] Google Maps placeholder restored in helper AndroidManifest.xml.');
} else {
  console.log('[google-maps-config] Google Maps API key injected into helper AndroidManifest.xml.');
}
