const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, '..', 'node_modules', 'expo', 'node_modules', 'expo-modules-core', 'android', 'CMakeLists.txt'),
  path.join(__dirname, '..', 'node_modules', 'expo-modules-core', 'android', 'CMakeLists.txt'),
];

const target = candidates.find((candidate) => fs.existsSync(candidate));

if (!target) {
  console.warn('[fix-expo-modules-core-cpp-runtime] Missing expo-modules-core Android CMakeLists.txt');
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');

if (original.includes('c++_shared')) {
  process.exit(0);
}

const needle = /(\n\s+android\n)(\s+\$\{JSEXECUTOR_LIB\})/;
if (!needle.test(original)) {
  throw new Error(
    '[fix-expo-modules-core-cpp-runtime] Could not find the expo-modules-core link block to patch.',
  );
}

const patched = original.replace(needle, '$1  c++_shared\n$2');

fs.writeFileSync(target, patched);
console.log(`[fix-expo-modules-core-cpp-runtime] Patched ${target}`);
