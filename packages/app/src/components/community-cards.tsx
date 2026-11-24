import { Image } from 'expo-image';

import type { CommunityPath } from '@/lib/community-api';
import { LEVEL_LABEL } from '@/lib/learning-paths-api';
import { Pressable, ScrollView, Text, View } from '@/tw';

/** "Dữ liệu & AI" → "DA": the first letters of the category's first two words, for a typographic cover. */
const initials = (name?: string) =>
  (name ?? '')
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '·';

/** "Dữ liệu & AI · Cơ bản · 12 bài", skipping what the course lacks. */
const meta = (c: CommunityPath, withCategory: boolean) =>
  [withCategory && c.category?.name, c.level && LEVEL_LABEL[c.level], `${c.lessonCount} bài`].filter(Boolean).join(' · ');

/** Rail tile: typographic cover from the category, title, level · lesson count. */
export function CourseCard({ course, onPress }: { course: CommunityPath; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${course.title}, ${meta(course, true)}`}
      onPress={onPress}
      className="w-44 overflow-hidden rounded-2xl border border-line bg-surface active:opacity-70">
      <View className="h-24 items-center justify-center bg-well">
        {course.thumbnailUrl ? (
          <Image source={course.thumbnailUrl} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
        ) : (
          <Text className="text-[40px] leading-[48px] font-black tracking-[-1px] text-tint-ink">{initials(course.category?.name)}</Text>
        )}
      </View>
      <View className="gap-1 p-3.5">
        <Text className="text-[15px] leading-5 font-bold text-ink" numberOfLines={2}>
          {course.title}
        </Text>
        <Text className="text-[13px] text-ink-muted" numberOfLines={1}>
          {meta(course, false)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Horizontal rail of course cards, bleeding to the screen edges (the parent must not pad it). */
export function CourseRail({ courses, onOpen }: { courses: CommunityPath[]; onOpen: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-5">
      {courses.map((c) => (
        <CourseCard key={c.id} course={c} onPress={() => onOpen(c.id)} />
      ))}
    </ScrollView>
  );
}

export function TagChip({ tag, onPress }: { tag: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lọc theo thẻ ${tag}`}
      onPress={onPress}
      hitSlop={6}
      className="rounded-full bg-well px-2.5 py-1 active:opacity-70">
      <Text className="text-[13px] text-ink-muted">#{tag}</Text>
    </Pressable>
  );
}

/** Result row: title, category · level · lessons · learners, then its tags as filter chips. */
export function CourseRow({ course, onPress, onTag }: { course: CommunityPath; onPress: () => void; onTag?: (tag: string) => void }) {
  return (
    <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <Pressable accessibilityRole="button" onPress={onPress} className="gap-1 active:opacity-70">
        <Text className="text-base font-semibold text-ink" numberOfLines={2}>
          {course.title}
        </Text>
        <Text className="text-[13px] text-ink-muted" numberOfLines={1}>
          {meta(course, true)} · {course.copies} người học
        </Text>
      </Pressable>
      {onTag && course.tags.length ? (
        <View className="flex-row flex-wrap gap-2">
          {course.tags.map((t) => (
            <TagChip key={t} tag={t} onPress={() => onTag(t)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
