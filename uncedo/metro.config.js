const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');
const functionsRoot = path.resolve(projectRoot, '..', 'functions');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot, functionsRoot];
config.resolver.useWatchman = false;

module.exports = config;
