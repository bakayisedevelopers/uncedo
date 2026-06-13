const fs = require('fs');
const path = require('path');

const PLACEHOLDER = '__GOOGLE_MAPS_API_KEY__';
const root = path.resolve(__dirname, '..');
const shouldFailWithoutKey = String(process.env.EAS_BUILD || '').toLowerCase() === 'true'
  || String(process.env.CI || '').toLowerCase() === 'true';

const files = [
  path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  path.join(root, 'ios', 'Uncedo', 'AppDelegate.swift'),
];

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
  ...readEnvFile(path.join(root, '.env')),
  ...process.env,
};

const apiKey = String(
  envValues.GOOGLE_MAPS_API_KEY
  || envValues.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '',
).trim();

function replaceInFile(filePath, transform) {
  const current = fs.readFileSync(filePath, 'utf8');
  const replaced = transform(current);
  if (replaced !== current) {
    fs.writeFileSync(filePath, replaced, 'utf8');
  }
}

function updateAndroidManifest(contents) {
  return contents.replace(
    /(<meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value=")([^"]*)(")/,
    `$1${apiKey}$3`,
  );
}

function updateIosAppDelegate(contents) {
  return contents.replace(
    /(GMSServices\.provideAPIKey\(")([^"]*)("\))/,
    `$1${apiKey}$3`,
  );
}

if (!apiKey) {
  const message = 'GOOGLE_MAPS_API_KEY is missing. Set it in EAS secrets or your local environment before building.';
  if (shouldFailWithoutKey) {
    throw new Error(message);
  }
  console.warn(`[google-maps-config] ${message}`);
  process.exit(0);
}

for (const file of files) {
  if (file.endsWith('AndroidManifest.xml')) {
    replaceInFile(file, updateAndroidManifest);
  } else {
    replaceInFile(file, updateIosAppDelegate);
  }
}

console.log('[google-maps-config] Google Maps API key injected into native build files.');
