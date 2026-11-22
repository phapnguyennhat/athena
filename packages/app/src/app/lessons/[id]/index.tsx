import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { LessonBodySkeleton, LessonSkeleton } from '@/components/skeleton';

import { Retry } from '@/components/retry';
import { ScreenHeader } from '@/components/screen-header';
import { toast } from '@/components/toast';
import { YouTubePlayer } from '@/components/youtube-player';
import { useLoad } from '@/hooks/use-load';
import { describeError } from '@/lib/errors';
import { completeLesson, generateLesson, getLesson, type Lesson } from '@/lib/learning-api';
import { watchJob } from '@/lib/socket';
import { Pressable, SafeAreaView, ScrollView, Text, View, useCSSVariable } from '@/tw';

function Button({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary'; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-14 flex-1 items-center justify-center rounded-[28px] px-4 ios:active:opacity-80 ${
        kind === 'primary' ? (disabled ? 'border border-line bg-well' : 'bg-tint') : 'border border-line bg-surface'
      }`}>
      <Text className={`text-base font-bold ${kind === 'primary' ? (disabled ? 'text-ink-muted' : 'text-on-tint') : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

/** Monospace only for code-like examples; prose examples read badly in a fixed-width font. */
const looksLikeCode = (t: string) => /[;{}=<>]|\b(SELECT|FROM|WHERE|function|const|def|class|import|return)\b|^ {2,}/m.test(t);

function Content({ lesson }: { lesson: Lesson }) {
  const [video, setVideo] = useState(0);
  const c = lesson.content!;
  const current = lesson.videos[video];
  return (
    <View className="gap-6">
      <Text className="text-[17px] leading-[26px] text-ink">{c.intro}</Text>
      {c.sections.map((s, i) => (
        <View key={i} className="gap-2">
          <Text accessibilityRole="header" className="text-[20px] leading-7 font-extrabold text-ink">
            {s.heading}
          </Text>
          <Text selectable className="text-[16px] leading-[25px] text-ink">
            {s.body}
          </Text>
          {s.example ? (
            <View className="rounded-2xl border border-line bg-well p-4">
              <Text className="mb-1 text-[12px] font-bold tracking-wide text-ink-muted">VÍ DỤ</Text>
              <Text selectable className={looksLikeCode(s.example) ? 'font-mono text-[14px] leading-[21px] text-ink' : 'text-[15px] leading-[23px] text-ink'}>
                {s.example}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
      <View className="gap-2 rounded-3xl border border-line bg-surface p-5">
        <Text accessibilityRole="header" className="text-[17px] font-bold text-ink">
          Ghi nhớ
        </Text>
        {c.takeaways.map((t, i) => (
          <View key={i} className="flex-row gap-2">
            <Text className="text-[16px] leading-6 text-tint-ink">•</Text>
            <Text className="flex-1 text-[15px] leading-[23px] text-ink">{t}</Text>
          </View>
        ))}
      </View>
      {c.practice ? (
        <View className="gap-1 rounded-3xl bg-well p-5">
          <Text className="text-[13px] font-bold tracking-wide text-ink-muted">THỰC HÀNH</Text>
          <Text className="text-[15px] leading-[23px] text-ink">{c.practice}</Text>
        </View>
      ) : null}
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-[20px] leading-7 font-extrabold text-ink">
          Video tham khảo
        </Text>
        {current ? (
          <>
            <YouTubePlayer key={current.videoId} videoId={current.videoId} title={current.title} />
            {lesson.videos.length > 1 ? (
              // Bleeds to the screen edges (parent has px-5) so cards scroll off-screen instead of clipping at the gutter.
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 grow-0" contentContainerClassName="gap-3 px-5">
                {lesson.videos.map((v, i) => (
                  <Pressable
                    key={v.videoId}
                    accessibilityRole="button"
                    accessibilityLabel={v.title}
                    accessibilityState={{ selected: i === video }}
                    onPress={() => setVideo(i)}
                    className={`w-56 overflow-hidden rounded-2xl border-2 bg-surface active:opacity-70 ${i === video ? 'border-tint' : 'border-line'}`}>
                    <Image source={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="cover" />
                    <View className="gap-0.5 p-2.5">
                      <Text numberOfLines={2} className="text-[14px] font-semibold leading-5 text-ink">
                        {v.title}
                      </Text>
                      {v.channel ? (
                        <Text numberOfLines={1} className="text-[12px] text-ink-muted">
                          {v.channel}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </>
        ) : (
          <Pressable
            accessibilityRole="link"
            onPress={() => WebBrowser.openBrowserAsync(`https://www.youtube.com/results?search_query=${encodeURIComponent(lesson.searchQuery)}`)}
            className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 active:opacity-70">
            <SymbolView name={{ ios: 'play.rectangle', android: 'smart_display', web: 'smart_display' }} size={22} tintColor="#FF0000" />
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-ink">Tìm video trên YouTube</Text>
              <Text numberOfLines={1} className="text-[13px] text-ink-muted">
                {lesson.searchQuery}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: lesson, setData, error, reload } = useLoad(async () => {
    const l = await getLesson(id);
    // Content is generated on first open; a failed job waits for "Thử lại" instead of re-running on every visit.
    return !l.content && !l.contentJob ? { ...l, contentJob: await generateLesson(id) } : l;
  });
  const [completing, setCompleting] = useState(false);
  const muted = useCSSVariable('--color-ink-muted');

  const job = lesson && !lesson.content ? lesson.contentJob : null;
  const pending = job && (job.status === 'queued' || job.status === 'running') ? job.id : null;

  useEffect(() => {
    if (!pending) return;
    return watchJob(pending, async (j) => {
      if (j.status === 'failed') {
        setData((l) => (l?.contentJob ? { ...l, contentJob: { ...l.contentJob, status: 'failed', errorCode: j.errorCode } } : l));
        toast.fromError(j.errorCode);
        return;
      }
      try {
        setData(await getLesson(id));
      } catch (e) {
        toast.fromError(e);
      }
    });
  }, [pending, id, setData]);

  const retry = async () => {
    try {
      const j = await generateLesson(id);
      setData((l) => (l ? { ...l, contentJob: j } : l));
    } catch (e) {
      toast.fromError(e);
    }
  };

  const complete = async () => {
    setCompleting(true);
    try {
      const r = await completeLesson(id);
      setData((l) => (l ? { ...l, status: 'completed' } : l));
      toast.info(`Đã hoàn thành bài · ${r.pathProgress.done}/${r.pathProgress.total} · chuỗi ${r.streak.current} ngày`);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setCompleting(false);
    }
  };


  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScreenHeader title={lesson?.path.title ?? 'Bài học'} />
      {!lesson ? (
        error ? <Retry onPress={reload} /> : <LessonSkeleton />
      ) : (
        <>
          <ScrollView contentContainerClassName="gap-5 px-5 pt-2 pb-8">
            <View className="gap-1">
              <Text className="text-[13px] font-semibold text-ink-muted">{lesson.moduleTitle}</Text>
              <Text accessibilityRole="header" className="text-[28px] leading-9 font-black tracking-[-0.5px] text-ink">
                {lesson.title}
              </Text>
              {lesson.status === 'completed' ? (
                <View className="mt-1 flex-row items-center gap-1.5">
                  <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={16} tintColor={muted as string} />
                  <Text className="text-[14px] font-semibold text-ink-muted">Đã hoàn thành</Text>
                </View>
              ) : null}
            </View>
            {lesson.content ? (
              <Content lesson={lesson} />
            ) : pending ? (
              <LessonBodySkeleton caption="AI đang soạn bài học… thường mất 15–30 giây." />
            ) : (
              <View className="items-center gap-4 py-16">
                <Text className="text-center text-[17px] font-semibold text-ink">Chưa soạn được bài học.</Text>
                <Text className="text-center text-[14px] text-ink-muted">{describeError(job?.errorCode)}</Text>
                <View className="w-full flex-row">
                  <Button label="Thử lại" onPress={retry} />
                </View>
              </View>
            )}
          </ScrollView>
          {lesson.content ? (
            <View className="gap-2 border-t border-line px-5 pt-3 pb-2">
              <View className="flex-row gap-2">
                <Button kind="secondary" label={lesson.quiz?.lastAttempt ? 'Kiểm tra lại' : 'Làm bài kiểm tra'} onPress={() => router.push(`/lessons/${id}/quiz`)} />
                {lesson.status === 'completed' ? (
                  lesson.next ? <Button label="Bài tiếp theo" onPress={() => router.replace(`/lessons/${lesson.next!.id}`)} /> : null
                ) : (
                  <Button label="Đã học xong" disabled={completing || lesson.path.status !== 'active'} onPress={complete} />
                )}
              </View>
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}
