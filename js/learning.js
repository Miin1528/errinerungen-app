"use strict";
/* Lernfunktion: merkt sich Gewohnheiten und macht daraus Vorschläge */
(function () {
  const STOPWORDS = new Set(["und","der","die","das","den","dem","ein","eine","einen","mit","für","fuer","auf","bei","von","zum","zur","ich","mir","mich","nicht","noch","mal","bitte","heute","morgen","abend","uhr","dann","auch","aber","wieder","gehen","machen"]);

  App.learnFrom = function (text, dueAt, kat) {
    const key = text.trim().toLowerCase();
    const hour = new Date(dueAt).getHours();
    const stat = App.profile.textStats[key] || { text: text.trim(), count: 0, hours: {} };
    stat.text = text.trim();
    stat.count++;
    stat.hours[hour] = (stat.hours[hour] || 0) + 1;
    if (kat) stat.kat = kat;
    App.profile.textStats[key] = stat;
    App.profile.hourCounts[hour] = (App.profile.hourCounts[hour] || 0) + 1;
    for (const w of key.split(/[^a-zäöüß]+/i)) {
      if (w.length >= 3 && !STOPWORDS.has(w)) {
        App.profile.wordCounts[w] = (App.profile.wordCounts[w] || 0) + 1;
        if (kat) { // merken, welche Wörter zu welcher Kategorie gehören
          const ks = App.profile.katStats[w] = App.profile.katStats[w] || {};
          ks[kat] = (ks[kat] || 0) + 1;
        }
      }
    }
    App.profile.created++;
  };

  /* Kategorie-Vorschlag: erst aus deinem Lernprofil, sonst über Stichwörter */
  const KAT_KEYWORDS = {
    gesundheit: ["arzt", "zahnarzt", "medikament", "medikamente", "tablette", "tabletten", "apotheke", "impfung", "physio", "sport", "training"],
    arbeit: ["arbeit", "meeting", "chef", "büro", "buero", "mail", "bewerbung", "rechnung", "steuer", "termin"],
    einkauf: ["einkaufen", "kaufen", "supermarkt", "brot", "milch", "besorgen", "bestellen", "paket", "abholen"],
    privat: ["anrufen", "mama", "papa", "oma", "opa", "geburtstag", "freunde", "familie", "putzen", "waschen", "müll", "muell"]
  };
  App.suggestKat = function (text) {
    const scores = {};
    for (const w of text.toLowerCase().split(/[^a-zäöüß]+/i)) {
      if (w.length < 3) continue;
      const gelernt = App.profile.katStats[w];
      if (gelernt) {
        for (const [kat, n] of Object.entries(gelernt)) scores[kat] = (scores[kat] || 0) + n * 2;
      }
      for (const [kat, woerter] of Object.entries(KAT_KEYWORDS)) {
        if (woerter.includes(w)) scores[kat] = (scores[kat] || 0) + 1;
      }
    }
    const top = App.topEntries(scores, 1);
    return top.length ? top[0][0] : "sonstiges";
  };

  App.learnDone = function (reminder) {
    App.profile.done++;
    const minutes = Math.max(0, (Date.now() - reminder.dueAt) / 60000);
    App.profile.doneMinutesTotal += Math.min(minutes, 24 * 60); // Ausreißer begrenzen
  };

  App.topEntries = function (obj, n) {
    return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  };

  App.bestHour = function (hours) {
    const top = App.topEntries(hours, 1);
    return top.length ? parseInt(top[0][0], 10) : 9;
  };

  /* Standard-Zeit: gelernte Lieblings-Uhrzeit, sonst "in 1 Stunde" */
  App.suggestedDefaultTime = function () {
    const top = App.topEntries(App.profile.hourCounts, 1);
    if (top.length && top[0][1] >= 3) return App.nextOccurrence(parseInt(top[0][0], 10));
    const d = new Date(Date.now() + 60 * 60000);
    d.setSeconds(0, 0);
    return d;
  };

  /* Blitz-Termine: alles, was mindestens 2× eingetragen wurde */
  App.learnedTemplates = function () {
    return Object.values(App.profile.textStats)
      .filter(s => s.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  };
})();
