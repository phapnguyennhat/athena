import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_URL, authFetch, currentAccessToken } from '@/lib/api';
import { getJob, type JobStatus } from '@/lib/learning-paths-api';

export type JobUpdate = { jobId: string; type: string; status: JobStatus; resultId: string | null; errorCode: string | null };

const AUTH_RETRY_MS = 30_000;

let socket: Socket | null = null;
let lastAuthRetry = 0;

export function getSocket(): Socket {
  if (socket) return socket;
  const s = io(`${API_URL}/events`, {
    transports: ['websocket'],
    auth: (cb) => {
      currentAccessToken().then((token) => cb({ token }));
    },
  });
  // The server disconnects after auth_error, which socket.io never auto-reconnects; refresh once, then retry.
  s.on('auth_error', async () => {
    s.disconnect();
    if (Date.now() - lastAuthRetry < AUTH_RETRY_MS) return;
    lastAuthRetry = Date.now();
    try {
      await authFetch('/auth/me'); // a 401 here runs the shared token refresh
    } catch {
      return;
    }
    // Signed out (or replaced by a newer socket) meanwhile: stay disconnected.
    if (socket === s && (await currentAccessToken())) s.connect();
  });
  socket = s;
  return s;
}

export function onJobUpdated(jobId: string, fn: (update: JobUpdate) => void): () => void {
  const s = getSocket();
  const handler = (update: JobUpdate) => {
    if (update.jobId === jobId) fn(update);
  };
  s.on('job.updated', handler);
  return () => {
    s.off('job.updated', handler);
  };
}

const JOB_POLL_MS = 15_000;

/**
 * Calls `onSettled` once, when the job succeeds or fails. Socket events are a speed-up only: the job is also re-read
 * on (re)connect, on app foreground, every 15 s and right away (it may have finished before we subscribed).
 * Returns the unsubscribe.
 */
export function watchJob(
  jobId: string,
  onSettled: (job: { status: 'succeeded' | 'failed'; resultId: string | null; errorCode: string | null }) => void,
): () => void {
  let done = false;
  const apply = (j: { status: JobStatus; resultId: string | null; errorCode: string | null }) => {
    if (done || (j.status !== 'succeeded' && j.status !== 'failed')) return;
    done = true;
    stop();
    onSettled({ status: j.status, resultId: j.resultId, errorCode: j.errorCode });
  };
  const check = () => {
    getJob(jobId).then(apply, () => undefined); // the next trigger retries
  };
  const s = getSocket();
  const off = onJobUpdated(jobId, apply);
  s.on('connect', check);
  const appState = AppState.addEventListener('change', (st) => st === 'active' && check());
  const timer = setInterval(check, JOB_POLL_MS);
  function stop() {
    off();
    s.off('connect', check);
    appState.remove();
    clearInterval(timer);
  }
  check();
  return () => {
    done = true;
    stop();
  };
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
