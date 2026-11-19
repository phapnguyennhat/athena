// CSS-enabled (className) wrappers, from expo/examples with-tailwindcss. Add more wrappers here as screens need them.
import { Link as RouterLink } from 'expo-router';
import React from 'react';
import {
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
} from 'react-native';
import { useCssElement as useCssElementTyped, useNativeVariable as useFunctionalVariable } from 'react-native-css';
import Animated from 'react-native-reanimated';
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';

// Inferring RN 0.88 component types through useCssElement's const generics exceeds TS's union limit,
// so call it untyped here; each wrapper's own props signature keeps call sites fully typed.
const useCssElement = useCssElementTyped as (
  component: React.ComponentType<any>,
  props: object,
  mapping: Record<string, string>,
) => React.ReactElement;

export const Link = (props: React.ComponentProps<typeof RouterLink> & { className?: string }) => {
  return useCssElement(RouterLink, props, { className: 'style' });
};

Link.Trigger = RouterLink.Trigger;
Link.Menu = RouterLink.Menu;
Link.MenuAction = RouterLink.MenuAction;
Link.Preview = RouterLink.Preview;

/** Read a theme CSS variable (e.g. '--color-canvas') from JS, for APIs that need a raw colour. */
export const useCSSVariable =
  process.env.EXPO_OS !== 'web' ? useFunctionalVariable : (variable: string) => `var(${variable})`;

export const View = (props: React.ComponentProps<typeof RNView> & { className?: string }) => {
  return useCssElement(RNView, props, { className: 'style' });
};
View.displayName = 'CSS(View)';

export const Text = (props: React.ComponentProps<typeof RNText> & { className?: string }) => {
  return useCssElement(RNText, props, { className: 'style' });
};
Text.displayName = 'CSS(Text)';

export const ScrollView = (
  props: React.ComponentProps<typeof RNScrollView> & {
    className?: string;
    contentContainerClassName?: string;
  },
) => {
  return useCssElement(RNScrollView, props, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
  });
};
ScrollView.displayName = 'CSS(ScrollView)';

export const Pressable = (props: React.ComponentProps<typeof RNPressable> & { className?: string }) => {
  return useCssElement(RNPressable, props, { className: 'style' });
};
Pressable.displayName = 'CSS(Pressable)';

export const TextInput = React.forwardRef<
  React.ComponentRef<typeof RNTextInput>,
  React.ComponentProps<typeof RNTextInput> & { className?: string }
>(function TextInput(props, ref) {
  return useCssElement(RNTextInput, { ...props, ref }, { className: 'style' });
});
TextInput.displayName = 'CSS(TextInput)';

type AnimatedViewProps = React.ComponentProps<typeof Animated.View>;

export const AnimatedView = (props: AnimatedViewProps & { className?: string }) => {
  return useCssElement(Animated.View, props, { className: 'style' });
};
AnimatedView.displayName = 'CSS(AnimatedView)';

export const SafeAreaView = (
  props: React.ComponentProps<typeof RNSafeAreaView> & { className?: string },
) => {
  return useCssElement(RNSafeAreaView, props, { className: 'style' });
};
SafeAreaView.displayName = 'CSS(SafeAreaView)';
