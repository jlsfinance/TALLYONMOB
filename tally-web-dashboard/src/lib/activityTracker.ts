import { supabase } from './insforge';

const QUEUE_KEY = 'tallylink_activity_queue';
const FLUSH_INTERVAL = 30000; // 30 seconds
const MAX_BATCH = 50;

let sessionId = crypto.randomUUID();
let flushTimer: ReturnType<typeof setInterval> | null = null;
let userId: string | null = null;
let companyId: string | null = null;

function getDeviceInfo() {
  return {
    platform: navigator.platform,
    language: navigator.language,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    userAgent: navigator.userAgent.slice(0, 200),
  };
}

function getQueue(): any[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(queue: any[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-500)));
}

async function flush() {
  const queue = getQueue();
  if (!queue.length || !userId) return;

  const batch = queue.splice(0, MAX_BATCH);
  saveQueue(queue);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-activity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ events: batch }),
      }
    );
  } catch (err) {
    // Re-queue on failure
    const currentQueue = getQueue();
    saveQueue([...batch, ...currentQueue]);
  }
}

export function initActivityTracker(uid: string, cid: string | null) {
  userId = uid;
  companyId = cid;

  // Flush on visibility change (user switches tab/minimizes)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  // Flush on page unload
  window.addEventListener('beforeunload', () => flush());

  // Periodic flush
  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL);
  }
}

export function trackEvent(event: {
  event_type: string;
  event_category?: string;
  page?: string;
  element?: string;
  metadata?: Record<string, any>;
  duration_ms?: number;
}) {
  if (!userId) return;

  const entry = {
    ...event,
    company_id: companyId,
    session_id: sessionId,
    device_info: getDeviceInfo(),
  };

  const queue = getQueue();
  queue.push(entry);
  saveQueue(queue);

  // Auto-flush when batch is full
  if (queue.length >= MAX_BATCH) flush();
}

// Convenience methods
export const track = {
  pageView: (page: string) => trackEvent({ event_type: 'page_view', event_category: 'navigation', page }),
  click: (page: string, element: string) => trackEvent({ event_type: 'click', event_category: 'interaction', page, element }),
  search: (page: string, query: string) => trackEvent({ event_type: 'search', event_category: 'interaction', page, metadata: { query } }),
  create: (page: string, entity: string) => trackEvent({ event_type: 'create', event_category: 'data', page, metadata: { entity } }),
  update: (page: string, entity: string) => trackEvent({ event_type: 'update', event_category: 'data', page, metadata: { entity } }),
  delete: (page: string, entity: string) => trackEvent({ event_type: 'delete', event_category: 'data', page, metadata: { entity } }),
  export: (page: string, format: string) => trackEvent({ event_type: 'export', event_category: 'data', page, metadata: { format } }),
  error: (page: string, error: string) => trackEvent({ event_type: 'error', event_category: 'error', page, metadata: { error } }),
  timeSpent: (page: string, ms: number) => trackEvent({ event_type: 'time_spent', event_category: 'engagement', page, duration_ms: ms }),
  feature_use: (page: string, feature: string) => trackEvent({ event_type: 'feature_use', event_category: 'engagement', page, element: feature }),
};

export function destroyActivityTracker() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush();
  userId = null;
  companyId = null;
}
