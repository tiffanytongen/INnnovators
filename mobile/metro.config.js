// Let the app import the shared, dependency-free logic in ../lib (scenario matching, trigger verification, UI strings).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const root = path.resolve(__dirname, "..");
config.watchFolders = [path.join(root, "lib")];
config.resolver.nodeModulesPaths = [path.join(__dirname, "node_modules"), path.join(root, "node_modules")];
module.exports = config;
