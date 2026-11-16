import { Image } from 'expo-image';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Owl mark rendered from assets/brand/athena-owl-*.svg; the eyes are cut in the ground colour, so each theme has its own PNG.
const OWL = {
  light: require('@/assets/brand/athena-owl-light.png'),
  dark: require('@/assets/brand/athena-owl-dark.png'),
};

/** Athena logo (owl mark only). Carries the app name for screen readers since there is no wordmark. */
export function BrandMark() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <Image
      source={OWL[scheme]}
      style={{ width: 28, height: 28 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Athena"
    />
  );
}
