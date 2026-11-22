import { RefreshControl } from 'react-native';

import { useAuth } from '@/auth';
import { ThemeToggle } from '@/components/theme-toggle';
import { useLoad } from '@/hooks/use-load';
import { getDashboard, getMe } from '@/lib/learning-api';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-h-12 flex-row items-center justify-between gap-4 px-4 py-3">
      <Text className="text-[15px] text-ink-muted">{label}</Text>
      <Text numberOfLines={1} className="shrink text-right text-[15px] font-semibold text-ink">
        {value}
      </Text>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center gap-0.5 rounded-2xl border border-line bg-surface px-2 py-4">
      <Text className="text-[26px] leading-8 font-black text-ink">{value}</Text>
      <Text className="text-center text-[12px] leading-4 text-ink-muted">{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { data, refreshing, refresh } = useLoad(() => Promise.all([getMe(), getDashboard()]));
  const [me, dash] = data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-5 pt-4 pb-32" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Text accessibilityRole="header" className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
          Hồ sơ
        </Text>
        {me ? (
          <View className="overflow-hidden rounded-2xl border border-line bg-surface">
            <Row label="Họ tên" value={me.fullName} />
            <View className="h-px bg-line" />
            <Row label="Email" value={me.email} />
          </View>
        ) : null}
        {dash ? (
          <View className="gap-2">
            <View className="flex-row gap-2">
              <Stat value={dash.streak.current} label="ngày liên tiếp" />
              <Stat value={dash.streak.longest} label="kỷ lục" />
            </View>
            <View className="flex-row gap-2">
              <Stat value={dash.totals.completedLessons} label="bài đã học" />
              <Stat value={dash.totals.quizAttempts} label="lần kiểm tra" />
              <Stat value={dash.totals.paths} label="lộ trình" />
            </View>
          </View>
        ) : null}
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
      </ScrollView>
    </SafeAreaView>
  );
}
