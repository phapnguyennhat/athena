import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useForm } from 'react-hook-form';

import { useAuth } from '@/auth';
import { Field } from '@/components/form-field';
import { ScreenHeader } from '@/components/screen-header';
import { toast } from '@/components/toast';
import { changePassword } from '@/lib/auth-api';
import { changePasswordSchema, type ChangePasswordForm } from '@/lib/auth-schemas';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';

export default function ChangePasswordScreen() {
  const { setSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const { control, handleSubmit } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const submit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setBusy(true);
    try {
      await setSession(await changePassword({ currentPassword, newPassword }));
      toast.info('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.');
      router.back();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScreenHeader title="Đổi mật khẩu" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerClassName="gap-4 px-5 pt-2 pb-6" keyboardShouldPersistTaps="handled">
          <Field
            control={control}
            name="currentPassword"
            label="Mật khẩu hiện tại"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
          />
          <Field
            control={control}
            name="newPassword"
            label="Mật khẩu mới"
            placeholder="Tối thiểu 8 ký tự"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!busy}
          />
          <Field
            control={control}
            name="confirmPassword"
            label="Nhập lại mật khẩu mới"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
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
            className={`min-h-14 flex-row items-center justify-center gap-2 rounded-[28px] bg-tint ${busy ? 'opacity-70' : 'active:opacity-80'}`}>
            {busy ? <ActivityIndicator color="#0E0E10" /> : null}
            <Text className="text-base font-bold text-on-tint">Đổi mật khẩu</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
