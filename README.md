# ⏰ Meine Erinnerungen

Eine persönliche Erinnerungs-App, die **mitlernt** – als installierbare Web-App (PWA)
fürs Handy und den Desktop. Keine Anmeldung, keine Cloud: Deine Daten bleiben privat
auf deinem Gerät.

## Was die App kann

- **📝 Erinnerungen aufschreiben** – Text, Datum und Uhrzeit über das ➕ eintragen.
  Alle Erinnerungen (offen und erledigt) bleiben gespeichert.
- **⚡ Termine mit einem Klick** – Schnell-Chips („In 2 Std.", „Heute 18:00",
  „Morgen 09:00") und **Blitz-Termine**: Ab dem zweiten gleichen Eintrag merkt sich die
  App Text und typische Uhrzeit und bietet beides als 1-Klick-Termin an.
- **🔁 Wieder-Erinnerung nach mindestens 2 Stunden** – Fällige Erinnerungen melden sich
  automatisch alle 2 Stunden erneut (Intervall einstellbar, Minimum 120 Minuten), bis
  du „Erledigt" tippst – auf Android direkt in der System-Benachrichtigung mit den
  Buttons **„✓ Erledigt"** und **„⏳ +2 Std."**.
- **🧠 Die App lernt dich kennen** – häufige Erinnerungen (→ Blitz-Termine),
  Lieblings-Uhrzeit (→ Zeit-Vorauswahl), häufigste Themen, dein Erledigungs-Tempo und
  Text-Vervollständigung aus früheren Einträgen. Alles einsehbar im Bereich **Profil**.
- **⚙️ Einstellungen** – Name für die Begrüßung, Design (Dunkel/Hell/System),
  Wieder-Erinnerungs-Intervall, Benachrichtigungen/Ton/Vibration, Test-Benachrichtigung,
  App-Installation, Daten-Export/-Import, optionale Push-Server-URL.

## 📱 Auf dem Handy installieren (Android)

1. **GitHub Pages einmalig aktivieren:** Repository → **Settings → Pages** → unter
   „Build and deployment" als Source **„GitHub Actions"** wählen. Beim nächsten Push
   auf `main` veröffentlicht der mitgelieferte Workflow (`.github/workflows/pages.yml`)
   die App automatisch unter `https://<benutzername>.github.io/app/`.
2. Diese Adresse am Handy in Chrome öffnen.
3. Menü (⋮) → **„Zum Startbildschirm hinzufügen"** (oder den Installieren-Button in den
   App-Einstellungen antippen).
4. Beim ersten Speichern **Benachrichtigungen erlauben** – fertig! Die App läuft ab
   dann auch offline.

> **Hinweis zu Benachrichtigungen ohne Server:** Sie kommen zuverlässig, solange die
> installierte App bzw. der Browser im Hintergrund läuft. Für Push bei komplett
> geschlossener App gibt es den optionalen Server im Ordner [`server/`](server/README.md).

## 🗂 Aufbau

```
index.html                  App-Shell (Ansichten, Bottom-Navigation, FAB, Bottom-Sheet)
css/style.css               Design: Themes (dunkel/hell/System), Animationen
js/storage.js               Zustand, localStorage, Export/Import
js/learning.js              Lernprofil (Blitz-Termine, Lieblingszeit, Themen)
js/notify.js                System-Benachrichtigungen, Ton, Vibration
js/ui.js                    Rendering, Bottom-Sheet, Theme, Toast
js/app.js                   Verkabelung, Tick-Loop, Service Worker, Install, Push-Sync
sw.js                       Service Worker: Offline-Cache, Benachrichtigungs-Buttons, Web-Push
manifest.webmanifest        PWA-Manifest
icons/                      App-Icons
server/                     Optionaler Push-Server (siehe server/README.md)
.github/workflows/pages.yml Automatisches Deployment auf GitHub Pages
```

Reines HTML/CSS/JavaScript ohne Abhängigkeiten. Zum lokalen Testen genügt:
`python3 -m http.server` im Projektordner, dann `http://localhost:8000` öffnen
(über `http://localhost` funktionieren auch Service Worker und Benachrichtigungen).
