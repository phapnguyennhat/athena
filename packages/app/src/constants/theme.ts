/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import { Platform } from 'react-native';

// Athena palette for JS consumers (navigation theme, native tabs, icon tints). Screens style with Tailwind
// classes; the source of truth is src/global.css: change both together.
export const Colors = {
  light: {
    text: '#0E0E10',
    background: '#F7F7F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F0F0ED',
    textSecondary: '#5E5E66',
    tint: '#FF4D3D',
    tintText: '#C8321F',
  },
  dark: {
    text: '#FFFFFF',
    background: '#0E0E10',
    backgroundElement: '#18181C',
    backgroundSelected: '#2A2A30',
    textSecondary: '#A6A6AE',
    tint: '#FF4D3D',
    tintText: '#FF6A5C',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
