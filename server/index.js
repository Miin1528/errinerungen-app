"use strict";
/* Optionaler Push-Server für "Meine Erinnerungen".
   Sendet Web-Push-Benachrichtigungen, auch wenn die App komplett geschlossen ist.
   Deployment: siehe server/README.md */

const express = require("express");
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");

const DATEI = path.join(__dirname, "daten.json");
const PORT = process.env.PORT || 3000;
const MIN_REREMIND = 120; // Wieder-Erinnerung: mindestens 2 Stunden

let daten = { vapid: null, geraete: {} };
try { daten = Object.assign(daten, JSON.parse(fs.readFileSync(DATEI, "utf8"))); } catch (e) { /* erster Start */ }

function speichern() {
  fs.writeFileSync(DATEI, JSON.stringify(daten, null, 2));
}

// VAPID-Schlüssel: aus Umgebungsvariablen oder beim ersten Start automatisch erzeugen
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  daten.vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else if (!daten.vapid) {
  daten.vapid = webpush.generateVAPIDKeys();
  speichern();
  console.log("Neue VAPID-Schlüssel erzeugt und in daten.json gespeichert.");
}
webpush.setVapidDetails(
  "mailto:" + (process.env.VAPID_EMAIL || "erinnerungen@example.com"),
  daten.vapid.publicKey,
  daten.vapid.privateKey
);

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS: die App läuft auf GitHub Pages, der Server woanders
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Optionale Server-KI: Claude beantwortet freie Fragen des App-Assistenten,
// sobald ANTHROPIC_API_KEY gesetzt ist (siehe README)
let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  const Anthropic = require("@anthropic-ai/sdk");
  anthropic = new Anthropic(); // liest ANTHROPIC_API_KEY aus der Umgebung
}

app.get("/", (req, res) => res.json({ app: "erinnerungen-push-server", ok: true, ki: !!anthropic }));

app.post("/assistent", async (req, res) => {
  if (!anthropic) return res.status(503).json({ fehler: "Keine KI konfiguriert – ANTHROPIC_API_KEY setzen" });
  const { frage, kontext } = req.body || {};
  if (!frage || typeof frage !== "string") return res.status(400).json({ fehler: "frage nötig" });
  try {
    const antwort = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024, // Assistenten-Antworten sind bewusst kurz
      thinking: { type: "adaptive" },
      system: "Du bist der freundliche Assistent der Erinnerungs-App „Meine Erinnerungen“. " +
        "Antworte kurz, warm und auf Deutsch. Nutze den mitgelieferten Kontext über die Erinnerungen " +
        "und Gewohnheiten des Nutzers. Du kannst selbst keine Erinnerungen anlegen – wenn der Nutzer " +
        "eine anlegen möchte, sag ihm, dass er es direkt so formulieren kann: „Erinnere mich morgen um 9 an …“.",
      messages: [{
        role: "user",
        content: (typeof kontext === "string" && kontext ? "Kontext:\n" + kontext.slice(0, 4000) + "\n\n" : "") + frage.slice(0, 2000)
      }]
    });
    const text = antwort.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\n")
      .trim();
    res.json({ antwort: text || "Dazu fällt mir gerade nichts ein – frag mich gern anders. 🙈" });
  } catch (e) {
    console.error("KI-Anfrage fehlgeschlagen:", e.message);
    res.status(502).json({ fehler: "KI-Anfrage fehlgeschlagen" });
  }
});

app.get("/vapidPublicKey", (req, res) => res.type("text/plain").send(daten.vapid.publicKey));

/* Gerät registriert seine Push-Subscription */
app.post("/subscribe", (req, res) => {
  const { geraet, subscription } = req.body || {};
  if (!geraet || !subscription) return res.status(400).json({ fehler: "geraet und subscription nötig" });
  const g = daten.geraete[geraet] = daten.geraete[geraet] || { erinnerungen: [], reRemindMinutes: MIN_REREMIND };
  g.subscription = subscription;
  speichern();
  res.json({ ok: true });
});

/* Gerät meldet seine offenen Erinnerungen (bei jeder Änderung) */
app.post("/sync", (req, res) => {
  const { geraet, erinnerungen, reRemindMinutes } = req.body || {};
  if (!geraet || !Array.isArray(erinnerungen)) return res.status(400).json({ fehler: "geraet und erinnerungen nötig" });
  const g = daten.geraete[geraet] = daten.geraete[geraet] || {};
  // lastNotifiedAt des Servers behalten, wenn der Client keinen neueren Stand hat
  const alt = new Map((g.erinnerungen || []).map(r => [r.id, r]));
  g.erinnerungen = erinnerungen.map(r => {
    const vorher = alt.get(r.id);
    if (vorher && (vorher.lastNotifiedAt || 0) > (r.lastNotifiedAt || 0)) {
      r.lastNotifiedAt = vorher.lastNotifiedAt;
      r.notifyCount = vorher.notifyCount;
    }
    return r;
  });
  g.reRemindMinutes = Math.max(MIN_REREMIND, parseInt(reRemindMinutes, 10) || MIN_REREMIND);
  speichern();
  res.json({ ok: true, anzahl: g.erinnerungen.length });
});

/* Jede Minute: Fälligkeit prüfen, inkl. Wieder-Erinnerung nach mind. 2 Stunden */
setInterval(async () => {
  const jetzt = Date.now();
  let geaendert = false;
  for (const g of Object.values(daten.geraete)) {
    if (!g.subscription || !Array.isArray(g.erinnerungen)) continue;
    const intervall = Math.max(MIN_REREMIND, g.reRemindMinutes || MIN_REREMIND) * 60000;
    for (const r of g.erinnerungen) {
      if (r.dueAt > jetzt) continue;
      if (r.lastNotifiedAt && jetzt - r.lastNotifiedAt < intervall) continue;
      r.lastNotifiedAt = jetzt;
      r.notifyCount = (r.notifyCount || 0) + 1;
      geaendert = true;
      try {
        await webpush.sendNotification(g.subscription, JSON.stringify({
          title: r.notifyCount > 1 ? "⏰ Wieder-Erinnerung (" + r.notifyCount + "×)" : "⏰ Erinnerung",
          body: r.text,
          id: r.id
        }));
      } catch (e) {
        // Subscription abgelaufen → entfernen, Gerät meldet sich beim nächsten App-Start neu
        if (e.statusCode === 404 || e.statusCode === 410) { delete g.subscription; }
      }
    }
  }
  if (geaendert) speichern();
}, 60000);

app.listen(PORT, () => console.log("Push-Server läuft auf Port " + PORT));
