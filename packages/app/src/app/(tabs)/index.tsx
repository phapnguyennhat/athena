import { useRouter } from 'expo-router';
import { RefreshControl } from 'react-native';
import { HomeSkeleton } from '@/components/skeleton';

import { BrandMark } from '@/components/brand-mark';
import { CourseRail } from '@/components/community-cards';
import { ContinueSection, SectionTitle, StreakCard } from '@/components/home-sections';
import { Retry } from '@/components/retry';
import { ThemeToggle } from '@/components/theme-toggle';
import { useLoad } from '@/hooks/use-load';
import { getRecommendations } from '@/lib/community-api';
import { getDashboard } from '@/lib/learning-api';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';

/** Index of a local 'YYYY-MM-DD' in a Mon–Sun week (0 = Monday). */
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

export default function HomeScreen() {
  const router = useRouter();
  const { data, error, reload, refreshing, refresh } = useLoad(getDashboard);
  // Quiet: suggestions are extra, so a failure just hides the section instead of toasting.
  const suggestions = useLoad(() => getRecommendations().catch(() => []));

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-7 pb-32"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (refresh(), suggestions.reload())} />}>
        <View className="mr-2 ml-5 flex-row items-center justify-between">
          <BrandMark />
          <ThemeToggle />
        </View>
        <View className="mr-5 ml-5 gap-7">
          <Text accessibilityRole="header" className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
            Chào bạn, học tiếp nào.
          </Text>
          {!data ? (
            error ? (
              <Retry onPress={reload} />
            ) : (
              <HomeSkeleton />
            )
          ) : (
            <>
              <StreakCard
                days={data.streak.current}
                week={data.streak.week}
                today={weekday(data.streak.today)}
                studiedToday={data.streak.learnedToday}
              />
              {data.paths.length === 0 ? (
                <View className="gap-3 rounded-3xl border border-line bg-surface p-5">
                  <Text className="text-[20px] leading-7 font-extrabold text-ink">Bắt đầu lộ trình đầu tiên</Text>
                  <Text className="text-[15px] leading-[22px] text-ink-muted">
                    Kể cho AI bạn muốn học gì, AI sẽ soạn lộ trình theo trình độ và thời gian của bạn.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/new-path')}
                    className="min-h-12 items-center justify-center rounded-[24px] bg-tint ios:active:opacity-80">
                    <Text className="text-base font-bold text-on-tint">Tạo lộ trình</Text>
                  </Pressable>
                </View>
              ) : (
                <ContinueSection
                  target={data.continue}
                  paths={data.paths}
                  onLesson={(id) => router.push(`/lessons/${id}`)}
                  onPath={(id) => router.push(`/paths/${id}`)}
                />
              )}
            </>
          )}
          {/* Outside the dashboard branch: suggestions load on their own, so they show even if the dashboard fails. */}
          {suggestions.data?.length ? (
            <View className="-mx-5 gap-3">
              <View className="mx-5 flex-row items-baseline justify-between">
                <SectionTitle>Gợi ý cho bạn</SectionTitle>
                <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/community')} className="active:opacity-70">
                  <Text className="text-[15px] font-bold text-tint-ink">Xem tất cả</Text>
                </Pressable>
              </View>
              <CourseRail courses={suggestions.data} onOpen={(id) => router.push(`/community/${id}`)} />
            </View>
          ) : null}
          {data ? (
            <Text className="text-[13px] leading-5 text-ink-muted">
              Đã học {data.totals.completedLessons} bài · {data.totals.quizAttempts} lần làm bài kiểm tra · Kỷ lục{' '}
              {data.streak.longest} ngày
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
