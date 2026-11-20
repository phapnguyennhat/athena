import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedView, View, useCSSVariable } from '@/tw';

function Dot({ index, still }: { index: number; still: boolean }) {
  const opacity = useSharedValue(still ? 0.6 : 0.3);
  useEffect(() => {
    if (still) return;
    opacity.value = withDelay(index * 150, withRepeat(withTiming(1, { duration: 450 }), -1, true));
    return () => cancelAnimation(opacity);
  }, [index, still, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <AnimatedView style={style} className="h-2 w-2 rounded-full bg-ink-muted" />;
}

/** The assistant's row while a reply is on its way; same avatar as an assistant message. */
export function TypingBubble() {
  const tint = useCSSVariable('--color-tint-ink');
  const still = useReducedMotion();
  return (
    <View accessible accessibilityLabel="AI đang trả lời" accessibilityLiveRegion="polite" className="flex-row gap-3 pr-6">
      <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full border border-line bg-surface">
        <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={14} tintColor={tint as string} />
      </View>
      <View className="h-7 flex-row items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <Dot key={i} index={i} still={still} />
        ))}
      </View>
    </View>
  );
}
