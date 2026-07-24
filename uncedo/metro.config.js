const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot];
config.resolver.useWatchman = false;

module.exports = config;
