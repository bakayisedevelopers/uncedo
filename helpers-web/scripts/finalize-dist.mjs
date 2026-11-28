import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', '..', 'helpers', 'dist');
const indexFile = path.join(distDir, 'index.html');
const appFile = path.join(distDir, 'app.html');

if (!fs.existsSync(indexFile)) {
  throw new Error(`Build output missing at ${indexFile}`);
}

const assetsDir = path.join(distDir, 'assets');
const jsFiles = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).filter((file) => file.endsWith('.js'))
  : [];
const bundleText = jsFiles
  .map((file) => fs.readFileSync(path.join(assetsDir, file), 'utf8'))
  .join('\n');

if (!bundleText.includes('.firebaseapp.com') || !bundleText.includes(':web:')) {
  throw new Error('Firebase configuration missing from helpers-web production bundle. Check helpers-web/.env for VITE_FIREBASE_* variables.');
}

fs.copyFileSync(indexFile, appFile);

process.stdout.write(`Finalized helpers web hosting bundle at ${distDir}\n`);
