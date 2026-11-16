const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// inlineVariables: true resolves static theme values (spacing, sizes) at build time; runtime calc(var())
// does not resolve on device. Colours that change with dark mode stay variables either way.
module.exports = withNativewind(config, {
  inlineVariables: true,
  globalClassNamePolyfill: false,
});
