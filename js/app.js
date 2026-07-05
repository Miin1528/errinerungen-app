"use strict";
/* Start & Verkabelung: Aktionen, Tick-Loop, Service Worker, Push-Server, Einstellungen */
(function () {

  // ---------- Aktionen ----------
  App.addReminder = function (text, dueAt, quiet, extra) {
    text = text.trim();
    extra = extra || {};
    if (!text) { App.toast("Bitte zuerst einen Text eingeben ✏️"); return false; }
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    App.reminders.push({
      id: id,
      text: text,
      dueAt: dueAt,
      createdAt: Date.now(),
      status: "offen",
      lastNotifiedAt: null,
      notifyCount: 0,
      kat: extra.kat || null,
      repeat: extra.repeat || null,
      // Wiederholungen behalten über alle Folge-Termine dieselbe Serien-Nummer,
      // damit der Kalender-Export keine doppelten Serien anlegt
      serieId: extra.repeat ? id : null
    });
    App.learnFrom(text, dueAt, extra.kat);
    App.save();
    App.render();
    App.syncPush();
    if (!quiet) App.toast("Gespeichert: „" + text + "“ – " + App.fmt(dueAt) + " ✅");
    App.requestNotifPermission();
    return true;
  };

  App.markDone = function (id) {
    const r = App.reminders.find(x => x.id === id);
    if (!r || r.status === "erledigt") return;
    const finish = () => {
      r.status = "erledigt";
      r.doneAt = Date.now();
      App.learnDone(r);
      let meldung = "Erledigt! 🎉";
      if (r.repeat) { // Wiederholung: nächsten Termin automatisch anlegen
        const next = new Date(r.dueAt);
        const jetzt = Date.now();
        do {
          if (r.repeat === "taeglich") next.setDate(next.getDate() + 1);
          else if (r.repeat === "woechentlich") next.setDate(next.getDate() + 7);
          else next.setMonth(next.getMonth() + 1);
        } while (next.getTime() <= jetzt);
        App.reminders.push({
          id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          text: r.text, dueAt: next.getTime(), createdAt: Date.now(),
          status: "offen", lastNotifiedAt: null, notifyCount: 0,
          kat: r.kat || null, repeat: r.repeat,
          serieId: r.serieId || r.id // Serien-Nummer weiterreichen
        });
        meldung = "Erledigt! 🎉 Nächster Termin: " + App.fmt(next.getTime());
      }
      App.save();
      App.render();
      App.syncPush();
      App.toast(meldung);
    };
    const li = document.querySelector('li.reminder[data-id="' + id + '"]');
    if (li && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      li.classList.add("leaving");
      setTimeout(finish, 260);
    } else finish();
  };

  App.snooze = function (id, minutes) {
    const r = App.reminders.find(x => x.id === id);
    if (!r) return;
    r.dueAt = Date.now() + minutes * 60000;
    r.lastNotifiedAt = null;
    App.save();
    App.render();
    App.syncPush();
    App.toast("Verschoben auf " + App.fmt(r.dueAt));
  };

  App.removeReminder = function (id) {
    const finish = () => {
      App.reminders = App.reminders.filter(x => x.id !== id);
      App.save();
      App.render();
      App.syncPush();
    };
    const li = document.querySelector('li.reminder[data-id="' + id + '"]');
    if (li && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      li.classList.add("leaving");
      setTimeout(finish, 260);
    } else finish();
  };

  /* Bestehende Erinnerung ändern (Text, Zeit, Kategorie, Wiederholung) */
  App.updateReminder = function (id, text, dueAt, extra) {
    const r = App.reminders.find(x => x.id === id);
    text = text.trim();
    if (!r) return false;
    if (!text) { App.toast("Bitte zuerst einen Text eingeben ✏️"); return false; }
    r.text = text;
    r.dueAt = dueAt;
    r.kat = extra.kat;
    r.repeat = extra.repeat;
    if (r.repeat && !r.serieId) r.serieId = r.id;
    if (dueAt > Date.now()) { // neu geplante Termine klingeln wieder frisch
      r.lastNotifiedAt = null;
      r.notifyCount = 0;
    }
    App.save();
    App.render();
    App.syncPush();
    App.toast("Geändert: „" + text + "“ – " + App.fmt(dueAt) + " ✅");
    return true;
  };

  App.addAndClear = function () {
    const textInput = document.getElementById("newText");
    const timeInput = document.getElementById("newTime");
    let due = timeInput.value ? new Date(timeInput.value).getTime() : App.suggestedDefaultTime().getTime();
    if (isNaN(due)) due = App.suggestedDefaultTime().getTime();
    const extra = {
      kat: App.sheetKat || "sonstiges",
      repeat: document.getElementById("newRepeat").value || null
    };
    const erfolgreich = App.editId
      ? App.updateReminder(App.editId, textInput.value, due, extra)
      : App.addReminder(textInput.value, due, false, extra);
    if (erfolgreich) {
      textInput.value = "";
      App.editId = null;
      App.closeSheet();
    }
  };

  // ---------- Tick: Fälligkeit prüfen (inkl. Wieder-Erinnerung nach mind. 2 Std.) ----------
  function tick() {
    const now = Date.now();
    let fired = false;
    for (const r of App.reminders) {
      if (r.status !== "offen" || r.dueAt > now) continue;
      const shouldFire = r.lastNotifiedAt === null || (now - r.lastNotifiedAt >= App.reRemindMs());
      if (shouldFire) {
        r.lastNotifiedAt = now;
        r.notifyCount = (r.notifyCount || 0) + 1;
        App.notify(r);
        fired = true;
      }
    }
    if (fired) App.save();
    App.render();
  }

  // ---------- Aktionen aus System-Benachrichtigungen (Erledigt / +2 Std.) ----------
  function handleNotifAction(action, id) {
    if (!id) return;
    if (action === "done") App.markDone(id);
    if (action === "snooze") App.snooze(id, 120);
  }

  // ---------- Push-Server (optional, für Push bei geschlossener App) ----------
  function geraeteId() {
    let id = localStorage.getItem("geraet.v1");
    if (!id) {
      id = "g-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("geraet.v1", id);
    }
    return id;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  /* Offene Erinnerungen an den Push-Server melden (falls konfiguriert) */
  App.syncPush = async function () {
    const url = (App.profile.settings.pushServerUrl || "").trim().replace(/\/+$/, "");
    if (!url) return;
    try {
      await fetch(url + "/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geraet: geraeteId(),
          reRemindMinutes: App.profile.settings.reRemindMinutes,
          erinnerungen: App.reminders
            .filter(r => r.status === "offen")
            .map(r => ({ id: r.id, text: r.text, dueAt: r.dueAt, lastNotifiedAt: r.lastNotifiedAt, notifyCount: r.notifyCount }))
        })
      });
    } catch (e) { /* Server gerade nicht erreichbar – lokale Erinnerungen laufen weiter */ }
  };

  async function verbindePushServer(url) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      App.toast("Dein Browser unterstützt kein Web-Push");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { App.toast("Bitte Benachrichtigungen erlauben 🔔"); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = await (await fetch(url + "/vapidPublicKey")).text();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.trim())
      });
      await fetch(url + "/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geraet: geraeteId(), subscription: sub })
      });
      await App.syncPush();
      App.toast("Push-Server verbunden ✅ – Erinnerungen kommen jetzt auch bei geschlossener App");
    } catch (e) {
      App.toast("Push-Server nicht erreichbar – URL prüfen");
    }
  }

  // ---------- Einstellungen ----------
  function initSettings() {
    const s = App.profile.settings;
    const name = document.getElementById("setName");
    const theme = document.getElementById("setTheme");
    const re = document.getElementById("reRemind");
    const nt = document.getElementById("notifToggle");
    const so = document.getElementById("soundToggle");
    const vi = document.getElementById("vibrToggle");
    const pu = document.getElementById("pushUrl");

    name.value = s.name || "";
    theme.value = s.theme || "system";
    re.value = Math.max(App.MIN_REREMIND, s.reRemindMinutes || App.MIN_REREMIND);
    nt.checked = s.notifications !== false;
    so.checked = s.sound !== false;
    vi.checked = s.vibration !== false;
    pu.value = s.pushServerUrl || "";

    name.onchange = () => { s.name = name.value.trim(); App.save(); App.render(); };
    theme.onchange = () => { s.theme = theme.value; App.save(); App.applyTheme(); };
    re.onchange = () => {
      const v = Math.max(App.MIN_REREMIND, parseInt(re.value, 10) || App.MIN_REREMIND);
      re.value = v;
      s.reRemindMinutes = v;
      App.save(); App.render(); App.syncPush();
      App.toast("Wieder-Erinnerung alle " + v + " Minuten");
    };
    nt.onchange = () => { s.notifications = nt.checked; App.save(); if (nt.checked) App.requestNotifPermission(); };
    const ki = document.getElementById("kiToggle");
    ki.checked = s.geraeteKI !== false;
    ki.onchange = () => { s.geraeteKI = ki.checked; App.save(); };
    so.onchange = () => { s.sound = so.checked; App.save(); };
    vi.onchange = () => { s.vibration = vi.checked; App.save(); };
    pu.onchange = () => {
      s.pushServerUrl = pu.value.trim().replace(/\/+$/, "");
      pu.value = s.pushServerUrl;
      App.save();
      if (s.pushServerUrl) verbindePushServer(s.pushServerUrl);
    };

    document.getElementById("testNotif").onclick = () => App.testNotification();

    document.getElementById("exportBtn").onclick = () => {
      const blob = new Blob([App.exportData()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "erinnerungen-backup.json";
      a.click();
      URL.revokeObjectURL(a.href);
      App.toast("Backup heruntergeladen ⬇️");
    };
    const importFile = document.getElementById("importFile");
    document.getElementById("importBtn").onclick = () => importFile.click();
    importFile.onchange = () => {
      const file = importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          App.importData(reader.result);
          App.applyTheme();
          initSettings();
          App.render();
          App.toast("Daten importiert ✅");
        } catch (e) { App.toast("Import fehlgeschlagen – ungültige Datei"); }
        importFile.value = "";
      };
      reader.readAsText(file);
    };

    document.getElementById("resetBtn").onclick = () => {
      if (confirm("Wirklich ALLE Erinnerungen und alles Gelernte löschen?")) {
        localStorage.removeItem(App.KEY_REMINDERS);
        localStorage.removeItem(App.KEY_PROFILE);
        location.reload();
      }
    };
  }

  // ---------- Installieren (PWA) ----------
  function initInstall() {
    const btn = document.getElementById("installBtn");
    const hint = document.getElementById("installHint");
    let installEvent = null;
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      installEvent = e;
      btn.hidden = false;
      hint.textContent = "";
    });
    btn.onclick = async () => {
      if (!installEvent) return;
      installEvent.prompt();
      const wahl = await installEvent.userChoice;
      if (wahl.outcome === "accepted") { App.toast("App wird installiert 📲"); btn.hidden = true; }
      installEvent = null;
    };
    if (window.matchMedia("(display-mode: standalone)").matches) {
      hint.textContent = "✅ Bereits als App installiert.";
    } else {
      hint.textContent = "Am Handy: Browser-Menü → „Zum Startbildschirm hinzufügen“ (oder hier auf Installieren tippen, sobald der Button erscheint).";
    }
  }

  // ---------- Service Worker ----------
  function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    navigator.serviceWorker.register("sw.js").catch(() => { /* z. B. Vorschau-Umgebung ohne sw.js */ });
    navigator.serviceWorker.addEventListener("message", e => {
      if (e.data && e.data.typ === "benachrichtigung") handleNotifAction(e.data.action, e.data.id);
    });
    // Neue App-Version übernimmt? Einmal neu laden, damit Updates sofort ankommen
    // (nur wenn vorher schon ein Service Worker aktiv war – nicht beim allerersten Besuch).
    // Während man gerade eine Erinnerung eintippt, wird der Neustart aufgeschoben,
    // damit kein ungespeicherter Entwurf verloren geht (Hinweis aus Code-Review).
    const hatteController = !!navigator.serviceWorker.controller;
    let neuGeladen = false;
    function updateAnwenden() {
      if (neuGeladen) return;
      const sheetOffen = document.getElementById("sheet").classList.contains("open");
      if (sheetOffen) { App.updateAusstehend = updateAnwenden; return; }
      neuGeladen = true;
      App.updateAusstehend = null;
      App.toast("App wurde aktualisiert ✨");
      setTimeout(() => location.reload(), 900);
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hatteController) updateAnwenden();
    });
  }

  // ---------- Start ----------
  App.load();
  App.applyTheme();
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if ((App.profile.settings.theme || "system") === "system") App.applyTheme();
    });
  }

  document.getElementById("fabBtn").onclick = () => App.openSheet();
  document.getElementById("backdrop").onclick = App.closeSheet;
  document.getElementById("addBtn").onclick = App.addAndClear;
  document.getElementById("newText").addEventListener("keydown", e => { if (e.key === "Enter") App.addAndClear(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") App.closeSheet(); });

  // Kategorie automatisch vorschlagen, während man tippt (bis man selbst wählt)
  document.getElementById("newText").addEventListener("input", e => {
    if (!App.sheetKatManuell && e.target.value.trim().length >= 3) {
      const vorschlag = App.suggestKat(e.target.value);
      if (vorschlag !== App.sheetKat) { App.sheetKat = vorschlag; App.renderKatChips(); }
    }
  });

  // ---------- Suche ----------
  document.getElementById("suchFeld").addEventListener("input", e => {
    App.suche = e.target.value.trim().toLowerCase();
    App.render();
  });

  // ---------- Kalender-Navigation ----------
  document.getElementById("kalZurueck").onclick = () => App.kalWechsel(-1);
  document.getElementById("kalVor").onclick = () => App.kalWechsel(1);
  document.getElementById("icsExport").onclick = () => App.icsExport();
  for (const btn of document.querySelectorAll("#kalModusTabs button")) {
    btn.onclick = () => {
      App.kalModus = btn.dataset.modus;
      document.querySelectorAll("#kalModusTabs button").forEach(b => b.classList.toggle("active", b === btn));
      App.renderKalender();
    };
  }

  // ---------- Spracheingabe (Web Speech API) ----------
  (function initSprache() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // Browser ohne Spracherkennung: Knöpfe bleiben versteckt

    function bindDiktat(micBtn, fertig) {
      micBtn.hidden = false;
      let rec = null;
      micBtn.onclick = () => {
        if (rec) { rec.stop(); return; }
        rec = new SR();
        rec.lang = "de-DE";
        rec.interimResults = false;
        micBtn.classList.add("aufnahme");
        micBtn.textContent = "⏹";
        rec.onresult = e => fertig(e.results[0][0].transcript);
        rec.onerror = e => {
          if (e.error === "not-allowed") App.toast("Bitte Mikrofon-Zugriff erlauben 🎤");
          else if (e.error !== "aborted") App.toast("Nichts verstanden – versuch es nochmal 🎤");
        };
        rec.onend = () => {
          micBtn.classList.remove("aufnahme");
          micBtn.textContent = "🎤";
          rec = null;
        };
        rec.start();
      };
    }

    // Mikrofon im Eingabe-Sheet: Zeit verstehen und Felder füllen
    bindDiktat(document.getElementById("micBtn"), gesagt => {
      const erg = App.parseZeitText(gesagt);
      const input = document.getElementById("newText");
      input.value = erg.rest;
      input.dispatchEvent(new Event("input")); // Kategorie-Vorschlag anstoßen
      if (erg.repeat) document.getElementById("newRepeat").value = erg.repeat;
      if (erg.zeit) {
        document.getElementById("newTime").value = App.toInputValue(erg.zeit);
        App.toast("Verstanden: „" + erg.rest + "“ – " + App.fmt(erg.zeit.getTime()));
      } else {
        App.toast("Verstanden: „" + erg.rest + "“");
      }
    });

    // Mikrofon im Assistenten-Chat: diktieren und direkt senden
    bindDiktat(document.getElementById("chatMic"), gesagt => App.chatSenden(gesagt));
  })();

  // ---------- KI-Assistent: Chat-Verkabelung ----------
  document.getElementById("chatSendenBtn").onclick = () => App.chatSenden();
  document.getElementById("chatEingabe").addEventListener("keydown", e => {
    if (e.key === "Enter") App.chatSenden();
  });
  (function initChatVorschlaege() {
    const box = document.getElementById("chatVorschlaege");
    const vorschlaege = [
      ["📋 Was steht heute an?", "Was steht heute an?"],
      ["💡 Tipps für mich", "Tipps für mich"],
      ["🗓 Diese Woche?", "Was steht diese Woche an?"],
      ["❓ Was kannst du?", "Hilfe"]
    ];
    for (const [label, text] of vorschlaege) {
      const chip = App.el("button", "chip", label);
      chip.onclick = () => App.chatSenden(text);
      box.appendChild(chip);
    }
  })();

  for (const btn of document.querySelectorAll(".navbtn")) {
    btn.onclick = () => App.switchView(btn.dataset.view);
  }
  for (const btn of document.querySelectorAll("#tabs button")) {
    btn.onclick = () => {
      App.filter = btn.dataset.filter;
      document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b === btn));
      App.render();
    };
  }

  initSettings();
  initInstall();
  initServiceWorker();

  // Aktion aus einer angetippten System-Benachrichtigung (App war geschlossen)
  const params = new URLSearchParams(location.search);
  if (params.get("na")) {
    handleNotifAction(params.get("na"), params.get("id"));
    history.replaceState(null, "", location.pathname);
  }

  // Live-Uhr im Kopf
  const clock = document.getElementById("clock");
  function updateClock() {
    clock.textContent = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  updateClock();
  setInterval(updateClock, 1000);

  App.render();
  tick();
  setInterval(tick, 15000); // alle 15 Sekunden prüfen
})();
