import { Redirect } from 'expo-router';

import { isSignedIn } from '@/auth';
import AppTabs from '@/components/app-tabs';

export default function TabLayout() {
  if (!isSignedIn) return <Redirect href="/welcome" />;
  return <AppTabs />;
}
