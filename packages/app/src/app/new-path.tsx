import { Redirect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView as RNScrollView } from 'react-native';
import { ChatSkeleton, PathSkeleton } from '@/components/skeleton';
import { CourseRow } from '@/components/community-cards';
import { copyCommunityPath, type CommunityPath } from '@/lib/community-api';

import { useAuth, useSignedOutHref } from '@/auth';
import { StateMark } from '@/components/state-mark';
import { TypingBubble } from '@/components/typing-bubble';
import { ApiError } from '@/lib/api';
import {
  generatePath,
  getCurrentConversation,
  getMatches,
  getPath,
  sendMessage,
  startConversation,
  startPath,
  LEVEL_LABEL,
  type ChatMessage,
  type ConversationView,
  type LearningPath,
  type Preferences,
} from '@/lib/learning-paths-api';
import { describeError } from '@/lib/errors';
import { watchJob } from '@/lib/socket';
import { toast } from '@/components/toast';
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View, useCSSVariable } from '@/tw';

type Step = 'loading' | 'chat' | 'matches' | 'generating' | 'review';
/** An API error or a failed job's code; anything else (e.g. network) falls back to the generic copy. */
type Failure = { status?: number; code?: string | null };


const currentConversation = async () => (await getCurrentConversation()) ?? (await startConversation());
const toFailure = (e: unknown): Failure => (e instanceof ApiError ? e : {});
const describe = (f: Failure) => describeError(f instanceof ApiError ? f : f.code ? { code: f.code } : new TypeError());
/** These errors are only fixed by a fresh conversation. */
const needsRestart = (e: Failure | null) => e?.code === 'CONVERSATION_LIMIT' || e?.code === 'CONVERSATION_CLOSED';

/** Required before generating. Mirrors the server's `ready` rule. */
const missingCount = (p: Preferences) => [p.topic, p.level].filter((v) => !v).length;

function Header({ title, onBack, onNewChat }: { title: string; onBack: () => void; onNewChat?: () => void }) {
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
      {onNewChat ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cuộc trò chuyện mới"
          onPress={onNewChat}
          className="h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-70">
          <SymbolView name={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }} size={18} tintColor={ink as string} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** What the chat has learned so far, as a compact strip under the header so progress stays visible while chatting. */
function Brief({ p }: { p: Preferences }) {
  const check = useCSSVariable('--color-tint-ink');
  const items = [
    ['Chủ đề', p.topic],
    ['Trình độ', p.level && LEVEL_LABEL[p.level]],
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

function TextButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 items-center justify-center active:opacity-70 ${disabled ? 'opacity-50' : ''}`}>
      <Text className="text-[15px] font-semibold text-tint-ink">{label}</Text>
    </Pressable>
  );
}

export default function NewPathScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const signedOutHref = useSignedOutHref();

  const [step, setStep] = useState<Step>('loading');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prefs, setPrefs] = useState<Preferences>({});
  // The chatbot decides when it has enough to build the path; the generate button waits for it.
  const [ready, setReady] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Kept for the recovery buttons; the message itself goes to the toast.
  const [error, setErrorState] = useState<Failure | null>(null);
  const setError = useCallback((f: Failure | null) => {
    setErrorState(f);
    if (f && f.status !== 401) toast.error(describe(f)); // 401: session handling navigates, no message
  }, []);
  // On the generating step, "Thử lại" reloads the conversation instead of starting another (costly) job.
  const [retryLoad, setRetryLoad] = useState(false);
  const [path, setPath] = useState<LearningPath | null>(null);
  // Public courses close to the brief: copying one costs no AI calls, so they are offered before generating.
  const [matches, setMatches] = useState<CommunityPath[]>([]);
  const [checking, setChecking] = useState(false);
  // State lags a render behind, so a quick double tap would pass a `checking` test.
  const busy = useRef(false);
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
  }, [status, open, setError]);

  const reload = (fetch: () => Promise<ConversationView>) => {
    setStep('loading');
    setError(null);
    fetch()
      .then(open)
      .catch((e: unknown) => setError(toFailure(e)));
  };
  const resume = () => reload(currentConversation);
  const restart = () => reload(startConversation);
  // Starting over closes this conversation (and deletes its draft), so confirm once the user has said something.
  const newChat = () => {
    if (!messages.some((m) => m.role === 'user')) return restart();
    Alert.alert('Bắt đầu cuộc trò chuyện mới?', 'Cuộc trò chuyện hiện tại sẽ được đóng lại.', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Bắt đầu mới', style: 'destructive', onPress: restart },
    ]);
  };

  // Wait for the job (socket + re-reads); only its terminal status changes the screen.
  useEffect(() => {
    if (step !== 'generating' || !jobId || error) return;
    let active = true;
    const stop = watchJob(jobId, async (job) => {
      if (job.status === 'failed') {
        setRetryLoad(false);
        return setError({ code: job.errorCode });
      }
      try {
        const draft = await getPath(job.resultId!);
        if (active) showDraft(draft);
      } catch (e) {
        if (!active) return;
        setRetryLoad(true);
        setError(toFailure(e));
      }
    });
    return () => {
      active = false;
      stop();
    };
  }, [step, jobId, error, showDraft, setError]);

  if (status !== 'signedIn') return <Redirect href={signedOutHref} />;

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

  /** Offers matching courses first; none, or any search error, goes straight to generating. */
  const offer = async () => {
    if (!conversationId || busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const found = await getMatches(conversationId).catch(() => []);
      if (!found.length) return await generate();
      setMatches(found);
      setStep('matches');
    } finally {
      busy.current = false;
      setChecking(false);
    }
  };

  const take = async (course: CommunityPath) => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setError(null);
    try {
      const pathId = course.copiedPathId ?? (await copyCommunityPath(course.id)).id;
      // Closes this chat so "Tạo lộ trình" starts fresh next time; a failure here only leaves it open.
      await startConversation().catch(() => {});
      router.replace(`/paths/${pathId}`);
    } catch (e) {
      setError(toFailure(e));
    } finally {
      busy.current = false;
      setChecking(false);
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
      router.replace(`/paths/${path.id}`);
    } catch (e) {
      setError(toFailure(e));
    }
  };

  if (step === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <Header title="Tạo lộ trình với AI" onBack={close} />
        {error ? (
          <View className="flex-1 justify-center gap-3 px-5">
            <Text className="text-center text-[16px] leading-6 text-ink-muted">Chưa tải được cuộc trò chuyện.</Text>
            <PrimaryButton label="Thử lại" onPress={resume} />
          </View>
        ) : (
          <ChatSkeleton />
        )}
      </SafeAreaView>
    );
  }

  if (step === 'matches') {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <Header title="Đã có khoá học tương tự" onBack={backToChat} />
        <ScrollView contentContainerClassName="gap-4 px-5 pt-2 pb-6">
          <Text className="text-[15px] leading-[22px] text-ink-muted">
            Những khoá này gần với chủ đề của bạn. Học ngay một khoá, hoặc để AI soạn lộ trình mới.
          </Text>
          {matches.map((c) => (
            <View key={c.id} className="gap-1">
              <CourseRow course={c} onPress={() => router.push(`/community/${c.id}`)} />
              <TextButton
                label={c.copiedPathId ? 'Mở khoá học' : 'Học khoá này'}
                disabled={checking}
                onPress={() => take(c)}
              />
            </View>
          ))}
        </ScrollView>
        <View className="px-5 pb-2">
          <PrimaryButton label="Vẫn tạo khoá mới" disabled={checking} onPress={generate} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'generating') {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <Header title="Tạo lộ trình" onBack={close} />
        <View className={`flex-1 gap-4 ${error ? 'items-center justify-center px-5' : ''}`}>
          {error ? (
            <>
              <Text className="text-center text-[17px] font-semibold text-ink">Chưa tạo được lộ trình.</Text>
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
            <View className="w-full flex-1 pt-2">
              <PathSkeleton caption={`Đang soạn lộ trình cho ${prefs.topic ?? 'bạn'}… việc này có thể mất vài chục giây.`} />
            </View>
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
        <Header title="Tạo lộ trình với AI" onBack={close} onNewChat={sending ? undefined : newChat} />
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
          {needsRestart(error) ? (
            <View className="items-start pl-10">
              <TextButton label="Bắt đầu lại" onPress={restart} />
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
            <PrimaryButton label="Tạo lộ trình" disabled={sending || checking} onPress={offer} />
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
            placeholder={missing ? 'Chủ đề và trình độ của bạn…' : 'Nhắn cho AI…'}

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
