# 📡 Push-Server (optional)

Die App erinnert dich auch **ohne** diesen Server zuverlässig – solange sie installiert
ist bzw. der Browser im Hintergrund läuft. Dieser kleine Server ist der Zusatzschritt
für **Push-Benachrichtigungen bei komplett geschlossener App**.

## Was er macht

- Deine App meldet ihm ihre offenen Erinnerungen (automatisch, sobald in den
  App-Einstellungen eine Push-Server-URL eingetragen ist).
- Der Server prüft jede Minute, was fällig ist, und schickt eine
  Web-Push-Benachrichtigung an dein Handy – inklusive **Wieder-Erinnerung nach
  mindestens 2 Stunden**, bis du in der App „Erledigt" tippst.
- Gespeichert wird in einer einfachen `daten.json` direkt neben dem Server.

## Deployment (z. B. Render.com, Railway, Fly.io – Gratis-Stufen reichen)

1. Neuen „Web Service" aus diesem Repository anlegen, Ordner `server/` als Wurzel wählen.
2. Build-Befehl: `npm install` – Start-Befehl: `npm start`
3. Optional (empfohlen für feste Schlüssel) Umgebungsvariablen setzen:
   - `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` – erzeugen mit `npx web-push generate-vapid-keys`
   - `VAPID_EMAIL` – deine E-Mail-Adresse
   Ohne diese Variablen erzeugt der Server beim ersten Start selbst Schlüssel und
   speichert sie in `daten.json` (auf Hosts mit flüchtigem Speicher gehen sie bei
   jedem Neustart verloren – dann bitte die Umgebungsvariablen nutzen).
4. Die öffentliche Server-Adresse (z. B. `https://mein-server.onrender.com`) in der App
   unter **Einstellungen → Push-Server-URL** eintragen. Die App verbindet sich, fragt
   nach der Benachrichtigungs-Erlaubnis und synchronisiert ab dann automatisch.

## Server-KI (optional): der Assistent wird zur echten KI

Die App hat einen eingebauten Assistenten, der auch ohne Server funktioniert.
Wenn du diesem Server zusätzlich einen Claude-API-Schlüssel gibst, beantwortet
**Claude** die freien Fragen des Assistenten – mit dem Wissen über die
Erinnerungen und Gewohnheiten des Nutzers als Kontext:

1. API-Schlüssel auf https://platform.claude.com erstellen
2. Beim Hosting die Umgebungsvariable `ANTHROPIC_API_KEY` setzen
3. In der App die Push-Server-URL eintragen (Einstellungen) – fertig.
   Antworten des Assistenten zeigen dann „☁️ Server-KI" als Quelle.

Der Endpunkt ist `POST /assistent` mit `{ "frage": "...", "kontext": "..." }`
und antwortet mit `{ "antwort": "..." }` (Modell: `claude-opus-4-8`).

## Lokal testen

```bash
cd server
npm install
npm start          # läuft auf http://localhost:3000
```

## Hinweis

Mit Push-Server liegen deine offenen Erinnerungstexte auf dem Server, den **du**
betreibst. Ohne Server bleibt alles ausschließlich auf deinem Gerät.
