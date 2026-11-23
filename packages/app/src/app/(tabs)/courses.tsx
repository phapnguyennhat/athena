import { useRouter } from 'expo-router';
import { Alert, RefreshControl } from 'react-native';
import { PathListSkeleton } from '@/components/skeleton';

import { PathRow } from '@/components/home-sections';
import { Retry } from '@/components/retry';
import { toast } from '@/components/toast';
import { useLoad } from '@/hooks/use-load';
import { deletePath, listPaths, type PathSummary } from '@/lib/learning-api';
import { Pressable, SafeAreaView, ScrollView, Text } from '@/tw';

export default function CoursesScreen() {
  const router = useRouter();
  const { data, setData, error, reload, refreshing, refresh } = useLoad(listPaths);

  // Listed paths are active: an original is only hidden (it stays in Community), a copy is deleted.
  const remove = (p: PathSummary) =>
    Alert.alert(
      p.isCopy ? 'Xoá lộ trình?' : 'Ẩn khỏi khoá học của bạn?',
      p.isCopy
        ? `"${p.title}" cùng bài học, bài kiểm tra và tiến độ sẽ bị xoá. Chuỗi ngày học vẫn giữ nguyên.`
        : 'Khoá học vẫn hiển thị trong Cộng đồng.',
      [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: p.isCopy ? 'Xoá' : 'Ẩn',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePath(p.id);
            setData((list) => list?.filter((x) => x.id !== p.id) ?? null);
            toast.info(p.isCopy ? 'Đã xoá lộ trình.' : 'Đã ẩn khoá học.');
          } catch (e) {
            toast.fromError(e);
          }
        },
      },
      ],
    );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-3 px-5 pt-4 pb-32"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Text accessibilityRole="header" className="mb-2 text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
          Khoá học của tôi
        </Text>
        {!data ? (
          error ? <Retry onPress={reload} /> : <PathListSkeleton />
        ) : data.length === 0 ? (
          <>
            <Text className="text-[15px] leading-[22px] text-ink-muted">Bạn chưa có lộ trình nào.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/new-path')}
              className="min-h-12 items-center justify-center rounded-[24px] bg-tint ios:active:opacity-80">
              <Text className="text-base font-bold text-on-tint">Tạo lộ trình với AI</Text>
            </Pressable>
          </>
        ) : (
          <>
            {data.map((p) => (
              <PathRow key={p.id} path={p} onPress={() => router.push(`/paths/${p.id}`)} onLongPress={() => remove(p)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
