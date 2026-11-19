import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';

import { StateMark } from '@/components/state-mark';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Text, View } from '@/tw';

function DemoCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-1 rounded-3xl border border-line bg-surface p-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-bold tracking-[0.5px] text-tint-ink">{label}</Text>
        <Text className="text-[12px] text-ink-muted">Ví dụ</Text>
      </View>
      {children}
    </View>
  );
}

function PathDemo() {
  const modules = [
    { title: 'Nền tảng', meta: '4 bài · đã xong', state: 'done' },
    { title: 'Kiểu dữ liệu', meta: '5 bài · đang học', state: 'progress' },
    { title: 'Generics', meta: '3 bài', state: 'todo' },
  ] as const;
  return (
    <DemoCard label="LỘ TRÌNH SOẠN RIÊNG">
      <Text className="mt-1.5 text-2xl font-extrabold text-ink">TypeScript cho người mới</Text>
      <View className="mt-4 gap-2.5">
        {modules.map((m) => (
          <View key={m.title} className="flex-row items-center gap-3 rounded-2xl bg-well pt-3 pr-3.5 pb-3 pl-3.5">
            <StateMark state={m.state} />
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">{m.title}</Text>
              <Text className="mt-0.5 text-[13px] text-ink-muted">{m.meta}</Text>
            </View>
          </View>
        ))}
      </View>
    </DemoCard>
  );
}

function LessonDemo() {
  return (
    <DemoCard label="BÀI HỌC">
      <Text className="mt-1.5 text-[13px] text-ink-muted">TypeScript · Bài 3</Text>
      <Text className="mt-1 text-2xl font-extrabold text-ink">Union type</Text>
      <Text className="mt-3 text-[15px] leading-[22px] text-ink">
        Kiểu string | number nghĩa là giá trị có thể là chuỗi hoặc số. TypeScript bắt bạn kiểm tra kiểu trước khi dùng.
      </Text>
      <View className="mt-4 rounded-2xl bg-well p-3.5">
        <Text className="text-[13px] font-semibold text-ink-muted">Ý chính</Text>
        <Text className="mt-1 text-[15px] leading-[22px] text-ink">Dùng typeof để thu hẹp kiểu trong từng nhánh.</Text>
      </View>
    </DemoCard>
  );
}

function QuizDemo() {
  const options = ['true', '42', 'null'];
  return (
    <DemoCard label="QUIZ">
      <Text className="mt-2 text-[17px] leading-6 font-semibold text-ink">
        Giá trị nào hợp lệ với kiểu string | number?
      </Text>
      <View className="mt-3 gap-2">
        {options.map((o) => {
          const correct = o === '42';
          return (
            <View
              key={o}
              className={`flex-row items-center justify-between rounded-xl pt-3 pr-3.5 pb-3 pl-3.5 ${correct ? 'border-2 border-tint' : 'border border-line'}`}>
              <Text className="text-[15px] text-ink">{o}</Text>
              {correct && <Text className="text-[15px] font-bold text-tint-ink">Đúng</Text>}
            </View>
          );
        })}
      </View>
      <Text className="mt-3 text-[14px] leading-[21px] text-ink-muted">
        42 là number, thuộc union nên hợp lệ.
      </Text>
    </DemoCard>
  );
}

function StreakDemo() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const week = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  return (
    <DemoCard label="CHUỖI NGÀY HỌC">
      <View className="flex-1 items-center justify-center">
        <SymbolView
          name={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
          size={64}
          tintColor={Colors[scheme].tint}
        />
        <Text className="mt-2 text-5xl font-black text-ink">5 ngày</Text>
        <Text className="text-base text-ink-muted">liên tiếp</Text>
      </View>
      <View className="flex-row justify-between">
        {week.map((d, i) => (
          <View key={d} className="items-center gap-1.5">
            <View className={`h-6 w-6 rounded-full ${i < 5 ? 'bg-tint' : 'border-2 border-mark-off'}`} />
            <Text className="text-[12px] text-ink-muted">{d}</Text>
          </View>
        ))}
      </View>
    </DemoCard>
  );
}

export const DEMO_SLIDES = [
  {
    key: 'path',
    Card: PathDemo,
    title: 'Nói mục tiêu, nhận lộ trình.',
    body: 'Athena chia chủ đề thành module và bài học ngắn, theo trình độ của bạn.',
  },
  {
    key: 'lesson',
    Card: LessonDemo,
    title: 'Bài học vừa đủ ngắn.',
    body: 'Lý thuyết, ví dụ và ý chính, đọc gọn trên điện thoại. Kèm video tham khảo khi tìm được.',
  },
  {
    key: 'quiz',
    Card: QuizDemo,
    title: 'Quiz để biết mình đã hiểu.',
    body: 'Câu hỏi bám sát bài học, có giải thích ngay sau khi trả lời.',
  },
  {
    key: 'streak',
    Card: StreakDemo,
    title: 'Học mỗi ngày, giữ chuỗi.',
    body: 'Xong một bài hoặc một quiz là tính một ngày học. Tiến độ luôn hiện rõ.',
  },
] as const;
