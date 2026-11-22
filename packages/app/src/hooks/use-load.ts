import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from '@/components/toast';

/**
 * Loads data when the screen gains focus (so it is fresh after returning from a child screen); that reload is silent.
 * `refresh` is for pull-to-refresh: only it sets `refreshing`, so the spinner never shows just for switching tabs.
 * Errors go to the toast; `error` is kept so the screen can offer a retry instead of an empty state.
 */
export function useLoad<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(fetcher);
  useEffect(() => {
    latest.current = fetcher;
  });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const d = await latest.current();
      if (id !== seq.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (id !== seq.current) return;
      setError(e);
      toast.fromError(e);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, setData, error, loading, reload, refreshing, refresh };
}
