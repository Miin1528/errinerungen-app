"use strict";
/* Zentraler Zustand + Speicherung (localStorage) */
window.App = {
  KEY_REMINDERS: "erinnerungen.v1",
  KEY_PROFILE: "profil.v1",
  MIN_REREMIND: 120, // Wieder-Erinnerung: mindestens 2 Stunden
  reminders: [],
  profile: null,
  filter: "offen",
  suche: "",
  katFilter: null
};

/* Feste Kategorien mit Farben (für Liste, Filter und Kalender-Punkte) */
App.KATEGORIEN = [
  { id: "gesundheit", name: "Gesundheit", icon: "💊", farbe: "#5cbf8a" },
  { id: "arbeit",     name: "Arbeit",     icon: "💼", farbe: "#5c9dbf" },
  { id: "privat",     name: "Privat",     icon: "🏠", farbe: "#bf8a5c" },
  { id: "einkauf",    name: "Einkaufen",  icon: "🛒", farbe: "#b05cbf" },
  { id: "sonstiges",  name: "Sonstiges",  icon: "⭐", farbe: "#8f8f8f" }
];
App.katById = function (id) {
  return App.KATEGORIEN.find(k => k.id === id) || App.KATEGORIEN[App.KATEGORIEN.length - 1];
};

App.defaultProfile = function () {
  return {
    textStats: {},   // gelernte Erinnerungs-Texte: {key: {text, count, hours:{h:n}, kat}}
    hourCounts: {},  // gelernte Lieblings-Uhrzeiten
    wordCounts: {},  // gelernte Themen-Wörter
    katStats: {},    // gelernt: Wort → {kategorie: Anzahl} für Kategorie-Vorschläge
    created: 0, done: 0, doneMinutesTotal: 0,
    settings: {
      reRemindMinutes: 120,
      notifications: true,
      sound: true,
      vibration: true,
      theme: "system",   // system | dunkel | hell
      name: "",
      pushServerUrl: ""  // optional: eigener Web-Push-Server (siehe server/)
    },
    firstUse: Date.now()
  };
};

App.load = function () {
  try { App.reminders = JSON.parse(localStorage.getItem(App.KEY_REMINDERS)) || []; }
  catch (e) { App.reminders = []; }
  const def = App.defaultProfile();
  try {
    const p = JSON.parse(localStorage.getItem(App.KEY_PROFILE)) || {};
    const settings = Object.assign(def.settings, p.settings || {});
    App.profile = Object.assign(def, p);
    App.profile.settings = settings;
  } catch (e) { App.profile = def; }
};

App.save = function () {
  localStorage.setItem(App.KEY_REMINDERS, JSON.stringify(App.reminders));
  localStorage.setItem(App.KEY_PROFILE, JSON.stringify(App.profile));
};

App.exportData = function () {
  return JSON.stringify({
    exportiert: new Date().toISOString(),
    erinnerungen: App.reminders,
    profil: App.profile
  }, null, 2);
};

App.importData = function (json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.erinnerungen) || typeof data.profil !== "object") {
    throw new Error("Ungültiges Format");
  }
  App.reminders = data.erinnerungen;
  const def = App.defaultProfile();
  const settings = Object.assign(def.settings, (data.profil.settings || {}));
  App.profile = Object.assign(def, data.profil);
  App.profile.settings = settings;
  App.save();
};
