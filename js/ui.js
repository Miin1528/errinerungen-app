"use strict";
/* Anzeige: Rendering, Ansichts-Wechsel, Bottom-Sheet, Theme, Toast */
(function () {

  // ---------- kleine Helfer ----------
  App.el = function (tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  App.toast = function (msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2600);
  };

  // ---------- Zeit ----------
  App.toInputValue = function (d) {
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  };
  App.fmt = function (ts) {
    const d = new Date(ts);
    const today = new Date(); const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    if (sameDay(d, today)) return "heute " + time;
    if (sameDay(d, tomorrow)) return "morgen " + time;
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " " + time;
  };
  App.nextOccurrence = function (hour) {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  };

  // ---------- Theme ----------
  App.applyTheme = function () {
    const wahl = App.profile.settings.theme || "system";
    let theme = wahl;
    if (wahl === "system") {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "hell" : "dunkel";
    }
    document.documentElement.dataset.theme = theme;
    const meta = document.getElementById("themeColorMeta");
    if (meta) meta.content = theme === "hell" ? "#f6f1e7" : "#14161f";
  };

  // ---------- Ansichten ----------
  App.switchView = function (name) {
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.dataset.view === name));
    document.querySelectorAll(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    document.getElementById("fabBtn").classList.toggle("hidden", name !== "liste" && name !== "kalender");
    window.scrollTo({ top: 0 });
  };

  // ---------- Bottom-Sheet ----------
  App.editId = null;
  App.openSheet = function (editId) {
    App.editId = editId || null;
    const r = App.editId ? App.reminders.find(x => x.id === App.editId) : null;
    document.getElementById("sheetTitel").textContent = r ? "✏️ Erinnerung bearbeiten" : "✏️ Neue Erinnerung";
    document.getElementById("addBtn").textContent = r ? "Änderungen speichern ✅" : "Speichern 💾";
    document.getElementById("newText").value = r ? r.text : "";
    document.getElementById("newTime").value = App.toInputValue(r ? new Date(r.dueAt) : App.suggestedDefaultTime());
    document.getElementById("newRepeat").value = r ? (r.repeat || "") : "";
    // Im Arbeits-Kalender bekommen neue Termine automatisch die Kategorie Arbeit
    const aktiveAnsicht = document.querySelector(".view.active");
    const imArbeitsKalender = !r && aktiveAnsicht && aktiveAnsicht.dataset.view === "kalender" && App.kalModus === "arbeit";
    App.sheetKat = r ? (r.kat || "sonstiges") : (imArbeitsKalender ? "arbeit" : "sonstiges");
    App.sheetKatManuell = !!r || imArbeitsKalender;
    App.renderKatChips();
    document.getElementById("backdrop").classList.add("show");
    document.getElementById("sheet").classList.add("open");
    setTimeout(() => document.getElementById("newText").focus(), 300);
  };
  App.closeSheet = function () {
    document.getElementById("backdrop").classList.remove("show");
    document.getElementById("sheet").classList.remove("open");
    if (App.updateAusstehend) { // aufgeschobenes App-Update jetzt anwenden
      const anwenden = App.updateAusstehend;
      App.updateAusstehend = null;
      setTimeout(anwenden, 400); // erst das Sheet zu Ende animieren lassen
    }
  };

  // ---------- Rendering ----------
  App.render = function () {
    renderGreeting();
    renderBanner();
    renderList();
    renderTemplates();
    renderQuickTimes();
    renderStats();
    renderSuggestions();
    renderKatFilter();
    App.renderKatChips();
    if (App.renderKalender) App.renderKalender();
  };

  // ---------- Kategorie-Filter über der Liste ----------
  function renderKatFilter() {
    const box = document.getElementById("katFilter");
    box.innerHTML = "";
    const alle = App.el("button", "chip kat" + (App.katFilter === null ? " active" : ""), "Alle");
    alle.onclick = () => { App.katFilter = null; App.render(); };
    box.appendChild(alle);
    for (const k of App.KATEGORIEN) {
      const chip = App.el("button", "chip kat" + (App.katFilter === k.id ? " active" : ""));
      const dot = App.el("span", "dot");
      dot.style.background = k.farbe;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(k.icon + " " + k.name));
      chip.onclick = () => { App.katFilter = App.katFilter === k.id ? null : k.id; App.render(); };
      box.appendChild(chip);
    }
  }

  // ---------- Kategorie-Auswahl im Sheet ----------
  App.sheetKat = "sonstiges";
  App.sheetKatManuell = false;
  App.renderKatChips = function () {
    const box = document.getElementById("katChips");
    if (!box) return;
    box.innerHTML = "";
    for (const k of App.KATEGORIEN) {
      const chip = App.el("button", "chip kat" + (App.sheetKat === k.id ? " active" : ""));
      const dot = App.el("span", "dot");
      dot.style.background = k.farbe;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(k.icon + " " + k.name));
      chip.onclick = () => { App.sheetKat = k.id; App.sheetKatManuell = true; App.renderKatChips(); };
      box.appendChild(chip);
    }
  };

  function renderGreeting() {
    const h = new Date().getHours();
    const part = h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
    const name = (App.profile.settings.name || "").trim();
    const open = App.reminders.filter(r => r.status === "offen").length;
    const extra = open === 0 ? "Alles erledigt – stark! ✨" : open + (open === 1 ? " offene Erinnerung." : " offene Erinnerungen.");
    document.getElementById("greeting").textContent = part + (name ? ", " + name : "") + "! " + extra;
  }

  function renderBanner() {
    const now = Date.now();
    const due = App.reminders.filter(r => r.status === "offen" && r.dueAt <= now);
    const banner = document.getElementById("dueBanner");
    const list = document.getElementById("dueList");
    list.innerHTML = "";
    if (!due.length) { banner.classList.remove("show"); return; }
    banner.classList.add("show");
    for (const r of due) {
      const row = App.el("div", "due-item");
      row.appendChild(App.el("strong", "", r.text));
      const btns = App.el("div", "");
      const done = App.el("button", "small ok", "Erledigt ✓");
      done.onclick = () => App.markDone(r.id);
      const later = App.el("button", "small warn", "+2 Std. ⏳");
      later.style.marginLeft = "6px";
      later.onclick = () => App.snooze(r.id, 120);
      btns.appendChild(done); btns.appendChild(later);
      row.appendChild(btns);
      list.appendChild(row);
    }
  }

  function renderList() {
    const ul = document.getElementById("reminderList");
    ul.innerHTML = "";
    const now = Date.now();
    let items = App.reminders.slice().sort((a, b) => a.dueAt - b.dueAt);
    if (App.filter === "offen") items = items.filter(r => r.status === "offen");
    if (App.filter === "erledigt") items = items.filter(r => r.status === "erledigt").sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    if (App.suche) items = items.filter(r => r.text.toLowerCase().includes(App.suche));
    if (App.katFilter) items = items.filter(r => (r.kat || "sonstiges") === App.katFilter);
    if (!items.length) {
      ul.appendChild(App.el("div", "empty", App.suche || App.katFilter ? "Nichts gefunden. 🔍" : (App.filter === "erledigt" ? "Noch nichts erledigt." : "Keine Erinnerungen – tippe auf ➕ und schreib dir etwas auf! 📝")));
      return;
    }
    items.forEach((r, i) => {
      const li = App.el("li", "reminder" + (r.status === "erledigt" ? " done" : (r.dueAt <= now ? " due" : "")));
      li.dataset.id = r.id;
      li.style.animationDelay = Math.min(i * 40, 320) + "ms";
      li.style.borderLeft = "4px solid " + App.katById(r.kat).farbe;
      const top = App.el("div", "top");
      top.appendChild(App.el("div", "text", r.text));
      top.appendChild(App.el("div", "when", App.fmt(r.dueAt)));
      li.appendChild(top);
      const kat = App.katById(r.kat);
      const infoTeile = [kat.icon + " " + kat.name];
      if (r.repeat) infoTeile.push("🔁 " + ({ taeglich: "täglich", woechentlich: "wöchentlich", monatlich: "monatlich" })[r.repeat]);
      li.appendChild(App.el("div", "katinfo", infoTeile.join(" · ")));
      if (r.status === "offen" && r.lastNotifiedAt) {
        const nextAt = r.lastNotifiedAt + App.reRemindMs();
        li.appendChild(App.el("div", "meta", "🔁 " + r.notifyCount + "× erinnert – nächste Wieder-Erinnerung " + App.fmt(nextAt)));
      }
      if (r.status === "erledigt" && r.doneAt) {
        li.appendChild(App.el("div", "meta done-meta", "✓ erledigt " + App.fmt(r.doneAt)));
      }
      const actions = App.el("div", "actions");
      if (r.status === "offen") {
        const done = App.el("button", "small ok", "Erledigt ✓");
        done.onclick = () => App.markDone(r.id);
        actions.appendChild(done);
        const later = App.el("button", "small warn", "+2 Std. ⏳");
        later.onclick = () => App.snooze(r.id, 120);
        actions.appendChild(later);
        const edit = App.el("button", "small", "Bearbeiten ✏️");
        edit.onclick = () => App.openSheet(r.id);
        actions.appendChild(edit);
        const gcal = App.el("button", "small", "📅");
        gcal.title = "In Google Kalender eintragen";
        gcal.setAttribute("aria-label", "In Google Kalender eintragen");
        gcal.onclick = () => window.open(App.gcalUrl(r), "_blank");
        actions.appendChild(gcal);
      }
      const del = App.el("button", "small danger", "Löschen 🗑");
      del.onclick = () => App.removeReminder(r.id);
      actions.appendChild(del);
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  function renderTemplates() {
    const card = document.getElementById("templatesCard");
    const box = document.getElementById("templateChips");
    const templates = App.learnedTemplates();
    box.innerHTML = "";
    card.hidden = !templates.length;
    for (const t of templates) {
      const hour = App.bestHour(t.hours);
      const chip = App.el("button", "chip");
      chip.appendChild(document.createTextNode(t.text));
      chip.appendChild(App.el("span", "time", String(hour).padStart(2, "0") + ":00"));
      chip.title = t.count + "× von dir eingetragen";
      chip.onclick = () => {
        const when = App.nextOccurrence(hour);
        App.addReminder(t.text, when.getTime(), true, { kat: t.kat || App.suggestKat(t.text) });
        App.toast("⚡ 1-Klick-Termin: „" + t.text + "“ – " + App.fmt(when.getTime()));
      };
      box.appendChild(chip);
    }
  }

  function renderQuickTimes() {
    const box = document.getElementById("quickTimes");
    box.innerHTML = "";
    const options = [
      ["⚡ In 2 Std.", () => new Date(Date.now() + 120 * 60000)],
      ["🌆 Heute 18:00", () => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; }],
      ["🌅 Morgen 09:00", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }]
    ];
    for (const [label, getDate] of options) {
      const b = App.el("button", "chip", label);
      b.onclick = () => {
        const d = getDate();
        if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
        document.getElementById("newTime").value = App.toInputValue(d);
        if (document.getElementById("newText").value.trim()) App.addAndClear();
        else App.toast("Zeit gesetzt: " + App.fmt(d.getTime()) + " – jetzt noch den Text eingeben ✏️");
      };
      box.appendChild(b);
    }
  }

  function renderStats() {
    const grid = document.getElementById("statsGrid");
    grid.innerHTML = "";
    const topHour = App.topEntries(App.profile.hourCounts, 1);
    const topWords = App.topEntries(App.profile.wordCounts, 3).map(e => e[0]);
    const rate = App.profile.created ? Math.round((App.profile.done / App.profile.created) * 100) : 0;
    const avgMin = App.profile.done ? Math.round(App.profile.doneMinutesTotal / App.profile.done) : null;
    const stats = [
      ["Eingetragene Erinnerungen", String(App.profile.created)],
      ["Davon erledigt", App.profile.done + " (" + rate + " %)"],
      ["Deine Lieblings-Uhrzeit", topHour.length ? String(topHour[0][0]).padStart(2, "0") + ":00 Uhr" : "lerne ich noch …"],
      ["Deine häufigsten Themen", topWords.length ? topWords.join(", ") : "lerne ich noch …"],
      ["Tempo nach Fälligkeit", avgMin === null ? "lerne ich noch …" : "Ø " + avgMin + " Min. bis erledigt"],
      ["Dabei seit", new Date(App.profile.firstUse).toLocaleDateString("de-DE")]
    ];
    stats.forEach(([label, value], i) => {
      const s = App.el("div", "stat");
      s.style.animationDelay = (i * 50) + "ms";
      s.appendChild(App.el("div", "label", label));
      s.appendChild(App.el("div", "value", value));
      grid.appendChild(s);
    });
    const hint = document.getElementById("learnHint");
    if (App.profile.created < 2) {
      hint.textContent = "Je mehr du einträgst, desto besser lerne ich deine Gewohnheiten – ab dem 2. gleichen Eintrag bekommst du Blitz-Termine mit 1 Klick.";
    } else if (avgMin !== null && avgMin > Math.max(120, App.profile.settings.reRemindMinutes)) {
      hint.textContent = "Ich habe gelernt: Du brauchst oft etwas länger – deshalb erinnere ich dich zuverlässig alle " + Math.round(App.reRemindMs() / 60000) + " Minuten erneut, bis du „Erledigt“ tippst.";
    } else {
      hint.textContent = "Ich nutze deine Gewohnheiten für Vorschläge: Uhrzeit-Vorauswahl, Text-Vervollständigung und Blitz-Termine.";
    }
  }

  function renderSuggestions() {
    const dl = document.getElementById("suggestions");
    dl.innerHTML = "";
    const bekannte = Object.values(App.profile.textStats).sort((a, b) => b.count - a.count).slice(0, 10);
    for (const stat of bekannte) {
      const opt = document.createElement("option");
      opt.value = stat.text;
      dl.appendChild(opt);
    }
  }
})();
