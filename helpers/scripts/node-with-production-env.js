#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const isProductionBundle = args.includes('--dev') && args[args.indexOf('--dev') + 1] === 'false';
const env = {
  ...process.env,
  ...(isProductionBundle && !process.env.NODE_ENV ? { NODE_ENV: 'production' } : {}),
};

const result = spawnSync(process.execPath, args, {
  env,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
