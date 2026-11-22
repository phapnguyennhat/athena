import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useForm } from 'react-hook-form';

import { useAuth } from '@/auth';
import { Field } from '@/components/form-field';
import { ScreenHeader } from '@/components/screen-header';
import { toast } from '@/components/toast';
import { deleteAccount } from '@/lib/auth-api';
import { deleteAccountSchema, type DeleteAccountForm } from '@/lib/auth-schemas';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';

const TITLE = 'Xoá tài khoản?';
const BODY = 'Bạn sẽ bị đăng xuất trên mọi thiết bị và không thể khôi phục tài khoản này.';

/** Native Alert does nothing on web, so web asks with the browser's confirm. */
function confirmDelete(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm(`${TITLE}\n\n${BODY}`));
  return new Promise((resolve) =>
    Alert.alert(TITLE, BODY, [
      { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Xoá', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const { control, handleSubmit } = useForm<DeleteAccountForm>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: '' },
  });

  const submit = handleSubmit(async ({ password }) => {
    if (!(await confirmDelete())) return;
    setBusy(true);
    try {
      await deleteAccount({ password });
      // The server already revoked every token; this clears them here and leaves for the welcome screen.
      await signOut();
      toast.info('Đã xoá tài khoản.');
    } catch (e) {
      toast.fromError(e);
      setBusy(false);
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScreenHeader title="Xoá tài khoản" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerClassName="gap-4 px-5 pt-2 pb-6" keyboardShouldPersistTaps="handled">
          <Text className="text-[16px] leading-6 text-ink-muted">
            Lộ trình, bài học và chuỗi ngày học của bạn sẽ không còn truy cập được. Nhập mật khẩu để xác nhận.
          </Text>
          <Field
            control={control}
            name="password"
            label="Mật khẩu"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => submit()}
            editable={!busy}
          />
        </ScrollView>
        <View className="mx-5 mb-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy }}
            disabled={busy}
            onPress={() => submit()}
            className={`min-h-14 flex-row items-center justify-center gap-2 rounded-[28px] border border-line bg-surface ${busy ? 'opacity-70' : 'active:opacity-70'}`}>
            {busy ? <ActivityIndicator /> : null}
            <Text className="text-base font-bold text-tint-ink">Xoá tài khoản</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
