import { Redirect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView as RNScrollView } from 'react-native';

import { useAuth } from '@/auth';
import { StateMark } from '@/components/state-mark';
import { ApiError } from '@/lib/api';
import {
  chatPath,
  generatePath,
  startPath,
  type ChatMessage,
  type LearningPath,
  type Preferences,
} from '@/lib/learning-paths-api';
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View, useCSSVariable } from '@/tw';

type Step = 'chat' | 'generating' | 'review';

const GREETING: ChatMessage = {
  role: 'assistant',
  content: 'Chào bạn! Bạn muốn học chủ đề gì? Cứ nói tự nhiên, mình sẽ hỏi thêm vài điều để soạn lộ trình.',
};
const TOPIC_IDEAS = ['SQL căn bản', 'Tiếng Anh giao tiếp', 'Tài chính cá nhân'];
const LEVEL_LABEL = { beginner: 'Cơ bản', intermediate: 'Trung cấp', advanced: 'Nâng cao' } as const;

function errorText(e: unknown) {
  if (e instanceof ApiError && e.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng xuất và đăng nhập lại.';
  return 'Có lỗi xảy ra. Kiểm tra kết nối rồi thử lại.';
}

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
  const { session, status } = useAuth();
  const token = session?.accessToken ?? '';

  const [step, setStep] = useState<Step>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [prefs, setPrefs] = useState<Preferences>({});
  const [quick, setQuick] = useState<string[]>(TOPIC_IDEAS);
  // The chatbot decides when it has enough to build the path; the generate button waits for it.
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<LearningPath | null>(null);
  // The user's edited copy of the draft's modules; compared by reference to know if anything changed.
  const [modules, setModules] = useState<LearningPath['modules']>([]);
  const scroller = useRef<ComponentRef<typeof RNScrollView>>(null);
  const muted = useCSSVariable('--color-ink-muted');
  const onTint = useCSSVariable('--color-on-tint');
  const placeholder = useCSSVariable('--color-ink-muted');
  const missing = missingCount(prefs);

  if (status !== 'signedIn') return <Redirect href="/welcome" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const generate = async (p: Preferences) => {
    setStep('generating');
    setError(null);
    try {
      const draft = await generatePath(token, p);
      setPath(draft);
      setModules(draft.modules);
      setStep('review');
    } catch (e) {
      setError(errorText(e));
    }
  };

  const send = async (content: string) => {
    const value = content.trim();
    if (!value || sending) return;
    const next = [...messages, { role: 'user', content: value } as ChatMessage];
    setMessages(next);
    setText('');
    setQuick([]);
    setSending(true);
    setError(null);
    try {
      // The greeting is local, so it is not part of the conversation the server sees.
      const r = await chatPath(token, next.slice(1), prefs);
      setMessages([...next, { role: 'assistant', content: r.reply }]);
      setPrefs(r.preferences);
      setQuick(r.quickReplies);
      setReady(r.ready);
    } catch (e) {
      setError(errorText(e));
      setMessages(messages);
      setText(value);
    } finally {
      setSending(false);
    }
  };

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
      await startPath(token, path.id, edited ? modules : undefined);
      router.dismissTo('/courses');
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (step === 'generating') {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <Header title="Tạo lộ trình" onBack={close} />
        <View className="flex-1 items-center justify-center gap-4 px-5">
          {error ? (
            <>
              <Text accessibilityRole="alert" className="text-center text-[16px] leading-6 text-ink">
                {error}
              </Text>
              <View className="w-full gap-1">
                <PrimaryButton label="Thử lại" onPress={() => generate(prefs)} />
                <TextButton label="Quay lại trò chuyện" onPress={() => setStep('chat')} />
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
              {error}
            </Text>
          ) : null}
          <PrimaryButton label="Bắt đầu học" onPress={start} />
          <TextButton label="Quay lại trò chuyện" onPress={() => setStep('chat')} />
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
          {sending ? <Text className="pl-10 text-[14px] text-ink-muted">Đang trả lời…</Text> : null}
          {error ? (
            <Text accessibilityRole="alert" className="pl-10 text-[14px] text-tint-ink">
              {error}
            </Text>
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
            <PrimaryButton label="Tạo lộ trình" disabled={sending} onPress={() => generate(prefs)} />
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
