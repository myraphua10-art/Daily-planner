const ICON = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' rx=\'22\' fill=\'%23818cf8\'/%3E%3Ctext x=\'50\' y=\'66\' font-size=\'52\' text-anchor=\'middle\' fill=\'%230b0d12\' font-family=\'-apple-system\'%3EP%3C/text%3E%3C/svg%3E';

// Planner reminders arrive as an empty push — no payload to decrypt — so the
// text is fetched here instead. Pushes that DO carry a payload (the older
// notification worker) still work through the second branch below.
async function showFromServer() {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return;
    const res = await fetch('/api/pending-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!res.ok) throw new Error('lookup failed');
    const data = await res.json();
    const list = (data.notifications || []).slice(0, 5);
    if (!list.length) return;
    await Promise.all(
      list.map((n, i) =>
        self.registration.showNotification(n.title || "Myra's Planner", {
          body: n.body || '',
          icon: ICON,
          tag: 'planner-' + i,
        })
      )
    );
  } catch (err) {
    // Every push must end in a notification or the browser shows its own
    // "this site was updated in the background" message instead.
    await self.registration.showNotification("Myra's Planner", {
      body: 'You have something coming up — open the planner to see it.',
      icon: ICON,
    });
  }
}

self.addEventListener('push', (event) => {
  let data = null;
  if (event.data) {
    try { data = event.data.json(); }
    catch (e) { data = { body: event.data.text() }; }
  }

  if (data && (data.title || data.body)) {
    event.waitUntil(
      self.registration.showNotification(data.title || "Myra's Planner", {
        body: data.body || '',
        icon: ICON,
      })
    );
    return;
  }

  event.waitUntil(showFromServer());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
