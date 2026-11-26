# The Daily Buzz

The Daily Buzz lost aus, wer das Daily moderiert. Im Wochenmodus verteilt das Bienenrennen die Moderation von Montag bis Freitag. Ausgeloste Personen pausieren bis zum nächsten Wochenplan. Im Einzelmodus steht jedes Rennen für sich.

## Starten

Lade `index.html` aus dem Hauptverzeichnis herunter und öffne die Datei per Doppelklick im Browser. Grafiken, CSS und JavaScript sind darin eingebettet. Die Anwendung läuft auch offline.

1. Bearbeite die Namen und wähle die Teilnehmenden unter **The hive** aus.
2. Wähle **Weekly** oder **Single race** und stelle die Rennzeit auf 3 bis 30 Sekunden ein.
3. Starte das nächste Rennen. **Auto draw** lost im Wochenmodus alle verbleibenden Tage aus. Mit **Copy lineup** kannst du den Wochenplan weitergeben.

**Present** vergrößert die Rennansicht für die Bildschirmfreigabe. Unter **Extras** findest du die Streckenauswahl, Rennereignisse und die bisherigen Wochenpläne.

Der Browser speichert Namen, Einstellungen und Auslosungen lokal. Ein anderes Gerät, Browserprofil oder eine andere Adresse kann einen eigenen Spielstand haben.

## Bereitstellung

Lege `index.html` als Startdatei im Hauptverzeichnis eines statischen Webservers ab. Die Datei ist der vollständige Anwendungsumfang und kann auch direkt weitergegeben werden.

## Automatisierte Tests

Führe im Hauptverzeichnis mit Node.js 20 oder neuer `node --test daily-buzz.test.mjs` aus. Die Tests simulieren die Browser-APIs und prüfen unter anderem Rennzeiten, Wochenauslosungen, Abbrüche sowie das Laden und Speichern der Einstellungen.
