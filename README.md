# The Daily Buzz v1.2

The Daily Buzz lost aus, wer das Daily moderiert. Im Wochenmodus verteilt das Bienenrennen die Moderation von Montag bis Freitag. Standardmäßig pausieren ausgeloste Personen bis zum nächsten Wochenplan. Im Einzelmodus steht jedes Rennen für sich.

## Starten

Lade `index.html` aus dem Hauptverzeichnis herunter und öffne die Datei per Doppelklick im Browser. Grafiken, CSS und JavaScript sind darin eingebettet. Die Anwendung läuft auch offline.

1. Bearbeite die Namen und wähle die Teilnehmenden unter **The hive** aus.
2. Wähle **Weekly** oder **Single race** und stelle die Rennzeit auf 3 bis 30 Sekunden ein.
3. Starte das nächste Rennen. **Auto draw** lost im Wochenmodus alle verbleibenden Tage aus. Mit **Copy lineup** kannst du den Wochenplan weitergeben.
4. Nach der letzten Auslosung setzt **New weekly draw** den aktuellen Plan nach einer Bestätigung zurück. Teilnehmer, Einstellungen und Historie stehen für die nächste Auslosung bereit.

**Present** vergrößert die Rennansicht für die Bildschirmfreigabe.

## Extras

- **Race experience** enthält die Streckenauswahl sowie die Schalter für Sound und Rennereignisse.
- **Manage race events** zeigt Standardereignisse, seltene Ereignisse und eigene Einträge samt Geschwindigkeitseffekt. Mit **×** entfernst du einen Eintrag. **Restore default events** bringt die vorinstallierten Ereignisse zurück und behält eigene Einträge.
- **Advanced settings** enthält Fotofinish, seltene Ereignisse und **Allow repeat winners**. Damit kann auch eine einzige aktive Person alle fünf Wochentage abdecken. Änderungen während einer teilweise ausgelosten Woche gelten ab dem nächsten Rennen.
- **Hall of Fame** zeigt vergangene Wochenpläne und zählt jede Tageszuweisung in der Statistik.

Der Browser speichert Namen, Einstellungen und Auslosungen lokal. Ein anderes Gerät, Browserprofil oder eine andere Adresse kann einen eigenen Spielstand haben.

## Bereitstellung

Lege `index.html` als Startdatei im Hauptverzeichnis eines statischen Webservers ab. Die Datei ist der vollständige Anwendungsumfang und kann auch direkt weitergegeben werden.

## Automatisierte Tests

Führe im Hauptverzeichnis mit Node.js 20 oder neuer `node --test daily-buzz.test.mjs` aus. Die Tests prüfen unter anderem Rennzeiten, Wochenauslosungen, Ereignispools, die Historie und das Laden älterer Spielstände.
