const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

// Modern Expo natively detects the monorepo root automatically.
const config = getDefaultConfig(__dirname);

// Wrap with NativeWind and point to your global CSS file
// (Adjust the path if your global.css is inside an src/ or app/ folder)
module.exports = withNativewind(config);