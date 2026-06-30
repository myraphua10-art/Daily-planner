self.addEventListener('push', (event) => {
  let data = { title: "Myra's Planner", body: '' };
  try { data = event.data.json(); } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Myra's Planner", {
      body: data.body || '',
      icon: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' rx=\'22\' fill=\'%236366f1\'/%3E%3Ctext x=\'50\' y=\'66\' font-size=\'52\' text-anchor=\'middle\' fill=\'white\' font-family=\'-apple-system\'%3E%F0%9F%93%9A%3C/text%3E%3C/svg%3E',
    })
  );
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
