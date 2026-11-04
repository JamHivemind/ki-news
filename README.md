# KI-News

Die wichtigsten Neuigkeiten aus der KI-Welt, jeden Morgen kurz auf Deutsch zusammengefasst.

**Lesen:** die GitHub-Pages-Seite dieses Repos. Als Lesezeichen oder auf dem Handy-Startbildschirm speichern.

## So funktioniert es

```
Claude-Code-Routine (täglich 07:00 Uhr)
  → liest sources.yaml + seen.json
  → holt die Quellen, wählt 8–15 Meldungen, schreibt eigene Kurzfassungen
  → schreibt content.json und pusht

GitHub Action (bei Änderung an content.json)
  → node scripts/build.mjs
  → baut archive/{datum}.html, archive/index.html, index.html
  → pflegt seen.json + archive/manifest.json, pusht
  → GitHub Pages zeigt die Seite
```

Quellen und Rubriken stehen in `sources.yaml`, das Aussehen in `template.html` und `assets/style.css`.

## Lokal bauen

```
node scripts/build.mjs
```

Keine Abhängigkeiten, Node 18 oder neuer.

## Herkunft

Aufbau nach [junjzhang/daily-brief](https://github.com/junjzhang/daily-brief) (MIT-Lizenz), angepasst auf Deutsch, Top 3, Rubriken und ein Node-Build-Skript.
