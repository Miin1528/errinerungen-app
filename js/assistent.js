"use strict";
/* KI-Assistent: versteht deutsche Sätze, legt Erinnerungen an, beantwortet
   Fragen und gibt Tipps aus deinem Lernprofil.
   Drei Stufen:
   1. Eingebaute Logik  – funktioniert immer, auch offline (GitHub Pages)
   2. Geräte-KI         – echtes Sprachmodell im Browser (Chrome Prompt API), falls verfügbar
   3. Server-KI         – Claude über den eigenen Push-Server (Einstellungen → Push-Server-URL) */
(function () {
  const KEY_CHAT = "chat.v1";
  App.chat = [];
  try { App.chat = JSON.parse(localStorage.getItem(KEY_CHAT)) || []; } catch (e) { /* leerer Verlauf */ }

  function chatSpeichern() {
    App.chat = App.chat.slice(-50);
    localStorage.setItem(KEY_CHAT, JSON.stringify(App.chat));
  }

  const REPEAT_NAME = { taeglich: "täglich", woechentlich: "wöchentlich", monatlich: "monatlich" };

  // ---------- Zeit-Verstehen (auch von der Spracheingabe genutzt) ----------
  const WOCHENTAGE = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6 };
  const ZAHLWORT = { einer: 1, einem: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, zehn: 10 };

  App.parseZeitText = function (gesagt) {
    const text = " " + gesagt.toLowerCase() + " ";
    let zeit = null;
    let repeat = null;

    if (/\bjeden tag\b|\btäglich\b/.test(text)) repeat = "taeglich";
    else if (/\bjede woche\b|\bwöchentlich\b/.test(text)) repeat = "woechentlich";
    else if (/\bjeden monat\b|\bmonatlich\b/.test(text)) repeat = "monatlich";

    const inMatch = text.match(/\bin (\d+|einer|einem|eine|zwei|drei|vier|fünf|zehn) (minuten?|min\b|stunden?|std\b|tagen?)/);
    const um = text.match(/\bum (\d{1,2})(?::(\d{2}))? ?(uhr)?\b/);
    const heute = /\bheute\b/.test(text);
    const morgen = /\bmorgen\b/.test(text.replace(/\bmorgens\b/g, ""));
    const uebermorgen = /\bübermorgen\b/.test(text);
    let wochentag = null;
    for (const [name, tag] of Object.entries(WOCHENTAGE)) {
      if (text.includes(" " + name)) { wochentag = tag; break; }
    }

    if (inMatch) {
      const n = ZAHLWORT[inMatch[1]] || parseInt(inMatch[1], 10);
      const einheit = inMatch[2];
      const faktor = einheit.startsWith("min") ? 60000 : einheit.startsWith("st") ? 3600000 : 86400000;
      zeit = new Date(Date.now() + n * faktor);
      zeit.setSeconds(0, 0);
    } else if (heute || morgen || uebermorgen || wochentag !== null || um || /\babends?\b|\bmittags?\b|\bmorgens\b|\bfrüh\b/.test(text)) {
      zeit = new Date();
      if (uebermorgen) zeit.setDate(zeit.getDate() + 2);
      else if (morgen) zeit.setDate(zeit.getDate() + 1);
      else if (wochentag !== null) {
        let diff = (wochentag - zeit.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        zeit.setDate(zeit.getDate() + diff);
      }
      if (um) zeit.setHours(parseInt(um[1], 10), um[2] ? parseInt(um[2], 10) : 0, 0, 0);
      else if (/\babends?\b/.test(text)) zeit.setHours(18, 0, 0, 0);
      else if (/\bmittags?\b/.test(text)) zeit.setHours(12, 0, 0, 0);
      else if (/\bmorgens\b|\bfrüh\b/.test(text)) zeit.setHours(8, 0, 0, 0);
      else zeit.setHours(9, 0, 0, 0);
      // Liegt die Zeit schon in der Vergangenheit? Dann nächster Tag (außer bei "heute")
      if (!heute && !morgen && !uebermorgen && wochentag === null && zeit.getTime() <= Date.now()) {
        zeit.setDate(zeit.getDate() + 1);
      }
    }

    const rest = gesagt
      .replace(/\bum \d{1,2}(:\d{2})? ?(uhr)?\b/gi, "")
      .replace(/\bin (\d+|einer|einem|eine|zwei|drei|vier|fünf|zehn) (minuten?|min\b|stunden?|std\b|tagen?)\b/gi, "")
      .replace(/\b(heute|übermorgen|morgens|abends?|mittags?|früh)\b/gi, "")
      .replace(/\bmorgen\b/gi, "")
      .replace(/\b(jeden tag|täglich|jede woche|wöchentlich|jeden monat|monatlich)\b/gi, "")
      .replace(new RegExp("\\b(" + Object.keys(WOCHENTAGE).join("|") + ")\\b", "gi"), "")
      .replace(/\bam\b/gi, "")
      .replace(/\s+/g, " ").trim();

    return { zeit: zeit, repeat: repeat, rest: rest || gesagt.trim() };
  };

  // ---------- Eingebaute Logik (Stufe 1) ----------
  function findeErinnerung(text) {
    const woerter = text.toLowerCase().split(/[^a-zäöüß]+/).filter(w => w.length >= 3);
    let beste = null, bestScore = 0;
    for (const r of App.reminders) {
      if (r.status !== "offen") continue;
      const rt = r.text.toLowerCase();
      let score = 0;
      for (const w of woerter) if (rt.includes(w)) score++;
      if (score > bestScore) { bestScore = score; beste = r; }
    }
    return beste;
  }

  function tagesListe(vonTs, bisTs, leer) {
    const treffer = App.reminders
      .filter(r => r.status === "offen" && r.dueAt >= vonTs && r.dueAt < bisTs)
      .sort((a, b) => a.dueAt - b.dueAt);
    if (!treffer.length) return leer;
    return treffer.map(r => "• " + App.fmt(r.dueAt) + " – " + r.text + " (" + App.katById(r.kat).icon + ")").join("\n");
  }

  const HILFE = "Das kann ich für dich tun:\n" +
    "• 📝 „Erinnere mich morgen um 9 an Zahnarzt anrufen“\n" +
    "• 🔁 „Erinnere mich jeden Tag um 8 an Medikamente“\n" +
    "• 📋 „Was steht heute an?“ / „Was kommt diese Woche?“\n" +
    "• ✅ „Medikamente erledigt“ – hakt die Erinnerung ab\n" +
    "• 💡 „Tipps für mich“ – was ich über dich gelernt habe";

  App.assistentRegeln = function (eingabe) {
    const t = eingabe.toLowerCase();

    // Erinnerung anlegen
    if (/(erinner|merk dir|merke dir|trag(e)? .*ein|leg(e)? .*an|denk daran|nicht vergessen)/.test(t)) {
      const p = App.parseZeitText(eingabe);
      const text = p.rest
        .replace(/^(erinnere?\s?(mich|uns)?( bitte)?( dara?n)?|merke? dir( bitte)?|denk daran|nicht vergessen|bitte)\s*/i, "")
        .replace(/^(an|dass ich|dass wir|zu)\s+/i, "")
        .replace(/[.!?,]+$/, "").trim();
      if (!text) return "Woran soll ich dich erinnern? Sag z. B.: „Erinnere mich morgen um 9 an Zahnarzt anrufen“";
      const zeit = p.zeit || App.suggestedDefaultTime();
      const kat = App.suggestKat(text);
      App.addReminder(text, zeit.getTime(), true, { kat: kat, repeat: p.repeat });
      const k = App.katById(kat);
      return "✅ Gespeichert: „" + text + "“ – " + App.fmt(zeit.getTime()) +
        (p.repeat ? " · 🔁 " + REPEAT_NAME[p.repeat] : "") + " · " + k.icon + " " + k.name;
    }

    // Erledigt melden
    if (/\b(erledigt|geschafft|abhaken|abgehakt|fertig)\b/.test(t) && !/\bwas\b|\bwelche\b/.test(t)) {
      const suchtext = eingabe.replace(/\b(erledigt|geschafft|abhaken|abgehakt|fertig|habe?|hab|ich|ist|als|bitte|das|die|der)\b/gi, " ");
      const r = findeErinnerung(suchtext);
      if (r) { App.markDone(r.id); return "✅ Super! „" + r.text + "“ ist abgehakt." + (r.repeat ? " Den nächsten Termin habe ich schon angelegt (🔁 " + REPEAT_NAME[r.repeat] + ")." : ""); }
      return "Hmm, dazu habe ich keine offene Erinnerung gefunden. 🔍 Sag mir den Namen genauer – z. B. „Zahnarzt erledigt“.";
    }

    const istFrage = /\bwas\b|\bwelche\b|\bsteht\b|\bhabe ich\b|\bhab ich\b|\bzeig\b|\bliste\b|\bgibt es\b/.test(t);
    const heute0 = new Date(); heute0.setHours(0, 0, 0, 0);
    const TAG = 86400000;

    if (istFrage && /\bheute\b|\bjetzt\b/.test(t)) {
      return "📋 Heute:\n" + tagesListe(heute0.getTime(), heute0.getTime() + TAG, "Heute steht nichts mehr an – genieß den Tag! 🌞");
    }
    if (istFrage && /\bmorgen\b/.test(t.replace(/\bmorgens\b/g, ""))) {
      return "📋 Morgen:\n" + tagesListe(heute0.getTime() + TAG, heute0.getTime() + 2 * TAG, "Morgen ist noch nichts geplant. 🎈");
    }
    if (istFrage && /\bwoche\b/.test(t)) {
      return "📋 Die nächsten 7 Tage:\n" + tagesListe(Date.now(), heute0.getTime() + 8 * TAG, "Diese Woche ist noch nichts geplant.");
    }
    if (istFrage && /\boffen\b|\balle\b|\bliste\b|\bübersicht\b/.test(t)) {
      const offen = App.reminders.filter(r => r.status === "offen").sort((a, b) => a.dueAt - b.dueAt);
      if (!offen.length) return "Du hast keine offenen Erinnerungen – alles erledigt! 🎉";
      return "📋 Deine " + offen.length + " offenen Erinnerungen:\n" +
        offen.slice(0, 8).map(r => "• " + App.fmt(r.dueAt) + " – " + r.text).join("\n") +
        (offen.length > 8 ? "\n… und " + (offen.length - 8) + " weitere in der Liste." : "");
    }

    if (/\btipp|\bvorschl|\bgelernt\b|\büber mich\b|\bstatistik\b|\banalys/.test(t)) {
      return App.insights().join("\n\n");
    }
    if (/\bhilfe\b|was kannst du|deine funktionen/.test(t)) return HILFE;
    if (/^(hallo|hi|hey|moin|servus|guten (morgen|tag|abend))\b/.test(t)) {
      const faellig = App.reminders.filter(r => r.status === "offen" && r.dueAt <= Date.now());
      const name = (App.profile.settings.name || "").trim();
      return "Hallo" + (name ? " " + name : "") + "! 👋 " +
        (faellig.length ? "Gerade fällig: „" + faellig[0].text + "“" + (faellig.length > 1 ? " und " + (faellig.length - 1) + " weitere." : ".") : "Aktuell ist nichts fällig.") +
        "\n\nWie kann ich helfen? (Tipp: „Hilfe“ zeigt, was ich kann.)";
    }
    if (/\bdanke|super|top|perfekt|klasse\b/.test(t)) return "Sehr gern! 😊 Ich bin da, wenn du mich brauchst.";

    return null; // keine Regel passt → KI-Stufen dürfen übernehmen
  };

  // ---------- Tipps aus dem Lernprofil ----------
  App.insights = function () {
    const tipps = [];
    const p = App.profile;
    const offen = App.reminders.filter(r => r.status === "offen");
    const ueberfaellig = offen.filter(r => r.dueAt <= Date.now());
    if (p.created) {
      const rate = Math.round((p.done / p.created) * 100);
      tipps.push("📊 Du hast " + p.created + " Erinnerungen angelegt und " + p.done + " erledigt (" + rate + " %)." +
        (rate >= 70 ? " Stark! 💪" : ""));
    }
    const topHour = App.topEntries(p.hourCounts, 1);
    if (topHour.length && topHour[0][1] >= 3) {
      tipps.push("⏰ Deine Lieblings-Uhrzeit ist " + String(topHour[0][0]).padStart(2, "0") + ":00 Uhr – die schlage ich dir automatisch vor.");
    }
    const kandidat = Object.values(p.textStats).find(s =>
      s.count >= 3 &&
      !App.reminders.some(r => r.status === "offen" && r.repeat && r.text.toLowerCase() === s.text.toLowerCase())
    );
    if (kandidat) {
      tipps.push("💡 „" + kandidat.text + "“ hast du schon " + kandidat.count + "× eingetragen. Sag einfach: „Erinnere mich jeden Tag um 9 an " + kandidat.text + "“ – dann übernehme ich das ab sofort automatisch. 🔁");
    }
    if (ueberfaellig.length) {
      tipps.push("⚠️ " + (ueberfaellig.length === 1 ? "Eine Erinnerung ist" : ueberfaellig.length + " Erinnerungen sind") + " überfällig – zum Beispiel „" + ueberfaellig[0].text + "“.");
    }
    if (!tipps.length) tipps.push("Ich lerne noch! 🌱 Je mehr du einträgst, desto bessere Tipps kann ich dir geben.");
    return tipps;
  };

  // ---------- Echte KI (Stufe 2 + 3) ----------
  function kontext() {
    const offen = App.reminders.filter(r => r.status === "offen").slice(0, 10)
      .map(r => "- " + r.text + " (fällig " + App.fmt(r.dueAt) + ")").join("\n");
    return "Offene Erinnerungen des Nutzers:\n" + (offen || "keine") + "\n\nGelerntes Profil:\n" + App.insights().join("\n");
  }

  const KI_SYSTEM = "Du bist der freundliche Assistent der Erinnerungs-App „Meine Erinnerungen“. " +
    "Antworte kurz, warm und auf Deutsch. Nutze den mitgelieferten Kontext über die Erinnerungen des Nutzers. " +
    "Wenn der Nutzer eine Erinnerung anlegen möchte, sag ihm, dass er es direkt so formulieren kann: „Erinnere mich morgen um 9 an …“.";

  App.frageKI = async function (text) {
    // Stufe 3: Server-KI (Claude über den eigenen Push-Server)
    const url = (App.profile.settings.pushServerUrl || "").trim().replace(/\/+$/, "");
    if (url) {
      try {
        const r = await fetch(url + "/assistent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frage: text, kontext: kontext() })
        });
        if (r.ok) {
          const j = await r.json();
          if (j.antwort) return { antwort: j.antwort, quelle: "☁️ Server-KI" };
        }
      } catch (e) { /* Server nicht erreichbar → nächste Stufe */ }
    }
    // Stufe 2: Geräte-KI (Chrome Prompt API, läuft komplett auf deinem Gerät)
    if (App.profile.settings.geraeteKI !== false && "LanguageModel" in self) {
      try {
        const verfuegbar = await LanguageModel.availability();
        if (verfuegbar === "available" || verfuegbar === "downloadable") {
          const session = await LanguageModel.create({
            initialPrompts: [{ role: "system", content: KI_SYSTEM + "\n\n" + kontext() }]
          });
          const antwort = await session.prompt(text);
          session.destroy && session.destroy();
          if (antwort && antwort.trim()) return { antwort: antwort.trim(), quelle: "📱 Geräte-KI" };
        }
      } catch (e) { /* Geräte-KI nicht verfügbar */ }
    }
    return null;
  };

  // ---------- Chat-Oberfläche ----------
  function nachricht(rolle, text, quelle) {
    App.chat.push({ rolle: rolle, text: text, quelle: quelle || null, ts: Date.now() });
    chatSpeichern();
    App.renderChat();
  }

  App.renderChat = function () {
    const box = document.getElementById("chatVerlauf");
    if (!box) return;
    box.innerHTML = "";
    for (const m of App.chat) {
      const el = App.el("div", "msg " + (m.rolle === "ich" ? "ich" : "assi"), m.text);
      if (m.quelle) el.appendChild(App.el("span", "quelle", m.quelle));
      box.appendChild(el);
    }
    if (App._denkt) {
      const d = App.el("div", "msg assi denken");
      for (let i = 0; i < 3; i++) d.appendChild(App.el("i"));
      box.appendChild(d);
    }
    box.scrollTop = box.scrollHeight;
  };

  function denken(an) {
    App._denkt = an;
    App.renderChat();
  }

  App.chatSenden = async function (vorgabe) {
    const input = document.getElementById("chatEingabe");
    const text = (vorgabe !== undefined ? vorgabe : input.value).trim();
    if (!text) return;
    if (vorgabe === undefined) input.value = "";
    nachricht("ich", text);
    denken(true);
    let antwort = App.assistentRegeln(text);
    let quelle = "🧠 Eingebaut";
    if (antwort === null) {
      const ki = await App.frageKI(text);
      if (ki) { antwort = ki.antwort; quelle = ki.quelle; }
      else {
        antwort = "Das habe ich noch nicht verstanden. 🙈 Probier zum Beispiel:\n" + HILFE +
          "\n\n💡 Für freie Fragen kann ich eine echte KI nutzen – am Handy mit Geräte-KI (Chrome) oder über einen eigenen KI-Server (Einstellungen).";
      }
    }
    denken(false);
    nachricht("assi", antwort, quelle);
    App.render();
  };

  // Begrüßung beim ersten Öffnen der Assistenten-Ansicht (einmal pro Sitzung)
  App.assistentStart = function () {
    App.renderChat();
    if (App._begruesst) return;
    App._begruesst = true;
    if (App.chat.length === 0) {
      const name = (App.profile.settings.name || "").trim();
      nachricht("assi", "Hallo" + (name ? " " + name : "") + "! 🤖 Ich bin dein Assistent und lerne aus deinen Erinnerungen.\n\n" + HILFE);
    }
  };
})();
