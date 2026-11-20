import { SymbolView } from 'expo-symbols';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, ScrollView, Text, View } from '@/tw';

export type ActiveCourse = {
  id: string;
  title: string;
  next: string; // next incomplete lesson
  done: number;
  total: number;
};

export type CommunityCourse = {
  id: string;
  title: string;
  author: string;
  level: string;
  lessons: number;
  cover: string; // short typographic cover mark
};

function useTint() {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'].tint;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="text-[20px] leading-7 font-extrabold text-ink">
      {children}
    </Text>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done }}
      accessibilityLabel={`${done} trên ${total} bài`}
      className="h-2 overflow-hidden rounded-full bg-well">
      <View className="h-full rounded-full bg-tint" style={{ width: `${pct}%` }} />
    </View>
  );
}

/** Streak: flame + count + the current week. `week[i]` true = studied; `today` is the index of today. */
export function StreakCard({ days, week, today }: { days: number; week: boolean[]; today: number }) {
  const tint = useTint();
  const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const studiedToday = week[today];
  return (
    <View className="rounded-3xl border border-line bg-surface p-5">
      <View className="flex-row items-center gap-3">
        <SymbolView
          name={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
          size={40}
          tintColor={tint}
        />
        <View className="flex-1">
          <Text className="text-[28px] leading-8 font-black text-ink">{days} ngày liên tiếp</Text>
          <Text className="mt-0.5 text-[14px] text-ink-muted">
            {studiedToday ? 'Hôm nay bạn đã học xong. Giữ nhịp nhé.' : 'Học một bài hôm nay để giữ chuỗi.'}
          </Text>
        </View>
      </View>
      <View className="mt-5 flex-row justify-between" accessible accessibilityLabel={`${days} ngày liên tiếp`}>
        {labels.map((d, i) => (
          <View key={d} className="items-center gap-1.5">
            <View
              className={`h-6 w-6 rounded-full ${week[i] ? 'bg-tint' : i === today ? 'border-2 border-tint' : 'border-2 border-mark-off'}`}
            />
            <Text className={`text-[12px] ${i === today ? 'font-bold text-ink' : 'text-ink-muted'}`}>{d}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** "Tiếp tục học": one featured course (the latest incomplete lesson), the rest as compact rows. */
export function ContinueSection({ courses, onOpen }: { courses: ActiveCourse[]; onOpen?: (id: string) => void }) {
  const [main, ...rest] = courses;
  if (!main) return null;
  return (
    <View className="gap-3">
      <SectionTitle>Tiếp tục học</SectionTitle>
      <View className="rounded-3xl bg-tint p-5">
        <Text className="text-[13px] font-semibold text-on-tint opacity-70">{main.title}</Text>
        <Text className="mt-1 text-2xl leading-8 font-extrabold text-on-tint">{main.next}</Text>
        <View className="mt-4 h-2 overflow-hidden rounded-full bg-on-tint/20">
          <View className="h-full rounded-full bg-on-tint" style={{ width: `${(main.done / main.total) * 100}%` }} />
        </View>
        <Text className="mt-2 text-[13px] text-on-tint opacity-70">
          {main.done}/{main.total} bài
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tiếp tục: ${main.next}`}
          onPress={() => onOpen?.(main.id)}
          className="mt-4 min-h-12 items-center justify-center rounded-[24px] bg-on-tint ios:active:opacity-80">
          <Text className="text-base font-bold text-canvas">Tiếp tục</Text>
        </Pressable>
      </View>
      {rest.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => onOpen?.(c.id)}
          className="min-h-16 gap-2 rounded-2xl border border-line bg-surface p-4 active:opacity-70">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
              {c.title}
            </Text>
            <Text className="text-[13px] text-ink-muted">
              {c.done}/{c.total} bài
            </Text>
          </View>
          <ProgressBar done={c.done} total={c.total} />
        </Pressable>
      ))}
    </View>
  );
}

/** "Từ cộng đồng": horizontal rail of typographic-cover tiles. */
export function CommunityRail({ courses, onOpen }: { courses: CommunityCourse[]; onOpen?: (id: string) => void }) {
  return (
    <View className="gap-3">
      <View className="mr-5 ml-5 flex-row items-baseline justify-between">
        <SectionTitle>Từ cộng đồng</SectionTitle>
        <Text className="text-[12px] text-ink-muted">Ví dụ</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-5">
        {courses.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`${c.title}, của ${c.author}, ${c.lessons} bài`}
            onPress={() => onOpen?.(c.id)}
            className="w-44 overflow-hidden rounded-2xl border border-line bg-surface active:opacity-70">
            <View className="h-24 items-center justify-center bg-well">
              <Text className="text-[40px] leading-[48px] font-black tracking-[-1px] text-tint-ink">{c.cover}</Text>
            </View>
            <View className="gap-1 p-3.5">
              <Text className="text-[15px] leading-5 font-bold text-ink" numberOfLines={2}>
                {c.title}
              </Text>
              <Text className="text-[13px] text-ink-muted" numberOfLines={1}>
                {c.author}
              </Text>
              <Text className="text-[13px] text-ink-muted">
                {c.level} · {c.lessons} bài
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
