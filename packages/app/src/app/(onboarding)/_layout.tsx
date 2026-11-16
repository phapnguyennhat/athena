import { Redirect, Stack } from 'expo-router';

import { isSignedIn } from '@/auth';

export default function OnboardingLayout() {
  if (isSignedIn) return <Redirect href="/" />;
  return (
    <Stack>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ title: 'Tài khoản', headerBackTitle: 'Quay lại' }} />
    </Stack>
  );
}
