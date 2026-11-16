import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

// shortcut: placeholder so Welcome's actions land somewhere; the Account step is the next onboarding screen to build.
export default function AccountScreen() {
  const { mode } = useLocalSearchParams<{ mode?: 'sign-in' | 'sign-up' }>();
  return (
    <View style={styles.container}>
      <ThemedText>{mode === 'sign-in' ? 'Đăng nhập' : 'Tạo tài khoản'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four },
});
