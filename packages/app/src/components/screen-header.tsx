import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { Pressable, Text, View, useCSSVariable } from '@/tw';

export function IconButton({ name, label, onPress }: { name: SymbolViewProps['name']; label: string; onPress: () => void }) {
  const ink = useCSSVariable('--color-ink');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-70">
      <SymbolView name={name} size={18} tintColor={ink as string} />
    </Pressable>
  );
}

/** Back button + title (+ optional trailing action) for stack screens outside the tabs. */
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <View className="h-14 flex-row items-center gap-3 px-3">
      <IconButton
        name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
        label="Quay lại"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <Text accessibilityRole="header" numberOfLines={1} className="flex-1 text-[17px] font-bold text-ink">
        {title}
      </Text>
      {right}
    </View>
  );
}
