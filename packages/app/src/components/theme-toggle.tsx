import { SymbolView } from 'expo-symbols';
import { Appearance } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable } from '@/tw';

/** Flips light/dark for the whole app (CSS variables and navigation both follow Appearance). */
// shortcut: the choice is not persisted, so a relaunch follows the system again; store it once settings exist.
export function ThemeToggle() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const next = scheme === 'dark' ? 'light' : 'dark';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={next === 'dark' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
      onPress={() => Appearance.setColorScheme(next)}
      hitSlop={4}
      className="h-12 w-12 items-center justify-center rounded-full active:opacity-60">
      <SymbolView
        name={
          scheme === 'dark'
            ? { ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' }
            : { ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' }
        }
        size={22}
        tintColor={Colors[scheme].text}
      />
    </Pressable>
  );
}
