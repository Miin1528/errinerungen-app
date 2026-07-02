# ⏰ Meine Erinnerungen

Eine persönliche Erinnerungs-App, die **mitlernt**. Alles läuft direkt im Browser –
keine Installation, kein Konto, keine Cloud. Deine Daten bleiben privat auf deinem Gerät.

## Was die App kann

- **📝 Erinnerungen aufschreiben** – mit Text, Datum und Uhrzeit. Alle Erinnerungen
  (offen und erledigt) bleiben gespeichert und sind jederzeit einsehbar.
- **⚡ Termine mit einem Klick** – Schnell-Buttons („In 2 Std.", „Heute 18:00",
  „Morgen 09:00") und **Blitz-Termine**: Sobald du etwas zum zweiten Mal einträgst,
  merkt sich die App Text und typische Uhrzeit und bietet es dir als 1-Klick-Termin an.
- **🔁 Wieder-Erinnerung nach mindestens 2 Stunden** – Wenn eine Erinnerung fällig ist
  und du sie nicht als „Erledigt" markierst, erinnert dich die App nach frühestens
  2 Stunden automatisch erneut – so lange, bis du sie abhakst. Das Intervall ist in den
  Einstellungen anpassbar (Minimum: 120 Minuten).
- **🧠 Die App lernt dich kennen** – Sie merkt sich:
  - welche Erinnerungen du oft einträgst (→ Blitz-Termine mit 1 Klick),
  - deine Lieblings-Uhrzeit (→ wird als Standardzeit vorgeschlagen),
  - deine häufigsten Themen und wie schnell du Dinge erledigst,
  - und vervollständigt deine Eingaben anhand früherer Erinnerungen.

## So startest du die App

Einfach die Datei **`index.html`** im Browser öffnen (Doppelklick) – fertig.

Tipp: Beim ersten Speichern fragt der Browser nach der Erlaubnis für
Benachrichtigungen – mit „Zulassen" bekommst du Erinnerungen auch, wenn du gerade
in einem anderen Tab arbeitest. Zusätzlich gibt es einen Erinnerungston und ein
gelbes Banner in der App. Damit die Erinnerungen klingeln können, muss der Tab
geöffnet bleiben.

## Technik

- Eine einzige HTML-Datei, reines HTML/CSS/JavaScript – keine Abhängigkeiten.
- Speicherung per `localStorage` (Erinnerungen + Lernprofil), alles bleibt lokal.
- Prüfintervall alle 20 Sekunden; Browser-Benachrichtigungen + Ton + Banner.
