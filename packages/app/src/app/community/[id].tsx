import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { TagChip } from '@/components/community-cards';
import { Retry } from '@/components/retry';
import { ScreenHeader } from '@/components/screen-header';
import { PathSkeleton } from '@/components/skeleton';
import { toast } from '@/components/toast';
import { useLoad } from '@/hooks/use-load';
import { copyCommunityPath, getCommunityPath } from '@/lib/community-api';
import { LEVEL_LABEL } from '@/lib/learning-paths-api';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';

export default function CoursePreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: course, error, reload } = useLoad(() => getCommunityPath(id));
  const [busy, setBusy] = useState(false);

  const learn = async () => {
    if (!course) return;
    if (course.copiedPathId) return router.replace(`/paths/${course.copiedPathId}`);
    setBusy(true);
    try {
      const { id: pathId } = await copyCommunityPath(course.id);
      router.replace(`/paths/${pathId}`);
    } catch (e) {
      toast.fromError(e);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScreenHeader title={course?.title ?? 'Khoá học'} />
      {!course ? (
        error ? <Retry onPress={reload} /> : <PathSkeleton />
      ) : (
        <>
          <ScrollView contentContainerClassName="gap-4 px-5 pt-2 pb-6">
            {course.category ? <Text className="text-[13px] font-semibold text-tint-ink">{course.category.name}</Text> : null}
            <Text accessibilityRole="header" className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
              {course.title}
            </Text>
            <Text className="text-[13px] text-ink-muted">
              {[course.level && LEVEL_LABEL[course.level], `${course.lessonCount} bài`, `${course.copies} người học`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {course.tags.length ? (
              <View className="flex-row flex-wrap gap-2">
                {course.tags.map((t) => (
                  // A tag opens Community filtered by it.
                  <TagChip key={t} tag={t} onPress={() => router.push({ pathname: '/community', params: { tag: t } })} />
                ))}
              </View>
            ) : null}
            <Text className="text-[15px] leading-[22px] text-ink-muted">{course.summary}</Text>
            {course.modules.map((m, mi) => (
              <View key={mi} className="gap-1 rounded-3xl border border-line bg-surface px-4 py-3">
                <Text className="mb-1 text-[13px] font-semibold text-ink-muted">Chương {mi + 1}</Text>
                <Text className="mb-1 text-[17px] font-bold text-ink">{m.title}</Text>
                {m.lessons.map((l, li) => (
                  <Text key={li} className="py-1.5 text-[15px] leading-[22px] text-ink">
                    {l.title}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
          <View className="px-5 pb-2">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy }}
              disabled={busy}
              onPress={learn}
              className="min-h-14 items-center justify-center rounded-[28px] bg-tint ios:active:opacity-80">
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text className="text-base font-bold text-on-tint">{course.copiedPathId ? 'Tiếp tục học' : 'Học khoá này'}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
