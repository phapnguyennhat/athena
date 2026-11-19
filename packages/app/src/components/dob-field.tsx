import { useState, type ComponentType, type Ref } from 'react';
import { Platform, TextInput as RNTextInput, TurboModuleRegistry } from 'react-native';

import { Pressable, Text, TextInput, View, useCSSVariable } from '@/tw';

const dobFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromIsoDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(2000, 0, 1);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** True only when the current native binary actually linked RNCDatePicker. */
function hasNativeDatePicker() {
  if (Platform.OS === 'web') return false;
  try {
    return TurboModuleRegistry.get('RNCDatePicker') != null;
  } catch {
    return false;
  }
}

type NativePickerProps = {
  value: Date;
  mode: 'date';
  display: 'spinner' | 'default';
  maximumDate?: Date;
  minimumDate?: Date;
  locale?: string;
  onChange: (event: { type?: string }, date?: Date) => void;
};

function loadNativePicker(): ComponentType<NativePickerProps> | null {
  if (!hasNativeDatePicker()) return null;
  try {
    // Lazy require so builds without the native module never touch getEnforcing at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-community/datetimepicker').default;
  } catch {
    return null;
  }
}

const DateTimePicker = loadNativePicker();

type Props = {
  value: string;
  onChange: (iso: string) => void;
  onBlur?: () => void;
  inputRef?: Ref<React.ComponentRef<typeof RNTextInput>>;
  error?: string;
  editable?: boolean;
};

/**
 * Platform date picker when the native module is present; otherwise a YYYY-MM-DD text field
 * so older/dev builds without a rebuild do not crash on TurboModuleRegistry.getEnforcing.
 */
export function DobField({ value, onChange, onBlur, inputRef, error, editable = true }: Props) {
  const [open, setOpen] = useState(false);
  const placeholderColor = useCSSVariable('--color-ink-muted');

  if (!DateTimePicker) {
    return (
      <View className="gap-1.5">
        <Text className="text-sm font-semibold text-ink-muted">Ngày sinh</Text>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={typeof placeholderColor === 'string' ? placeholderColor : '#A6A6AE'}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          editable={editable}
          underlineColorAndroid="transparent"
          textAlignVertical="center"
          style={{ paddingVertical: 12, paddingHorizontal: 16 }}
          accessibilityLabel="Ngày sinh"
          accessibilityHint={error}
          className={`min-h-[52px] rounded-[14px] border bg-surface px-4 py-3 text-base leading-5 text-ink ${error ? 'border-tint-ink' : 'border-line'}`}
        />
      </View>
    );
  }

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-ink-muted">Ngày sinh</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chọn ngày sinh"
        accessibilityHint={error}
        disabled={!editable}
        onPress={() => setOpen(true)}
        className={`min-h-[52px] justify-center rounded-[14px] border bg-surface px-4 py-3 active:opacity-80 ${error ? 'border-tint-ink' : 'border-line'}`}>
        <Text className={`text-base leading-5 ${value ? 'text-ink' : 'text-ink-muted'}`}>
          {value ? dobFormatter.format(fromIsoDate(value)) : 'Chọn ngày'}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={fromIsoDate(value || '2000-01-01')}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date(new Date().setDate(new Date().getDate() - 1))}
          minimumDate={new Date(1900, 0, 1)}
          locale="vi-VN"
          onChange={(event: { type?: string }, date?: Date) => {
            if (Platform.OS === 'android') {
              setOpen(false);
              onBlur?.();
            }
            if (event.type === 'dismissed') return;
            if (date) onChange(toIsoDate(date));
          }}
        />
      ) : null}
      {Platform.OS === 'ios' && open ? (
        <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onBlur?.(); }} className="min-h-11 items-end justify-center">
          <Text className="text-base font-semibold text-tint-ink">Xong</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
