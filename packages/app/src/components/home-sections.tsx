import { SymbolView } from 'expo-symbols';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Dashboard, PathSummary } from '@/lib/learning-api';
import { Pressable, Text, View } from '@/tw';

function useTint() {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'].tint;
}

export function SectionTitle({ children }: { children: string }) {
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

/** Streak: flame + count + the current Mon–Sun week. `week[i]` true = studied; `today` is the index of today. */
export function StreakCard({ days, week, today, studiedToday }: { days: number; week: boolean[]; today: number; studiedToday: boolean }) {
  const tint = useTint();
  const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
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

/** "Tiếp tục học": the resume target as the featured card, then the user's other paths as compact rows. */
export function ContinueSection({
  target,
  paths,
  onLesson,
  onPath,
}: {
  target: Dashboard['continue'];
  paths: PathSummary[];
  onLesson: (lessonId: string) => void;
  onPath: (pathId: string) => void;
}) {
  const rest = paths.filter((p) => p.id !== target?.pathId);
  return (
    <View className="gap-3">
      <SectionTitle>Tiếp tục học</SectionTitle>
      {target ? (
        <View className="rounded-3xl bg-tint p-5">
          <Text className="text-[13px] font-semibold text-on-tint opacity-70" numberOfLines={1}>
            {target.pathTitle}
          </Text>
          <Text className="mt-1 text-2xl leading-8 font-extrabold text-on-tint">{target.lessonTitle}</Text>
          <View className="mt-4 h-2 overflow-hidden rounded-full bg-on-tint/20">
            <View className="h-full rounded-full bg-on-tint" style={{ width: `${target.total ? (target.done / target.total) * 100 : 0}%` }} />
          </View>
          <Text className="mt-2 text-[13px] text-on-tint opacity-70">
            {target.done}/{target.total} bài
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tiếp tục: ${target.lessonTitle}`}
            onPress={() => onLesson(target.lessonId)}
            className="mt-4 min-h-12 items-center justify-center rounded-[24px] bg-on-tint ios:active:opacity-80">
            <Text className="text-base font-bold text-canvas">Tiếp tục</Text>
          </Pressable>
        </View>
      ) : null}
      {rest.map((p) => (
        <PathRow key={p.id} path={p} onPress={() => onPath(p.id)} />
      ))}
    </View>
  );
}

/** One path with progress; `done` paths read as finished instead of showing a next lesson. */
export function PathRow({ path, onPress, onLongPress }: { path: PathSummary; onPress: () => void; onLongPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={onLongPress ? 'Nhấn giữ để xoá' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      className="min-h-16 gap-2 rounded-2xl border border-line bg-surface p-4 active:opacity-70">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
          {path.title}
        </Text>
        <Text className="text-[13px] text-ink-muted">
          {path.done}/{path.total} bài
        </Text>
      </View>
      <ProgressBar done={path.done} total={path.total} />
      <Text className="text-[13px] text-ink-muted" numberOfLines={1}>
        {path.next ? `Tiếp theo: ${path.next.title}` : 'Đã hoàn thành lộ trình'}
      </Text>
    </Pressable>
  );
}
