const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../shared'), path.resolve(__dirname, '../node_modules')];
// Each app resolves its own React installation; shared modules never import React.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../node_modules')];
module.exports = config;
