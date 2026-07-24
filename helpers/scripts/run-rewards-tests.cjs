const fs = require('fs');
const Module = require('module');
const path = require('path');
const babel = require('@babel/core');

const sourceRoot = path.resolve(__dirname, '..', 'src');
const originalLoader = Module._extensions['.js'];

Module._extensions['.js'] = function loadHelperRewardModule(module, filename) {
  if (!filename.startsWith(sourceRoot)) {
    return originalLoader(module, filename);
  }
  const source = fs.readFileSync(filename, 'utf8');
  const output = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  module._compile(output.code, filename);
};

require('../src/services/rewards/__tests__/rewardPresentation.test.js');
require('../src/navigation/__tests__/rewardNavigation.test.js');
