import { ProgressBar } from '@/components/home-sections';
import { ACTIVE } from '@/lib/sample-courses';
import { Pressable, SafeAreaView, ScrollView, Text } from '@/tw';

export default function CoursesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView contentContainerClassName="gap-3 px-5 pt-4 pb-32">
        <Text accessibilityRole="header" className="mb-2 text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
          Khoá học của tôi
        </Text>
        {ACTIVE.length === 0 ? (
          <Text className="text-[15px] leading-[22px] text-ink-muted">
            Bạn chưa có lộ trình nào. Chọn tab Tạo để bắt đầu.
          </Text>
        ) : null}
        {ACTIVE.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            className="gap-2 rounded-2xl border border-line bg-surface p-4 active:opacity-70">
            <Text className="text-[17px] font-bold text-ink">{c.title}</Text>
            <Text className="text-[14px] text-ink-muted">Tiếp theo: {c.next}</Text>
            <ProgressBar done={c.done} total={c.total} />
            <Text className="text-[13px] text-ink-muted">
              {c.done}/{c.total} bài
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
