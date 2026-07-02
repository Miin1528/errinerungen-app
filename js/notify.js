"use strict";
/* Benachrichtigungen: System-Push (über Service Worker, funktioniert auf Android),
   Ton und Vibration. Fallback: Notification-Konstruktor am Desktop. */
(function () {
  let audioCtx = null;

  App.reRemindMs = function () {
    return Math.max(App.MIN_REREMIND, App.profile.settings.reRemindMinutes || App.MIN_REREMIND) * 60000;
  };

  App.requestNotifPermission = function () {
    if (App.profile.settings.notifications && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  App.notify = async function (r) {
    const again = r.notifyCount > 1;
    const title = again ? "⏰ Wieder-Erinnerung (" + r.notifyCount + "×)" : "⏰ Erinnerung";
    if (App.profile.settings.notifications && "Notification" in window && Notification.permission === "granted") {
      const opts = {
        body: r.text,
        tag: r.id,
        renotify: true,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        data: { id: r.id },
        vibrate: App.profile.settings.vibration ? [200, 100, 200] : undefined,
        actions: [
          { action: "done", title: "✓ Erledigt" },
          { action: "snooze", title: "⏳ +2 Std." }
        ]
      };
      try {
        // Auf Android MUSS die Benachrichtigung über den Service Worker laufen
        const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, opts);
        } else {
          // Desktop-Fallback: Konstruktor erlaubt keine Aktions-Buttons
          const { actions, ...simple } = opts;
          new Notification(title, simple);
        }
      } catch (e) { /* Benachrichtigung optional – App-Banner bleibt */ }
    }
    if (App.profile.settings.sound) App.beep();
    if (App.profile.settings.vibration && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  };

  App.testNotification = async function () {
    if (!("Notification" in window)) { App.toast("Dein Browser unterstützt keine Benachrichtigungen"); return; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { App.toast("Bitte Benachrichtigungen im Browser erlauben 🔔"); return; }
    await App.notify({ id: "test", text: "So sieht deine Erinnerung aus 👋", notifyCount: 1 });
    App.toast("Test-Benachrichtigung gesendet ✅");
  };

  App.beep = function () {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
      o.start(); o.stop(audioCtx.currentTime + 0.6);
    } catch (e) { /* Ton optional */ }
  };
})();
