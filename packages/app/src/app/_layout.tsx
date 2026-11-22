import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth, useSignedOutHref } from '@/auth';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Toaster } from '@/components/toast';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useAuth();
  const signedOutHref = useSignedOutHref();
  const router = useRouter();
  const wasSignedIn = useRef(false);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.tintText, background: c.background, card: c.background, text: c.text },
  };

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  // Signed out mid-session (sign-out button or a rejected refresh token): leave whatever screen is open
  // (lesson, quiz…), which the tab layout's redirect cannot reach because it is not focused.
  useEffect(() => {
    if (status === 'signedIn') wasSignedIn.current = true;
    else if (status === 'signedOut' && wasSignedIn.current) {
      wasSignedIn.current = false;
      if (router.canDismiss()) router.dismissAll();
      router.replace(signedOutHref);
    }
  }, [status, router, signedOutHref]);

  if (status === 'loading') return null;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        {/* The create flow slides in from the right over the tabs, and back out when closed.
            Singular: a double tap on the "Tạo" tab must not stack (and slide in) a second copy. */}
        <Stack.Screen name="new-path" dangerouslySingular options={{ animation: 'slide_from_right' }} />
      </Stack>
      <AnimatedSplashOverlay />
      <Toaster />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
