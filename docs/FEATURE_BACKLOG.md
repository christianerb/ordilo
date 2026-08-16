# Feature-Backlog

Vorgemerkte Features und bekannte Grenzen, die bewusst offen sind — nicht
vergessen, sondern vertagt. Jeder Eintrag sagt, was fehlt, warum es heute
noch geht, und was ein Umsetzen kosten würde.

Reihenfolge = grobe Priorität, nicht Zeitplan.

---

## Aufgaben

### Wiederkehrende Aufgaben (Recurrence)

**Was fehlt.** „Müll rausbringen, jeden Dienstag." Aufgaben kennen nur ein
einzelnes `due_date`. Termine im Kalender können `recurrence` schon
(`calendar_events.recurrence`, `recurrence_until`,
`recurrence_exceptions`) — Aufgaben nicht.

**Warum es heute geht.** Familien legen die Aufgabe jede Woche neu an, oder
sie steht als Termin im Kalender. Beides ist Handarbeit, aber nichts geht
verloren.

**Was es kostet.** Migration auf `tasks` (dieselben drei Spalten wie bei
Terminen), eine Entscheidung über das Verhalten beim Abhaken (nächste
Instanz erzeugen vs. virtuelle Instanzen aus einer Regel ableiten), und die
Wiederholungs-UI in Anlege- und Detail-Sheet. Die Kalender-Implementierung
ist die Vorlage.

**Offene Produktfrage.** Beim Abhaken einer wöchentlichen Aufgabe: rückt
`due_date` eine Woche weiter (eine Zeile, ewig), oder entsteht eine neue
Zeile und die alte landet in „Erledigt" (Historie, aber wachsende Liste)?
Die zweite Variante passt besser zu `completed_at` und zum Erledigt-Fenster.

---

### Gleichzeitiges Bearbeiten (Lost Update)

**Was fehlt.** Optimistic Concurrency beim Speichern im Detail-Sheet. Wenn
Christian eine Aufgabe offen im Editor hat und Karina sie parallel ändert,
überschreibt sein „Änderungen speichern" ihre Änderung — der Editor
schreibt alle Felder aus seinem Formularzustand.

**Warum es heute geht.** Es ist ein echter Edge Case: beide müssen dieselbe
Aufgabe gleichzeitig offen haben. Die schnellen Wege (abhaken,
verschieben, zuweisen) sind nicht betroffen — die schreiben nur das Feld,
das sie ändern, und sind alle einzeln zurücknehmbar.

**Wichtig zu wissen.** Seit die Liste live synchronisiert
(`postgres_changes` auf `tasks`), wird der Fall *wahrscheinlicher*, nicht
seltener: man sieht die fremde Änderung jetzt in der Liste, während der
eigene Editor noch den alten Stand hält.

**Was es kostet.** `tasks.updated_at` (Spalte + Trigger), das Sheet merkt
sich den Stand beim Öffnen, das Update wird gegen ihn gefiltert
(`.eq("updated_at", …)`), und bei 0 betroffenen Zeilen sagt die UI Bescheid
statt stillschweigend zu gewinnen. Fürs Zusammenführen reicht ein
„Karina hat das inzwischen geändert — neu laden?".

---

### Filter- und Verlaufslogik für Erledigtes

**Was fehlt.** „Erledigt" zeigt bewusst nur die letzten
`RECENT_DONE_DAYS` (7) Tage, und der Server lädt auch nur die. Ältere
Aufgaben bleiben in der Datenbank, sind aus der App aber nicht erreichbar.

**Warum es heute geht.** Das ist die gewünschte Voreinstellung — niemand
will neun Monate alte Aufgaben in der Tagesliste. Die Zeile unter dem
Abschnitt sagt ausdrücklich, dass ältere Aufgaben gespeichert bleiben, es
gibt also kein stilles Verschwinden.

**Was es kostet.** Eine eigene Ansicht statt eines größeren Fensters:
Zeitraum wählen, nach Person filtern, evtl. Suche. `completed_at` und der
Index `tasks_family_completed_at_idx` sind die Grundlage und liegen schon.

---

### Manuelle Reihenfolge (das einzig sinnvolle Drag & Drop)

**Was fehlt.** „Diese drei zuerst." Innerhalb eines Abschnitts sortiert nur
das Datum; eine eigene Priorisierung kann die App nicht ausdrücken.

**Kontext.** Das alte Drag & Drop zog Zeilen zwischen *Datums-Abschnitten*
und hat dabei geraten (Drop in „Diese Woche" bedeutete heimlich *morgen*,
Drop in „Später" löschte das Datum). Es wurde ersetzt, nicht verschoben.
Ziehen *innerhalb* eines Abschnitts ist eine andere, viel bravere Geste:
das Ziel ist die Nachbarzeile, nicht ein Bildschirm weiter unten.

**Was es kostet.** `tasks.sort_order`, Long-Press-Reorder innerhalb einer
Sektion, und eine Antwort darauf, was mit der Reihenfolge passiert, wenn
sich das Datum ändert.

**Vorher zu klären.** Ob es überhaupt gebraucht wird. `DESIGN.md`
beschreibt Priority-Badges (hoch/mittel/niedrig), die es im Schema nie
gegeben hat — vielleicht ist eine Prioritätsstufe die einfachere Antwort
als eine frei sortierbare Liste.

---

### Aufgaben für mehrere Personen

**Was fehlt.** `tasks.assigned_to` ist ein einzelnes Mitglied. „Machen wir
beide zusammen" geht nicht.

**Warum es heute geht.** Eine Person ist verantwortlich — das ist meistens
sogar die bessere Voreinstellung, weil geteilte Verantwortung in Familien
gern zu keiner Verantwortung wird.

**Was es kostet.** Join-Tabelle wie `calendar_event_attendees`, dazu eine
Entscheidung, was die Zähler auf den Filter-Chips dann zählen.

---

### Uhrzeit an Aufgaben

**Was fehlt.** Aufgaben haben ein Datum, keine Uhrzeit.

**Warum das so bleiben darf.** Die Trennung ist beabsichtigt: Aufgaben sind
Tage, Termine sind Uhrzeiten — und Termine gibt es im Planer-Tab schon
inklusive Start-/Endzeit. Hier steht es nur, damit die Grenze bewusst ist
und nicht irgendwann als Bug gemeldet wird.

---

### Zuständigkeit auf dem Home-Screen

**Was fehlt.** Die Aufgabenzeilen auf `/home` zeigen kein Gesicht:
`home-client.tsx` setzt `assigned_member_name` fest auf `null`, weil die
Home-Abfrage keine Mitgliedernamen lädt.

**Warum es heute geht.** Der Home-Screen zeigt „was steht heute an", nicht
„wer macht was" — die Verteilung ist eine Frage an die Aufgabenliste.

**Was es kostet.** Mitglieder (Name, Farbe, Foto) in die Home-Abfrage, dann
dieselbe `assignee`-Auflösung wie in der Liste.

---

## Wer hat was gemacht

**Was fehlt.** `tasks` hat kein `created_by` und kein `completed_by`. Wer
eine Aufgabe angelegt oder abgehakt hat, ist nicht festgehalten.

**Warum es heute geht.** Für „wer macht was" reicht die Zuweisung. Der
Unterschied fällt erst auf, wenn man ihn braucht: eine Änderung, die von
jemand anderem kommt, ist nicht als solche erkennbar — deshalb sagt die
Aufgabenliste bei fremden Änderungen auch nichts, während der Kalender
„Neuer Termin von deiner Familie" melden kann (`calendar_events.created_by`
gibt es).

**Was es kostet.** Zwei Spalten, beim Schreiben mitfüllen, und dann kann
die Liste dasselbe wie der Kalender: fremde Neuzugänge freundlich melden,
ohne die eigenen zu doppeln.
