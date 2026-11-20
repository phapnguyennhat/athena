import { Redirect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, ScrollView as RNScrollView } from 'react-native';

import { useAuth } from '@/auth';
import { StateMark } from '@/components/state-mark';
import { TypingBubble } from '@/components/typing-bubble';
import { ApiError } from '@/lib/api';
import {
  generatePath,
  getCurrentConversation,
  getJob,
  getPath,
  sendMessage,
  startConversation,
  startPath,
  type ChatMessage,
  type ConversationView,
  type JobView,
  type LearningPath,
  type Preferences,
} from '@/lib/learning-paths-api';
import { getSocket, onJobUpdated } from '@/lib/socket';
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View, useCSSVariable } from '@/tw';

type Step = 'loading' | 'chat' | 'generating' | 'review';
/** An API error or a failed job's code; anything else (e.g. network) falls back to the generic copy. */
type Failure = { status?: number; code?: string | null };

const LEVEL_LABEL = { beginner: 'Cơ bản', intermediate: 'Trung cấp', advanced: 'Nâng cao' } as const;
const JOB_POLL_MS = 15_000;

const ERROR_COPY: Record<string, string> = {
  AI_UNAVAILABLE: 'AI đang bận, thử lại sau ít phút.',
  TURN_IN_PROGRESS: 'Đợi AI trả lời xong đã nhé.',
  CONVERSATION_LIMIT: 'Cuộc trò chuyện đã dài quá. Bắt đầu lại nhé?',
  CONVERSATION_CLOSED: 'Lộ trình này đã bắt đầu. Hãy tạo lộ trình mới.',
  TOPIC_REJECTED: 'Mình không thể soạn lộ trình cho chủ đề này.',
  AI_INVALID_OUTPUT: 'Chưa soạn được lộ trình. Thử lại nhé.',
};

function errorText(e: Failure) {
  if (e.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng xuất và đăng nhập lại.';
  if (e.status === 429) return 'Bạn thao tác hơi nhanh, thử lại sau một lúc.';
  return (e.code && ERROR_COPY[e.code]) || 'Có lỗi xảy ra. Kiểm tra kết nối rồi thử lại.';
}

const currentConversation = async () => (await getCurrentConversation()) ?? (await startConversation());
const toFailure = (e: unknown): Failure => (e instanceof ApiError ? e : {});
/** These errors are only fixed by a fresh conversation. */
const needsRestart = (e: Failure | null) => e?.code === 'CONVERSATION_LIMIT' || e?.code === 'CONVERSATION_CLOSED';

/** Required before generating; goal stays optional. Mirrors the server's `ready` rule. */
const missingCount = (p: Preferences) => [p.topic, p.level, p.dailyMinutes].filter((v) => !v).length;

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const ink = useCSSVariable('--color-ink');
  return (
    <View className="h-14 flex-row items-center gap-3 px-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng"
        onPress={onBack}
        className="h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-70">
        <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor={ink as string} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} className="flex-1 text-[17px] font-bold text-ink">
        {title}
      </Text>
    </View>
  );
}

/** What the chat has learned so far, as a compact strip under the header so progress stays visible while chatting. */
function Brief({ p }: { p: Preferences }) {
  const check = useCSSVariable('--color-tint-ink');
  const items = [
    ['Chủ đề', p.topic],
    ['Trình độ', p.level && LEVEL_LABEL[p.level]],
    ['Thời gian', p.dailyMinutes && `${p.dailyMinutes} phút/ngày`],
    ...(p.goal ? ([['Mục tiêu', p.goal]] as const) : []),
  ] as const;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0 border-b border-line" contentContainerClassName="gap-2 px-5 pb-3">
      {items.map(([label, value]) => (
        <View
          key={label}
          accessible
          accessibilityLabel={`${label}: ${value || 'chưa có'}`}
          className={`max-w-56 flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${value ? 'border-line bg-surface' : 'border-dashed border-mark-off'}`}>
          {value ? (
            <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} weight="bold" tintColor={check as string} />
          ) : null}
          <Text numberOfLines={1} className={`text-[13px] ${value ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
            {value || label}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Message({ m }: { m: ChatMessage }) {
  const tint = useCSSVariable('--color-tint-ink');
  if (m.role === 'user') {
    return (
      <View className="max-w-[82%] self-end rounded-3xl rounded-br-md bg-tint px-4 py-2.5">
        <Text className="text-[16px] leading-6 text-on-tint">{m.content}</Text>
      </View>
    );
  }
  // Assistant replies read as text from the AI, not bubbles: the avatar marks who is speaking.
  return (
    <View className="flex-row gap-3 pr-6">
      <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full border border-line bg-surface">
        <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={14} tintColor={tint as string} />
      </View>
      <Text className="flex-1 text-[16px] leading-6 text-ink">{m.content}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-14 items-center justify-center rounded-[28px] ios:active:opacity-80 ${disabled ? 'border border-line bg-well' : 'bg-tint'}`}>
      <Text className={`text-base font-bold ${disabled ? 'text-ink-muted' : 'text-on-tint'}`}>{label}</Text>
    </Pressable>
  );
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-h-12 items-center justify-center active:opacity-70">
      <Text className="text-[15px] font-semibold text-tint-ink">{label}</Text>
    </Pressable>
  );
}

export default function NewPathScreen() {
  const router = useRouter();
  const { status } = useAuth();

  const [step, setStep] = useState<Step>('loading');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prefs, setPrefs] = useState<Preferences>({});
  // The chatbot decides when it has enough to build the path; the generate button waits for it.
  const [ready, setReady] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  // On the generating step, "Thử lại" reloads the conversation instead of starting another (costly) job.
  const [retryLoad, setRetryLoad] = useState(false);
  const [path, setPath] = useState<LearningPath | null>(null);
  // The user's edited copy of the draft's modules; compared by reference to know if anything changed.
  const [modules, setModules] = useState<LearningPath['modules']>([]);
  const scroller = useRef<ComponentRef<typeof RNScrollView>>(null);
  const muted = useCSSVariable('--color-ink-muted');
  const onTint = useCSSVariable('--color-on-tint');
  const placeholder = useCSSVariable('--color-ink-muted');
  const missing = missingCount(prefs);

  const showDraft = useCallback((draft: LearningPath) => {
    setPath(draft);
    setModules(draft.modules);
    setStep('review');
  }, []);

  /** Resumes a conversation wherever it left off: generating, reviewing a draft, or chatting. */
  const open = useCallback(
    async (c: ConversationView) => {
      setConversationId(c.id);
      setMessages(c.messages);
      setPrefs(c.preferences);
      setReady(c.ready);
      setPath(null);
      if (c.activeJob) {
        setJobId(c.activeJob.id);
        setStep('generating');
      } else if (c.draftPathId) {
        showDraft(await getPath(c.draftPathId));
      } else {
        setStep('chat');
      }
    },
    [showDraft],
  );

  useEffect(() => {
    if (status !== 'signedIn') return;
    currentConversation()
      .then(open)
      .catch((e: unknown) => setError(toFailure(e)));
  }, [status, open]);

  const reload = (fetch: () => Promise<ConversationView>) => {
    setStep('loading');
    setError(null);
    fetch()
      .then(open)
      .catch((e: unknown) => setError(toFailure(e)));
  };
  const resume = () => reload(currentConversation);
  const restart = () => reload(startConversation);

  // Wait for the job: socket events, plus re-reads on connect, on foreground and every 15 s (events can be missed).
  useEffect(() => {
    if (step !== 'generating' || !jobId || error) return;
    // Only a terminal status changes the screen, and only once, so stale or duplicate updates are ignored.
    let settled = false;
    let active = true;
    const apply = async (job: Pick<JobView, 'status' | 'resultId' | 'errorCode'>) => {
      if (settled) return;
      if (job.status === 'failed') {
        settled = true;
        setRetryLoad(false);
        setError({ code: job.errorCode });
      } else if (job.status === 'succeeded' && job.resultId) {
        settled = true;
        try {
          const draft = await getPath(job.resultId);
          if (active) showDraft(draft);
        } catch (e) {
          if (!active) return;
          setRetryLoad(true);
          setError(toFailure(e));
        }
      }
    };
    const check = () => {
      getJob(jobId).then(
        (j) => {
          if (active) apply(j);
        },
        () => undefined, // the next trigger retries
      );
    };
    const socket = getSocket();
    const off = onJobUpdated(jobId, apply);
    socket.on('connect', check);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && check());
    const timer = setInterval(check, JOB_POLL_MS);
    check(); // the job may have finished before we subscribed
    return () => {
      active = false;
      off();
      socket.off('connect', check);
      appState.remove();
      clearInterval(timer);
    };
  }, [step, jobId, error, showDraft]);

  if (status !== 'signedIn') return <Redirect href="/welcome" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const generate = async () => {
    if (!conversationId) return;
    setJobId(null);
    setRetryLoad(false);
    setError(null);
    setStep('generating');
    try {
      setJobId((await generatePath(conversationId)).id);
    } catch (e) {
      setError(toFailure(e));
    }
  };

  const backToChat = () => {
    setError(null);
    setStep('chat');
  };

  const send = async (content: string) => {
    const value = content.trim();
    if (!value || sending || !conversationId) return;
    const before = messages;
    setMessages([...before, { role: 'user', content: value, quickReplies: null }]);
    setText('');
    setSending(true);
    setError(null);
    try {
      const r = await sendMessage(conversationId, value);
      setMessages((ms) => [...ms, { role: 'assistant', content: r.reply, quickReplies: r.quickReplies }]);
      setPrefs(r.preferences);
      setReady(r.ready);
    } catch (e) {
      setError(toFailure(e));
      setMessages(before);
      // Give the text back unless the user already started typing something new.
      setText((t) => t || value);
    } finally {
      setSending(false);
    }
  };

  // Quick replies belong to the latest assistant message only.
  const last = messages.at(-1);
  const quick = last?.role === 'assistant' ? (last.quickReplies ?? []) : [];

  const edited = path !== null && modules !== path.modules;
  const lessonCount = modules.reduce((n, m) => n + m.lessons.length, 0);

  const removeLesson = (mi: number, li: number) =>
    setModules((ms) =>
      ms
        .map((m, i) => (i === mi ? { ...m, lessons: m.lessons.filter((_, j) => j !== li) } : m))
        .filter((m) => m.lessons.length > 0),
    );

  const start = async () => {
    if (!path) return;
    setError(null);
    try {
      await startPath(path.id, edited ? modules : undefined);
      router.dismissTo('/courses');
    } catch (e) {
      setError(toFailure(e));
    }
  };

  if (step === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <Header title="Tạo lộ trình với AI" onBack={close} />
        <View className="flex-1 items-center justify-center gap-4 px-5">
          {error ? (
            <>
              <Text accessibilityRole="alert" className="text-center text-[16px] leading-6 text-ink">
                {errorText(error)}
              </Text>
              <View className="w-full">
                <PrimaryButton label="Thử lại" onPress={resume} />
              </View>
            </>
          ) : (
            <ActivityIndicator size="large" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'generating') {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <Header title="Tạo lộ trình" onBack={close} />
        <View className="flex-1 items-center justify-center gap-4 px-5">
          {error ? (
            <>
              <Text accessibilityRole="alert" className="text-center text-[16px] leading-6 text-ink">
                {errorText(error)}
              </Text>
              <View className="w-full gap-1">
                {/* A rejected topic fails again on retry: the only way on is to change it in the chat. */}
                {error.code === 'TOPIC_REJECTED' ? (
                  <PrimaryButton label="Quay lại trò chuyện" onPress={backToChat} />
                ) : (
                  <>
                    {needsRestart(error) ? (
                      <PrimaryButton label="Soạn lại từ đầu" onPress={restart} />
                    ) : (
                      <PrimaryButton label="Thử lại" onPress={retryLoad ? resume : generate} />
                    )}
                    <TextButton label="Quay lại trò chuyện" onPress={backToChat} />
                  </>
                )}
              </View>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" />
              <Text accessibilityLiveRegion="polite" className="text-center text-[17px] font-semibold text-ink">
                Đang soạn lộ trình cho {prefs.topic}…
              </Text>
              <Text className="text-center text-[14px] text-ink-muted">Việc này có thể mất vài chục giây.</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'review' && path) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <Header title="Xem lại lộ trình" onBack={close} />
        <ScrollView contentContainerClassName="gap-4 px-5 pt-2 pb-6">
          <Text accessibilityRole="header" className="text-[30px] leading-9 font-black tracking-[-0.5px] text-ink">
            {path.title}
          </Text>
          <Text className="-mt-2 text-[14px] font-semibold text-ink-muted">
            {modules.length} chương · {lessonCount} bài
          </Text>
          <Text className="text-[15px] leading-[22px] text-ink-muted">{path.summary}</Text>
          {modules.map((m, mi) => (
            <View key={m.title} className="gap-1 rounded-3xl border border-line bg-surface py-3 pr-1 pl-4">
              <Text className="mb-1 text-[17px] font-bold text-ink">{m.title}</Text>
              {m.lessons.map((l, li) => (
                <View key={l.title} className="flex-row items-center gap-3">
                  <StateMark state="todo" />
                  <Text className="flex-1 text-[15px] leading-[22px] text-ink">{l.title}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Bỏ bài ${l.title}`}
                    accessibilityState={{ disabled: lessonCount <= 1 }}
                    disabled={lessonCount <= 1}
                    onPress={() => removeLesson(mi, li)}
                    className={`h-11 w-11 items-center justify-center rounded-full active:bg-well ${lessonCount <= 1 ? 'opacity-30' : ''}`}>
                    <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} weight="semibold" tintColor={muted as string} />
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
          {edited ? <TextButton label="Khôi phục bản gốc" onPress={() => setModules(path.modules)} /> : null}
        </ScrollView>
        <View className="gap-1 px-5 pb-2">
          {error ? (
            <Text accessibilityRole="alert" className="text-center text-[14px] text-tint-ink">
              {errorText(error)}
            </Text>
          ) : null}
          <PrimaryButton label="Bắt đầu học" onPress={start} />
          <TextButton label="Quay lại trò chuyện" onPress={backToChat} />
          <TextButton label="Soạn lại từ đầu" onPress={restart} />
        </View>
      </SafeAreaView>
    );
  }

  const canSend = !!text.trim() && !sending;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      {/* Edge-to-edge Android no longer resizes the window for the keyboard, so pad on both platforms. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Header title="Tạo lộ trình với AI" onBack={close} />
        <Brief p={prefs} />
        <RNScrollView
          ref={scroller}
          style={{ flex: 1 }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 18, paddingHorizontal: 20, paddingVertical: 16 }}>
          {messages.map((m, i) => (
            <Message key={i} m={m} />
          ))}
          {sending ? <TypingBubble /> : null}
          {error ? (
            <View className="items-start gap-1 pl-10">
              <Text accessibilityRole="alert" className="text-[14px] text-tint-ink">
                {errorText(error)}
              </Text>
              {needsRestart(error) ? <TextButton label="Bắt đầu lại" onPress={restart} /> : null}
            </View>
          ) : null}
        </RNScrollView>
        {/* Once the chatbot is ready the generate button is the only suggested action. */}
        {quick.length > 0 && !sending && !ready ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="grow-0" contentContainerClassName="gap-2 px-5 pb-2">
            {quick.map((q) => (
              <Pressable
                key={q}
                accessibilityRole="button"
                onPress={() => send(q)}
                className="min-h-11 justify-center rounded-full border border-tint px-4 active:opacity-70">
                <Text className="text-[15px] font-semibold text-tint-ink">{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {ready ? (
          <View className="px-5 pb-2">
            <PrimaryButton label="Tạo lộ trình" disabled={sending} onPress={generate} />
          </View>
        ) : null}
        <View className="mx-4 mb-2 flex-row items-end gap-2 rounded-[26px] border border-line bg-surface py-1.5 pr-1.5 pl-4">
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => send(text)}
            returnKeyType="send"
            submitBehavior="submit"
            multiline
            placeholder={missing ? `Nhắn cho AI · còn ${missing} mục` : 'Nhắn cho AI…'}
            placeholderTextColor={placeholder as string}
            accessibilityLabel="Tin nhắn"
            className="max-h-32 min-h-10 flex-1 py-2 text-[16px] text-ink"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => send(text)}
            className={`h-10 w-10 items-center justify-center rounded-full ${canSend ? 'bg-tint' : 'bg-well'}`}>
            <SymbolView
              name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
              size={18}
              weight="bold"
              tintColor={(canSend ? onTint : muted) as string}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
