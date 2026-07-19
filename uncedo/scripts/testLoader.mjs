/**
 * scripts/testLoader.mjs
 *
 * A minimal Node ESM loader for running reward unit tests without the full
 * Expo / Metro / Firebase SDK stack. It intercepts imports that would fail
 * in a bare Node environment (RN imports, Firebase, Expo-specific modules,
 * extensionless relative paths) and stubs them out so that the pure-logic
 * functions in rewardPresentation.js, pendingReferralStore.js, and
 * navigationLinking.js can be exercised in isolation.
 *
 * Usage:
 *   node --loader ./scripts/testLoader.mjs --test <files>
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as pathResolve, dirname } from 'node:path';

const STUB_SPECIFIERS = new Set([
  '@react-native-async-storage/async-storage',
  'react-native',
  'firebase/app',
  'firebase/auth',
  'firebase/firestore',
  'firebase/database',
  'firebase/storage',
  'expo-clipboard',
  'expo-location',
  '@expo/vector-icons',
]);

// Resolve the stub file path correctly on all platforms, including Windows.
const loaderDir = dirname(fileURLToPath(import.meta.url));
const STUB_PATH = pathResolve(loaderDir, 'testStub.mjs');
const STUB_URL = pathToFileURL(STUB_PATH).href;

export function resolve(specifier, context, nextResolve) {
  // Stub known-problem packages.
  if (STUB_SPECIFIERS.has(specifier)) {
    return { shortCircuit: true, url: STUB_URL };
  }

  // For relative imports without an extension, try appending .js
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!specifier.match(/\.\w+$/)) {
      const parentPath = context.parentURL
        ? fileURLToPath(context.parentURL)
        : process.cwd();
      const dir = dirname(parentPath);
      const candidateJs = pathResolve(dir, specifier + '.js');
      if (existsSync(candidateJs)) {
        return { shortCircuit: true, url: pathToFileURL(candidateJs).href };
      }
    }
  }

  return nextResolve(specifier, context);
}
