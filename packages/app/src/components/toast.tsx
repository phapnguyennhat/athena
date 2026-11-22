import { SymbolView } from 'expo-symbols';
import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError } from '@/lib/errors';
import { Pressable, Text, useCSSVariable } from '@/tw';

type Toast = { id: number; message: string; kind: 'error' | 'info' };

const SHOW_MS = 4000;
let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function show(message: string, kind: Toast['kind']) {
  // One at a time: a newer message replaces the visible one instead of stacking.
  current = { id: nextId++, message, kind };
  AccessibilityInfo.announceForAccessibility(message);
  emit();
}

/** App-wide toast. Callable from anywhere (screens, lib code); rendered by the single <Toaster/> in the root layout. */
export const toast = {
  error: (message: string) => show(message, 'error'),
  info: (message: string) => show(message, 'info'),
  /** Shows the Vietnamese copy for an API/network error (see lib/errors). */
  fromError: (e: unknown) => show(describeError(e), 'error'),
  dismiss: () => {
    current = null;
    emit();
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function Toaster() {
  const t = useSyncExternalStore(subscribe, () => current);
  const insets = useSafeAreaInsets();
  const tint = useCSSVariable('--color-tint-ink');
  const muted = useCSSVariable('--color-ink-muted');

  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => current?.id === t.id && toast.dismiss(), SHOW_MS);
    return () => clearTimeout(timer);
  }, [t]);

  if (!t) return null;
  return (
    <Animated.View
      key={t.id}
      entering={FadeInUp.duration(180)}
      exiting={FadeOutUp.duration(160)}
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 1000, elevation: 1000 }}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        accessibilityHint="Chạm để ẩn"
        onPress={toast.dismiss}
        className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-lg">
        <SymbolView
          name={
            t.kind === 'error'
              ? { ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }
              : { ios: 'info.circle.fill', android: 'info', web: 'info' }
          }
          size={22}
          tintColor={(t.kind === 'error' ? tint : muted) as string}
        />
        <Text className="flex-1 text-[15px] leading-[21px] text-ink">{t.message}</Text>
      </Pressable>
    </Animated.View>
  );
}
