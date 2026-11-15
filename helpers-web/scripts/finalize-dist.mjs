import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', '..', 'helpers', 'dist');
const indexFile = path.join(distDir, 'index.html');
const appFile = path.join(distDir, 'app.html');
const iconSource = path.resolve(__dirname, '..', '..', 'helpers', 'assets', 'bakayise-helpers-icon.jpg');
const iconTarget = path.join(distDir, 'helpers-mark.jpg');

if (!fs.existsSync(indexFile)) {
  throw new Error(`Build output missing at ${indexFile}`);
}

fs.copyFileSync(indexFile, appFile);

if (fs.existsSync(iconSource)) {
  fs.copyFileSync(iconSource, iconTarget);
}

process.stdout.write(`Finalized helpers web hosting bundle at ${distDir}\n`);
