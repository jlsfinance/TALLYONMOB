// Added to the Workbox service worker; push payloads never carry account credentials.
if (self.location.pathname === '/reminder-push-worker.js') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
}
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === 'string' ? payload.title : 'TallyLink reminder';
  const body = typeof payload.body === 'string' ? payload.body : 'Open TallyLink to view your reminder.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//') ? payload.url : '/dashboard';
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/app_icon.svg', data: { url }, tag: payload.tag || undefined }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (same) { await same.navigate(target); return same.focus(); }
    return self.clients.openWindow(target);
  })());
});
