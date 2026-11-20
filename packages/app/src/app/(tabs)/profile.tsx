import { useAuth } from '@/auth';
import { ThemeToggle } from '@/components/theme-toggle';
import { Pressable, SafeAreaView, Text, View } from '@/tw';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="gap-5 px-5 pt-4">
        <Text accessibilityRole="header" className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
          Hồ sơ
        </Text>
        <View className="flex-row items-center justify-between rounded-2xl border border-line bg-surface py-1 pr-2 pl-4">
          <Text className="text-base text-ink">Giao diện sáng / tối</Text>
          <ThemeToggle />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => signOut()}
          className="min-h-14 items-center justify-center rounded-[28px] border border-line active:opacity-70">
          <Text className="text-base font-bold text-tint-ink">Đăng xuất</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
