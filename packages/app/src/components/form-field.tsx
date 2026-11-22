import type { TextInput as RNTextInput } from 'react-native';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

import { Text, TextInput, View, useCSSVariable } from '@/tw';

export type InputRef = React.ComponentRef<typeof RNTextInput>;

type FieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoComplete?: 'email' | 'password' | 'new-password' | 'current-password' | 'name' | 'birthdate-full' | 'one-time-code' | 'off';
  textContentType?: 'emailAddress' | 'password' | 'newPassword' | 'name' | 'birthdate' | 'oneTimeCode' | 'none';
  editable?: boolean;
  returnKeyType?: 'next' | 'done' | 'go';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<InputRef | null>;
  accessibilityLabel?: string;
};

/** Labelled text input bound to a react-hook-form field, with its validation message under it. */
export function Field<T extends FieldValues>({
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
