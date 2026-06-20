const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// 1. Force completely isolated cache store directory
config.cacheStores = [
  new FileStore({
    root: path.join(__dirname, '.metro-fresh-cache'),
  }),
];

// 2. Bypass minifier parsing crashes entirely via pass-through
config.transformer.minify = true;
config.transformer.minifierPath = path.resolve(__dirname, 'bypass-minifier.js');

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

config.resolver = {
  ...config.resolver,
  assetExts: [...(config.resolver.assetExts || []), 'onnx'],
};
module.exports = config;
