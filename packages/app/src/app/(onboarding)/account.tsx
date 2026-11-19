import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, TextInput as RNTextInput } from 'react-native';
import { Controller, useForm, useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';

import { useAuth } from '@/auth';
import { BrandMark } from '@/components/brand-mark';
import { DobField } from '@/components/dob-field';
import { StateMark, type MarkState } from '@/components/state-mark';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiError } from '@/lib/api';
import { resendVerification, signIn, signUp, verifyEmail } from '@/lib/auth-api';
import {
  profileSchema,
  signInSchema,
  signUpCredentialsSchema,
  verificationSchema,
  type CredentialsForm,
  type ProfileForm,
  type VerificationForm,
} from '@/lib/auth-schemas';
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View, useCSSVariable } from '@/tw';
type InputRef = React.ComponentRef<typeof RNTextInput>;
type Mode = 'sign-in' | 'sign-up';
type SignUpStep = 'credentials' | 'profile' | 'verify';

const SIGN_UP_STEPS: SignUpStep[] = ['credentials', 'profile', 'verify'];
const STEP_LABEL: Record<SignUpStep, string> = {
  credentials: 'Email',
  profile: 'Hồ sơ',
  verify: 'Xác minh',
};

function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  } catch {
    return 'Asia/Ho_Chi_Minh';
  }
}

function markStates(stepIndex: number, total: number): MarkState[] {
  return Array.from({ length: total }, (_, i) => {
    if (i < stepIndex) return 'done';
    if (i === stepIndex) return 'progress';
    return 'todo';
  });
}

type FieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoComplete?: 'email' | 'password' | 'name' | 'birthdate-full' | 'one-time-code' | 'off';
  textContentType?: 'emailAddress' | 'password' | 'name' | 'birthdate' | 'oneTimeCode' | 'none';
  editable?: boolean;
  returnKeyType?: 'next' | 'done' | 'go';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<InputRef | null>;
  accessibilityLabel?: string;
};

function Field<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  editable = true,
  returnKeyType,
  onSubmitEditing,
  inputRef,
  accessibilityLabel,
}: FieldProps<T>) {
  const placeholderColor = useCSSVariable('--color-ink-muted');
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-ink-muted">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <>
            <TextInput
              ref={(instance) => {
                field.ref(instance);
                if (inputRef) inputRef.current = instance;
              }}
              value={field.value as string}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder={placeholder}
              placeholderTextColor={typeof placeholderColor === 'string' ? placeholderColor : '#A6A6AE'}
              secureTextEntry={secureTextEntry}
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              autoCorrect={false}
              autoComplete={autoComplete}
              textContentType={textContentType}
              editable={editable}
              returnKeyType={returnKeyType}
              onSubmitEditing={onSubmitEditing}
              underlineColorAndroid="transparent"
              textAlignVertical="center"
              style={{ paddingVertical: 12, paddingHorizontal: 16 }}
              accessibilityLabel={accessibilityLabel ?? label}
              accessibilityHint={fieldState.error?.message}
              className={`min-h-[52px] rounded-[14px] border bg-surface px-4 py-3 text-base leading-5 text-ink ${fieldState.error ? 'border-tint-ink' : 'border-line'}`}
            />
            {fieldState.error ? (
              <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-tint-ink">
                {fieldState.error.message}
              </Text>
            ) : null}
          </>
        )}
      />
    </View>
  );
}

export default function AccountScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: Mode }>();
  const { setSession } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const ink = Colors[scheme].text;

  const mode: Mode = modeParam === 'sign-in' ? 'sign-in' : 'sign-up';
  const [step, setStep] = useState<SignUpStep>('credentials');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const credentialsForm = useForm<CredentialsForm>({
    resolver: zodResolver(mode === 'sign-in' ? signInSchema : signUpCredentialsSchema),
    defaultValues: { email: '', password: '' },
  });
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '', dateOfBirth: '' },
  });
  const verificationForm = useForm<VerificationForm>({
    resolver: zodResolver(verificationSchema),
    defaultValues: { code: '' },
  });
  const email = useWatch({ control: credentialsForm.control, name: 'email' }) ?? '';
  const passwordRef = useRef<InputRef>(null);
  const codeRefs = useRef<(InputRef | null)[]>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const showingVerify = step === 'verify';
  const showingMarks = mode === 'sign-up' || showingVerify;
  const stepIndex = showingVerify ? 2 : mode === 'sign-up' ? SIGN_UP_STEPS.indexOf(step) : 0;
  const marks = showingMarks ? markStates(stepIndex, 3) : [];

  const headline =
    mode === 'sign-in' && !showingVerify
      ? 'Đăng nhập'
      : step === 'credentials'
        ? 'Email và mật khẩu'
        : step === 'profile'
          ? 'Tên và ngày sinh'
          : 'Nhập mã xác minh';

  const body =
    mode === 'sign-in' && !showingVerify
      ? 'Tiếp tục lộ trình bạn đã bắt đầu.'
      : step === 'credentials'
        ? 'Dùng email của bạn. Mật khẩu tối thiểu 8 ký tự.'
        : step === 'profile'
          ? 'Dùng để cá nhân hoá lộ trình. Chỉ bạn thấy thông tin này.'
          : `Chúng tôi đã gửi mã 6 số tới ${email || 'email của bạn'}.`;

  const ctaLabel =
    busy
      ? 'Đang xử lý…'
      : showingVerify
        ? 'Xác minh'
        : mode === 'sign-in'
          ? 'Đăng nhập'
          : step === 'profile'
            ? 'Tạo tài khoản'
            : 'Tiếp tục';

  function switchMode(next: Mode) {
    setStep('credentials');
    setError(null);
    credentialsForm.clearErrors();
    profileForm.clearErrors();
    verificationForm.reset();
    router.setParams({ mode: next });
  }

  async function submitVerification({ code }: VerificationForm) {
    const credentials = credentialsForm.getValues();
    setBusy(true);
    try {
      await verifyEmail({ email: credentials.email.trim().toLowerCase(), code });
      const tokens = await signIn({ email: credentials.email.trim().toLowerCase(), password: credentials.password });
      await setSession(tokens);
      router.replace('/');
    } catch (e) {
      setError(humanError(e, 'Mã không đúng hoặc đã hết hạn. Thử lại hoặc gửi mã mới.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitSignIn(credentials: CredentialsForm) {
    setBusy(true);
    try {
      const tokens = await signIn(credentials);
      await setSession(tokens);
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'email_unverified') {
        setStep('verify');
        verificationForm.reset();
        setResendIn(60);
        setError('Email chưa xác minh. Chúng tôi vừa gửi mã mới.');
      } else {
        setError(humanError(e, 'Email hoặc mật khẩu chưa đúng.'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitSignUp(profile: ProfileForm) {
    setBusy(true);
    try {
      await signUp({
        ...credentialsForm.getValues(),
        fullName: profile.fullName,
        dateOfBirth: profile.dateOfBirth,
        timezone: deviceTimezone(),
      });
      verificationForm.reset();
      setStep('verify');
      setResendIn(60);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('Email này đã có tài khoản. Hãy đăng nhập.');
      } else {
        setError(humanError(e, 'Không tạo được tài khoản. Thử lại.'));
      }
    } finally {
      setBusy(false);
    }
  }

  function onPrimary() {
    if (busy) return;
    setError(null);

    if (showingVerify) {
      void verificationForm.handleSubmit(submitVerification)();
      return;
    }

    if (mode === 'sign-in') {
      void credentialsForm.handleSubmit(submitSignIn)();
      return;
    }

    if (step === 'credentials') {
      void credentialsForm.handleSubmit(({ email }) => {
        credentialsForm.setValue('email', email);
        setStep('profile');
      })();
      return;
    }

    if (step === 'profile') {
      void profileForm.handleSubmit(submitSignUp)();
    }
  }

  async function onResend() {
    if (resendIn > 0 || busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await resendVerification({ email: email.trim().toLowerCase() });
      setResendIn(60);
    } catch (e) {
      setError(humanError(e, 'Chưa gửi được mã. Thử lại sau.'));
    } finally {
      setBusy(false);
    }
  }

  function onCodeDigit(index: number, raw: string, current: string, onChange: (value: string) => void) {
    const next = current.padEnd(6, ' ').split('');
    const digits = raw.replace(/\D/g, '').slice(0, 6 - index);
    if (digits) {
      for (const [offset, digit] of [...digits].entries()) next[index + offset] = digit;
    } else {
      next[index] = ' ';
    }
    onChange(next.join('').trimEnd());
    if (digits) codeRefs.current[Math.min(index + digits.length, 5)]?.focus();
    else if (index > 0) codeRefs.current[index - 1]?.focus();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
        style={{ flex: 1 }}>
        <View className="mr-5 ml-5 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            hitSlop={8}
            onPress={() => {
              if (mode === 'sign-up' && step === 'profile') {
                setStep('credentials');
                setError(null);
                return;
              }
              if (showingVerify && mode === 'sign-in') {
                setStep('credentials');
                setError(null);
                return;
              }
              if (router.canGoBack()) router.back();
              else router.replace('/welcome');
            }}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-70">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={18}
              tintColor={ink}
            />
          </Pressable>
          <BrandMark />
        </View>

        {showingMarks ? (
          <View className="mr-5 mt-5 ml-5 flex-row items-center gap-1.5">
            {marks.map((state, i) => (
              <StateMark key={SIGN_UP_STEPS[i]} state={state} />
            ))}
            <Text className="ml-1.5 text-xs font-medium text-ink-muted">
              Bước {stepIndex + 1} / 3 · {STEP_LABEL[SIGN_UP_STEPS[stepIndex]]}
            </Text>
          </View>
        ) : null}

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="grow px-5 pb-4"
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag">
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.35}
            className={`text-3xl leading-9 font-black tracking-[-0.5px] text-ink ${showingMarks ? 'mt-7' : 'mt-8'}`}>
            {headline}
          </Text>
          <Text maxFontSizeMultiplier={1.4} className="mt-2 text-base leading-6 text-ink-muted">
            {body}
          </Text>

          <View className="mt-7 gap-3.5">
            {showingVerify ? (
              <Controller
                control={verificationForm.control}
                name="code"
                render={({ field, fieldState }) => (
                  <View className="gap-2">
                    <View className="flex-row justify-between gap-2">
                      {Array.from({ length: 6 }, (_, i) => (
                        <TextInput
                          key={i}
                          ref={(el) => {
                            codeRefs.current[i] = el;
                            if (i === 0) field.ref(el);
                          }}
                          value={field.value[i] === ' ' ? '' : field.value[i] ?? ''}
                          onChangeText={(v) => onCodeDigit(i, v, field.value, field.onChange)}
                          onBlur={field.onBlur}
                          keyboardType="number-pad"
                          textContentType="oneTimeCode"
                          autoComplete="one-time-code"
                          maxLength={6}
                          accessibilityLabel={`Chữ số ${i + 1}`}
                          accessibilityHint={fieldState.error?.message}
                          className={`h-14 flex-1 rounded-[14px] border bg-surface py-3 text-center text-xl font-bold text-ink ${fieldState.error ? 'border-tint-ink' : 'border-line'}`}
                        />
                      ))}
                    </View>
                    {fieldState.error ? (
                      <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-tint-ink">
                        {fieldState.error.message}
                      </Text>
                    ) : null}
                  </View>
                )}
              />
            ) : null}

            {!showingVerify && (mode === 'sign-in' || step === 'credentials') ? (
              <>
                <Field
                  control={credentialsForm.control}
                  name="email"
                  label="Email"
                  placeholder="ban@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!busy}
                />
                <Field
                  control={credentialsForm.control}
                  name="password"
                  label="Mật khẩu"
                  placeholder={mode === 'sign-in' ? 'Nhập mật khẩu' : 'Tối thiểu 8 ký tự'}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={onPrimary}
                  inputRef={passwordRef}
                  editable={!busy}
                />
              </>
            ) : null}

            {!showingVerify && mode === 'sign-up' && step === 'profile' ? (
              <>
                <Field
                  control={profileForm.control}
                  name="fullName"
                  label="Họ và tên"
                  placeholder="Nguyễn Minh Anh"
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  editable={!busy}
                />
                <Controller
                  control={profileForm.control}
                  name="dateOfBirth"
                  render={({ field, fieldState }) => (
                    <View className="gap-1.5">
                      <DobField
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        inputRef={field.ref}
                        error={fieldState.error?.message}
                        editable={!busy}
                      />
                      {fieldState.error ? (
                        <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-tint-ink">
                          {fieldState.error.message}
                        </Text>
                      ) : null}
                    </View>
                  )}
                />
              </>
            ) : null}
          </View>

          {error ? (
            <Text accessibilityLiveRegion="polite" className="mt-3 text-sm leading-5 text-tint-ink">
              {error}
            </Text>
          ) : null}

          {showingVerify ? (
            <Pressable
              accessibilityRole="button"
              disabled={resendIn > 0 || busy}
              onPress={onResend}
              className="mt-4 min-h-11 justify-center active:opacity-70">
              <Text className={`text-base ${resendIn > 0 ? 'text-ink-muted' : 'font-semibold text-tint-ink'}`}>
                {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : 'Gửi lại mã'}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View className="mr-5 mb-2 ml-5 gap-1">
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onPrimary}
            android_ripple={{ color: 'rgba(14, 14, 16, 0.18)' }}
            className={`min-h-14 flex-row items-center justify-center gap-2 overflow-hidden rounded-[28px] bg-tint ${busy ? 'opacity-70' : 'ios:active:opacity-80'}`}>
            {busy ? <ActivityIndicator color="#0E0E10" /> : null}
            <Text className="text-base font-bold text-on-tint">{ctaLabel}</Text>
          </Pressable>

          {!showingVerify ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
              className="min-h-12 items-center justify-center active:opacity-70">
              <Text className="text-base text-ink-muted">
                {mode === 'sign-in' ? (
                  <>
                    Chưa có tài khoản? <Text className="font-semibold text-tint-ink">Tạo tài khoản</Text>
                  </>
                ) : (
                  <>
                    Đã có tài khoản? <Text className="font-semibold text-tint-ink">Đăng nhập</Text>
                  </>
                )}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function humanError(e: unknown, fallback: string) {
  if (e instanceof ApiError) {
    if (typeof e.message === 'string' && e.message && !e.message.startsWith('HTTP ')) return e.message;
  }
  if (e instanceof TypeError) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
  return fallback;
}
