import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth';

export default function OnboardingLayout() {
  const { status } = useAuth();
  if (status === 'signedIn') return <Redirect href="/" />;

  return (
    <Stack>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ headerShown: false, animation: 'slide_from_right' }} />
    </Stack>
  );
}
