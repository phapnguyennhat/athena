import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, RefreshControl } from 'react-native';
import { PathSkeleton } from '@/components/skeleton';

import { ProgressBar } from '@/components/home-sections';
import { Retry } from '@/components/retry';
import { IconButton, ScreenHeader } from '@/components/screen-header';
import { StateMark } from '@/components/state-mark';
import { toast } from '@/components/toast';
import { useLoad } from '@/hooks/use-load';
import { deletePath } from '@/lib/learning-api';
import { getPath, type LearningPath, type LessonStatus } from '@/lib/learning-paths-api';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';

const MARK = { completed: 'done', in_progress: 'progress', not_started: 'todo' } as const;
const STATUS_LABEL: Record<LessonStatus, string> = { completed: 'đã học', in_progress: 'đang học', not_started: 'chưa học' };
const EXTENSION_NOTE: Record<LearningPath['extension'], string> = {
  idle: 'Tiếp tục học để mở khoá các chương tiếp theo.',
  generating: 'AI đang soạn chương tiếp theo…',
  complete: 'Khoá học đã hoàn chỉnh.',
};

export default function PathScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: path, error, reload, refreshing, refresh } = useLoad(() => getPath(id));

  // An active original is only hidden (it stays in Community); a copy or a draft is deleted.
  const hides = path?.status === 'active' && !path.isCopy;
  const remove = () =>
    Alert.alert(
      hides ? 'Ẩn khỏi khoá học của bạn?' : 'Xoá lộ trình?',
      hides
        ? 'Khoá học vẫn hiển thị trong Cộng đồng.'
        : 'Bài học, bài kiểm tra và tiến độ của lộ trình này sẽ bị xoá. Chuỗi ngày học vẫn giữ nguyên.',
      [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: hides ? 'Ẩn' : 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePath(id);
            toast.info(hides ? 'Đã ẩn khoá học.' : 'Đã xoá lộ trình.');
            if (router.canGoBack()) router.back();
            else router.replace('/courses');
          } catch (e) {
            toast.fromError(e);
          }
        },
      },
      ],
    );

  // The first unfinished lesson in learning order is where "Học tiếp" goes.
  const next = path?.modules.flatMap((m) => m.lessons).find((l) => l.status !== 'completed');

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScreenHeader
        title={path?.title ?? 'Lộ trình'}
        right={path ? <IconButton name={{ ios: 'trash', android: 'delete', web: 'delete' }} label={hides ? 'Ẩn khoá học' : 'Xoá lộ trình'} onPress={remove} /> : null}
      />
      {!path ? (
        error ? <Retry onPress={reload} /> : <PathSkeleton />
      ) : (
        <>
          <ScrollView
            contentContainerClassName="gap-4 px-5 pt-2 pb-6"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
            <Text accessibilityRole="header" className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
              {path.title}
            </Text>
            <Text className="text-[15px] leading-[22px] text-ink-muted">{path.summary}</Text>
            <View className="gap-2">
              <ProgressBar done={path.progress.done} total={path.progress.total} />
              <Text className="text-[13px] text-ink-muted">
                {path.progress.done}/{path.progress.total} bài · {Math.round((path.progress.done / Math.max(path.progress.total, 1)) * 100)}%
              </Text>
            </View>
            {path.modules.map((m, mi) => (
              <View key={m.id} className="gap-1 rounded-3xl border border-line bg-surface px-2 py-3">
                <Text className="mb-1 px-2 text-[13px] font-semibold text-ink-muted">Chương {mi + 1}</Text>
                <Text className="mb-1 px-2 text-[17px] font-bold text-ink">{m.title}</Text>
                {m.lessons.map((l) => (
                  <Pressable
                    key={l.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${l.title}, ${STATUS_LABEL[l.status]}`}
                    onPress={() => router.push(`/lessons/${l.id}`)}
                    className="min-h-12 flex-row items-center gap-3 rounded-2xl px-2 py-2 active:bg-well">
                    <StateMark state={MARK[l.status]} />
                    <Text className={`flex-1 text-[15px] leading-[22px] ${l.status === 'completed' ? 'text-ink-muted' : 'text-ink'}`}>{l.title}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {path.status === 'active' ? (
              <View accessibilityLiveRegion="polite" className="rounded-3xl border border-dashed border-line px-4 py-3">
                <Text className="text-[14px] leading-5 text-ink-muted">{EXTENSION_NOTE[path.extension]}</Text>
              </View>
            ) : null}
          </ScrollView>
          {next ? (
            <View className="px-5 pb-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Học tiếp: ${next.title}`}
                onPress={() => router.push(`/lessons/${next.id}`)}
                className="min-h-14 items-center justify-center rounded-[28px] bg-tint ios:active:opacity-80">
                <Text className="text-base font-bold text-on-tint">{path.progress.done ? 'Học tiếp' : 'Bắt đầu bài đầu tiên'}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}
