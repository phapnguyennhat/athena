import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/auth';
import AppTabs from '@/components/app-tabs';
import { getMe, updateTimezone } from '@/lib/learning-api';

/** Streak days are counted in the user's timezone: keep the server's copy in step with the device, silently. */
async function syncTimezone() {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!device) return;
  const me = await getMe();
  if (me.timezone !== device) await updateTimezone(device);
}

export default function TabLayout() {
  const { status } = useAuth();
  useEffect(() => {
    if (status === 'signedIn') syncTimezone().catch(() => undefined);
  }, [status]);
  if (status !== 'signedIn') return <Redirect href="/welcome" />;
  return <AppTabs />;
}
