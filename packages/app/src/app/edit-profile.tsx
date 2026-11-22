import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Controller, useForm } from 'react-hook-form';

import { DobField } from '@/components/dob-field';
import { Field } from '@/components/form-field';
import { ScreenHeader } from '@/components/screen-header';
import { toast } from '@/components/toast';
import { profileSchema, type ProfileForm } from '@/lib/auth-schemas';
import { updateProfile } from '@/lib/learning-api';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';

/** Opened from the profile tab with the current values as params; the tab reloads on return. */
export default function EditProfileScreen() {
  const params = useLocalSearchParams<{ fullName?: string; dateOfBirth?: string }>();
  const [busy, setBusy] = useState(false);
  const { control, handleSubmit } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: params.fullName ?? '', dateOfBirth: params.dateOfBirth ?? '' },
  });

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      await updateProfile(values);
      toast.info('Đã lưu hồ sơ.');
      router.back();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScreenHeader title="Sửa hồ sơ" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerClassName="gap-4 px-5 pt-2 pb-6" keyboardShouldPersistTaps="handled">
          <Field
            control={control}
            name="fullName"
            label="Họ và tên"
            placeholder="Nguyễn Minh Anh"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            editable={!busy}
          />
          <Controller
            control={control}
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
        </ScrollView>
        <View className="mx-5 mb-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy }}
            disabled={busy}
            onPress={() => submit()}
            className={`min-h-14 flex-row items-center justify-center gap-2 rounded-[28px] bg-tint ${busy ? 'opacity-70' : 'active:opacity-80'}`}>
            {busy ? <ActivityIndicator color="#0E0E10" /> : null}
            <Text className="text-base font-bold text-on-tint">Lưu</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
