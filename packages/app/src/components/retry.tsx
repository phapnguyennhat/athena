import { Pressable, Text, View } from '@/tw';

/** Shown where data failed to load (the toast already said why). */
export function Retry({ onPress, label = 'Chưa tải được dữ liệu.' }: { onPress: () => void; label?: string }) {
  return (
    <View className="items-center gap-3 py-10">
      <Text className="text-center text-[15px] text-ink-muted">{label}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} className="min-h-12 justify-center rounded-[24px] border border-line px-6 active:opacity-70">
        <Text className="text-base font-bold text-tint-ink">Thử lại</Text>
      </Pressable>
    </View>
  );
}
