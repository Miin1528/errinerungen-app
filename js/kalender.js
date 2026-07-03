"use strict";
/* Kalender-Ansicht: Monatsraster mit farbigen Kategorie-Punkten,
   Tages-Detail und "In Google Kalender"-Knopf */
(function () {
  const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const heute0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  App.kalMonat = (() => { const d = heute0(); d.setDate(1); return d; })();
  App.kalTag = heute0().getTime();
  App.kalModus = "privat"; // "privat" = alles außer Arbeit, "arbeit" = nur Arbeitstermine

  /* Arbeitstermine erscheinen NUR im Arbeits-Kalender */
  function imModus(r) {
    const istArbeit = (r.kat || "sonstiges") === "arbeit";
    return App.kalModus === "arbeit" ? istArbeit : !istArbeit;
  }

  App.gcalUrl = function (r) {
    const p = n => String(n).padStart(2, "0");
    const f = ts => {
      const d = new Date(ts);
      return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "T" + p(d.getHours()) + p(d.getMinutes()) + "00";
    };
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(r.text) +
      "&dates=" + f(r.dueAt) + "/" + f(r.dueAt + 30 * 60000) +
      "&details=" + encodeURIComponent("Aus der App „Meine Erinnerungen“");
  };

  function tagKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
  }

  App.renderKalender = function () {
    const grid = document.getElementById("kalGrid");
    if (!grid) return;
    const monat = App.kalMonat;
    document.getElementById("kalTitel").textContent =
      monat.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

    // Erinnerungen nach Tag gruppieren (je nach gewähltem Kalender)
    const proTag = {};
    for (const r of App.reminders) {
      if (!imModus(r)) continue;
      (proTag[tagKey(r.dueAt)] = proTag[tagKey(r.dueAt)] || []).push(r);
    }

    grid.innerHTML = "";
    for (const wt of WOCHENTAGE) grid.appendChild(App.el("div", "kalwt", wt));

    const start = new Date(monat);
    start.setDate(1 - ((monat.getDay() + 6) % 7)); // Montag der ersten Woche
    const heute = heute0().getTime();
    for (let i = 0; i < 42; i++) {
      const tag = new Date(start);
      tag.setDate(start.getDate() + i);
      if (i === 35 && tag.getMonth() !== monat.getMonth()) break; // 6. Woche nur bei Bedarf
      const ts = tag.getTime();
      const zelle = App.el("button", "kaltag");
      if (tag.getMonth() !== monat.getMonth()) zelle.classList.add("anders");
      if (ts === heute) zelle.classList.add("heute");
      if (ts === App.kalTag) zelle.classList.add("aktiv");
      zelle.appendChild(App.el("span", "", String(tag.getDate())));
      const eintraege = proTag[tagKey(ts)] || [];
      const dots = App.el("div", "dots");
      for (const r of eintraege.slice(0, 3)) {
        const dot = App.el("i");
        dot.style.background = r.status === "erledigt" ? "var(--muted)" : App.katById(r.kat).farbe;
        dots.appendChild(dot);
      }
      zelle.appendChild(dots);
      zelle.onclick = () => { App.kalTag = ts; App.renderKalender(); };
      grid.appendChild(zelle);
    }

    // Tages-Detail
    const titel = document.getElementById("kalTagTitel");
    const liste = document.getElementById("kalTagListe");
    const tagesEintraege = (proTag[tagKey(App.kalTag)] || []).sort((a, b) => a.dueAt - b.dueAt);
    titel.textContent = (App.kalModus === "arbeit" ? "💼 " : "") +
      new Date(App.kalTag).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" }) +
      (tagesEintraege.length ? "" : (App.kalModus === "arbeit" ? " – keine Arbeitstermine" : " – keine Erinnerungen"));
    liste.innerHTML = "";
    for (const r of tagesEintraege) {
      const li = App.el("li", "reminder" + (r.status === "erledigt" ? " done" : ""));
      li.style.borderLeft = "4px solid " + App.katById(r.kat).farbe;
      const top = App.el("div", "top");
      top.appendChild(App.el("div", "text", r.text));
      top.appendChild(App.el("div", "when", new Date(r.dueAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })));
      li.appendChild(top);
      const actions = App.el("div", "actions");
      if (r.status === "offen") {
        const done = App.el("button", "small ok", "Erledigt ✓");
        done.onclick = () => App.markDone(r.id);
        actions.appendChild(done);
        const edit = App.el("button", "small", "✏️");
        edit.title = "Bearbeiten";
        edit.setAttribute("aria-label", "Bearbeiten");
        edit.onclick = () => App.openSheet(r.id);
        actions.appendChild(edit);
      }
      const gcal = App.el("button", "small", "📅 Google Kalender");
      gcal.onclick = () => window.open(App.gcalUrl(r), "_blank");
      actions.appendChild(gcal);
      li.appendChild(actions);
      liste.appendChild(li);
    }
  };

  App.kalWechsel = function (richtung) {
    const d = new Date(App.kalMonat);
    d.setMonth(d.getMonth() + richtung);
    App.kalMonat = d;
    App.renderKalender();
  };

  // ---------- Export in den Handy-Kalender (.ics-Datei) ----------
  function icsEscape(s) {
    return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  /* iCalendar erlaubt max. 75 Bytes pro Zeile – längere werden mit
     "CRLF + Leerzeichen" umgebrochen (RFC 5545, "line folding") */
  const enc = new TextEncoder();
  function icsFold(zeile) {
    if (enc.encode(zeile).length <= 75) return zeile;
    const teile = [];
    let aktuell = "";
    for (const zeichen of zeile) {
      const limit = teile.length ? 74 : 75; // Folgezeilen beginnen mit Leerzeichen
      if (enc.encode(aktuell + zeichen).length > limit) {
        teile.push(aktuell);
        aktuell = zeichen;
      } else {
        aktuell += zeichen;
      }
    }
    teile.push(aktuell);
    return teile.map((t, i) => (i ? " " + t : t)).join("\r\n");
  }

  /* Erstellt eine iCalendar-Datei mit allen offenen Terminen des aktiven Kalenders */
  App.icsInhalt = function () {
    const p = n => String(n).padStart(2, "0");
    const f = ts => {
      const d = new Date(ts);
      return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "T" + p(d.getHours()) + p(d.getMinutes()) + "00";
    };
    const jetzt = new Date();
    const stamp = jetzt.getUTCFullYear() + p(jetzt.getUTCMonth() + 1) + p(jetzt.getUTCDate()) +
      "T" + p(jetzt.getUTCHours()) + p(jetzt.getUTCMinutes()) + p(jetzt.getUTCSeconds()) + "Z";
    const rrule = { taeglich: "FREQ=DAILY", woechentlich: "FREQ=WEEKLY", monatlich: "FREQ=MONTHLY" };
    const name = App.kalModus === "arbeit" ? "Arbeits-Kalender" : "Meine Erinnerungen";
    const zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Meine Erinnerungen//DE", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + name];
    let anzahl = 0;
    for (const r of App.reminders) {
      if (r.status !== "offen" || !imModus(r)) continue;
      anzahl++;
      zeilen.push(
        "BEGIN:VEVENT",
        // Wiederholungen exportieren mit stabiler Serien-Nummer, damit ein
        // erneuter Import keine doppelte Serie anlegt
        "UID:" + (r.serieId || r.id) + "@meine-erinnerungen",
        "DTSTAMP:" + stamp,
        "DTSTART:" + f(r.dueAt),
        "DTEND:" + f(r.dueAt + 30 * 60000),
        "SUMMARY:" + icsEscape(r.text)
      );
      if (r.repeat && rrule[r.repeat]) zeilen.push("RRULE:" + rrule[r.repeat]);
      zeilen.push("END:VEVENT");
    }
    zeilen.push("END:VCALENDAR");
    return { inhalt: zeilen.map(icsFold).join("\r\n"), anzahl: anzahl };
  };

  App.icsExport = function () {
    const { inhalt, anzahl } = App.icsInhalt();
    if (!anzahl) {
      App.toast(App.kalModus === "arbeit" ? "Keine offenen Arbeitstermine zum Übertragen" : "Keine offenen Termine zum Übertragen");
      return;
    }
    const blob = new Blob([inhalt], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (App.kalModus === "arbeit" ? "arbeits-kalender" : "meine-erinnerungen") + ".ics";
    a.click();
    URL.revokeObjectURL(a.href);
    App.toast(anzahl + (anzahl === 1 ? " Termin" : " Termine") + " exportiert 📤 – Datei antippen, um sie in den Handy-Kalender zu übernehmen");
  };
})();
