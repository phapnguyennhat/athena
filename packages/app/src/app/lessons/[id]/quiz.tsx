import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView as RNScrollView } from 'react-native';
import { QuizSkeleton } from '@/components/skeleton';

import { Retry } from '@/components/retry';
import { ScreenHeader } from '@/components/screen-header';
import { toast } from '@/components/toast';
import { useLoad } from '@/hooks/use-load';
import { ApiError } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { generateQuiz, getLesson, getQuiz, submitAttempt, type AttemptResult, type Quiz } from '@/lib/learning-api';
import type { JobView } from '@/lib/learning-paths-api';
import { watchJob } from '@/lib/socket';
import { Pressable, SafeAreaView, Text, View, useCSSVariable } from '@/tw';

const LETTERS = ['A', 'B', 'C', 'D'];

/** A lesson without a quiz gets one generated on first visit: the screen then waits for that job. */
async function loadQuiz(lessonId: string): Promise<{ quiz: Quiz | null; job: JobView | null }> {
  try {
    return { quiz: await getQuiz(lessonId), job: null };
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'QUIZ_NOT_FOUND')) throw e;
    // A failed generation waits for "Thử lại" instead of re-running (and costing) on every visit.
    const { quizJob } = await getLesson(lessonId);
    if (quizJob?.status === 'failed' || quizJob?.status === 'queued' || quizJob?.status === 'running') return { quiz: null, job: quizJob };
    return { quiz: null, job: await generateQuiz(lessonId) };
  }
}

export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, setData, error, reload } = useLoad(() => loadQuiz(id));
  const quiz = data?.quiz ?? null;
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The score sits at the top: jump there after submitting and on retry.
  const scroller = useRef<ComponentRef<typeof RNScrollView>>(null);
  // After the result (or the reset) has rendered: scrolling earlier is undone by the re-layout.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [result]);
  const ok = useCSSVariable('--color-ink');
  const bad = useCSSVariable('--color-tint-ink');

  const job = data?.job ?? null;
  const pending = job && (job.status === 'queued' || job.status === 'running') ? job.id : null;
  const failed = job?.status === 'failed' ? describeError(job.errorCode) : null;

  useEffect(() => {
    if (!pending) return;
    return watchJob(pending, async (j) => {
      if (j.status === 'failed') {
        setData((d) => (d?.job ? { ...d, job: { ...d.job, status: 'failed', errorCode: j.errorCode } } : d));
        toast.fromError(j.errorCode);
        return;
      }
      try {
        setData({ quiz: await getQuiz(id), job: null });
      } catch (e) {
        toast.fromError(e);
      }
    });
  }, [pending, id, setData]);

  const generate = async () => {
    try {
      setData({ quiz: null, job: await generateQuiz(id) });
    } catch (e) {
      toast.fromError(e);
    }
  };

  const submit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      setResult(await submitAttempt(quiz.id, answers as number[]));
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswers([]);
    reload();
  };

  const all = !!quiz && quiz.questions.every((_, i) => answers[i] !== undefined);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScreenHeader title="Bài kiểm tra" />
      {!quiz ? (
        failed ? (
          <View className="items-center gap-4 px-5 py-16">
            <Text className="text-center text-[17px] font-semibold text-ink">Chưa tạo được bài kiểm tra.</Text>
            <Text className="text-center text-[14px] text-ink-muted">{failed}</Text>
            <Pressable accessibilityRole="button" onPress={generate} className="min-h-14 w-full items-center justify-center rounded-[28px] bg-tint">
              <Text className="text-base font-bold text-on-tint">Thử lại</Text>
            </Pressable>
          </View>
        ) : error ? (
          <Retry onPress={reload} />
        ) : (
          <QuizSkeleton caption={pending ? 'AI đang soạn câu hỏi từ bài học…' : undefined} />
        )
      ) : (
        <>
          <RNScrollView ref={scroller} contentContainerStyle={{ gap: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
            {result ? (
              <View accessibilityLiveRegion="polite" className="items-center gap-1 rounded-3xl bg-tint p-6">
                <Text className="text-[44px] leading-[52px] font-black text-on-tint">
                  {result.correct}/{result.total}
                </Text>
                <Text className="text-center text-[15px] font-semibold text-on-tint">
                  {result.correct === result.total ? 'Xuất sắc! Đúng tất cả.' : result.correct * 2 >= result.total ? 'Khá lắm! Xem lại các câu sai bên dưới.' : 'Đọc lại bài rồi thử lần nữa nhé.'}
                </Text>
                <Text className="text-[13px] text-on-tint opacity-70">Chuỗi học: {result.streak.current} ngày</Text>
              </View>
            ) : quiz.best ? (
              <Text className="text-[14px] text-ink-muted">
                Đã làm {quiz.attempts} lần · cao nhất {quiz.best.correct}/{quiz.best.total}
              </Text>
            ) : null}
            {quiz.questions.map((q, qi) => {
              const r = result?.results[qi];
              return (
                <View key={qi} className="gap-2">
                  <Text className="text-[13px] font-semibold text-ink-muted">
                    Câu {qi + 1}/{quiz.questions.length}
                  </Text>
                  <Text className="text-[17px] leading-[25px] font-bold text-ink">{q.prompt}</Text>
                  <View accessibilityRole="radiogroup" className="gap-2">
                    {q.options.map((o, oi) => {
                      const picked = (r ? r.selected : answers[qi]) === oi;
                      const isAnswer = r && r.answer === oi;
                      const wrongPick = r && picked && !r.correct;
                      return (
                        <Pressable
                          key={oi}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: picked, disabled: !!r }}
                          accessibilityLabel={`${LETTERS[oi]}. ${o}${isAnswer ? ', đáp án đúng' : ''}${wrongPick ? ', bạn chọn sai' : ''}`}
                          disabled={!!r}
                          onPress={() => setAnswers((a) => Object.assign([...a], { [qi]: oi }))}
                          className={`min-h-12 flex-row items-center gap-3 rounded-2xl border-2 px-4 py-3 active:opacity-70 ${
                            isAnswer ? 'border-ink bg-surface' : wrongPick ? 'border-tint-ink bg-surface' : picked ? 'border-tint bg-surface' : 'border-line bg-surface'
                          }`}>
                          <Text className={`w-5 text-[15px] font-bold ${picked ? 'text-tint-ink' : 'text-ink-muted'}`}>{LETTERS[oi]}</Text>
                          <Text className="flex-1 text-[15px] leading-[22px] text-ink">{o}</Text>
                          {isAnswer ? (
                            <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={20} tintColor={ok as string} />
                          ) : wrongPick ? (
                            <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={20} tintColor={bad as string} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  {r ? (
                    <View className="rounded-2xl bg-well p-3">
                      <Text className="text-[14px] leading-[21px] text-ink">
                        <Text className="font-bold">{r.correct ? 'Đúng. ' : 'Chưa đúng. '}</Text>
                        {r.explanation}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </RNScrollView>
          <View className="flex-row gap-2 border-t border-line px-5 pt-3 pb-2">
            {result ? (
              <>
                <Pressable accessibilityRole="button" onPress={retry} className="min-h-14 flex-1 items-center justify-center rounded-[28px] border border-line bg-surface active:opacity-70">
                  <Text className="text-base font-bold text-ink">Làm lại</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => router.back()} className="min-h-14 flex-1 items-center justify-center rounded-[28px] bg-tint ios:active:opacity-80">
                  <Text className="text-base font-bold text-on-tint">Về bài học</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !all || submitting }}
                disabled={!all || submitting}
                onPress={submit}
                className={`min-h-14 flex-1 items-center justify-center rounded-[28px] ${all && !submitting ? 'bg-tint' : 'border border-line bg-well'}`}>
                <Text className={`text-base font-bold ${all && !submitting ? 'text-on-tint' : 'text-ink-muted'}`}>
                  {all ? 'Nộp bài' : `Còn ${quiz.questions.filter((_, i) => answers[i] === undefined).length} câu`}
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
