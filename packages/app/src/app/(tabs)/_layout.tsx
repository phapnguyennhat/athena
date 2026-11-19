import { Redirect } from 'expo-router';

import { useAuth } from '@/auth';
import AppTabs from '@/components/app-tabs';

export default function TabLayout() {
  const { status } = useAuth();
  if (status !== 'signedIn') return <Redirect href="/welcome" />;
  return <AppTabs />;
}
