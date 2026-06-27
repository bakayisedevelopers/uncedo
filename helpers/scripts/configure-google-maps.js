const fs = require('fs');
const path = require('path');

const PLACEHOLDER = '__GOOGLE_MAPS_API_KEY__';
const root = path.resolve(__dirname, '..');
const mode = String(process.argv[2] || 'inject').trim().toLowerCase();
const shouldFailWithoutKey = String(process.env.EAS_BUILD || '').toLowerCase() === 'true'
  || String(process.env.CI || '').toLowerCase() === 'true';

// TODO: The helper app currently only checks in Android native files. If an ios/ project is added,
// wire Google Maps there explicitly instead of assuming the Android setup is sufficient.
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const runtimeEnvPath = path.join(root, '.env.local');
const runtimeEnvStartMarker = '# >>> google-maps-runtime >>>';
const runtimeEnvEndMarker = '# <<< google-maps-runtime <<<';

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
  ...readEnvFile(path.join(root, '..', 'uncedo', '.env.local')),
  ...readEnvFile(path.join(root, '.env')),
  ...readEnvFile(path.join(root, '.env.local')),
  ...process.env,
};

const apiKey = String(
  envValues.GOOGLE_MAPS_API_KEY
  || envValues.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || '',
).trim();

function updateRuntimeEnvFile() {
  const current = fs.existsSync(runtimeEnvPath)
    ? fs.readFileSync(runtimeEnvPath, 'utf8')
    : '';
  const blockPattern = new RegExp(
    `${runtimeEnvStartMarker}[\\s\\S]*?${runtimeEnvEndMarker}\\r?\\n?`,
    'g',
  );
  const sanitized = current.replace(blockPattern, '').replace(/\s+$/g, '');

  if (mode === 'restore') {
    if (sanitized) {
      fs.writeFileSync(runtimeEnvPath, `${sanitized}\n`, 'utf8');
    } else if (fs.existsSync(runtimeEnvPath)) {
      fs.unlinkSync(runtimeEnvPath);
    }
    return;
  }

  const runtimeBlock = [
    runtimeEnvStartMarker,
    `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=${apiKey}`,
    runtimeEnvEndMarker,
  ].join('\n');
  const next = sanitized ? `${sanitized}\n${runtimeBlock}\n` : `${runtimeBlock}\n`;
  fs.writeFileSync(runtimeEnvPath, next, 'utf8');
}

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

updateRuntimeEnvFile();

if (mode === 'restore') {
  console.log('[google-maps-config] Google Maps placeholder restored in helper AndroidManifest.xml and runtime env.');
} else {
  console.log('[google-maps-config] Google Maps API key injected into helper AndroidManifest.xml and runtime env.');
}
