---
date: 2026-08-16
topic: typspezifische-formularfelder
status: Gedanke, nicht beschlossen
---

# Dokumenttyp-spezifische Formularfelder

## Der Gedanke

Beim Anlegen eines Dokuments hängen die sinnvollen Felder vom Typ ab. Eine Notiz
braucht Titel und Text. Zugangsdaten brauchen Name, URL, Benutzername, Passwort,
Beschreibung. Eine Rechnung hätte gern Betrag, Fälligkeit und Rechnungsnummer.
Ein Vertrag Laufzeit und Kündigungsfrist. Heute zeigt das Formular allen Typen
dasselbe an — bis auf Zugangsdaten, das den Sonderweg schon geht.

## Was heute existiert

`create-note-sheet.tsx` schaltet über ein einzelnes `isCredentials`-Flag:
Labels wechseln („Titel" → „Name", „Notiz" → „Beschreibung"), drei Felder kommen
dazu, und `buildCredentialsContent()` faltet URL und Benutzername in den
Markdown-Text. Das Passwort geht separat und verschlüsselt nach
`documents.secret`.

Das trägt für **einen** Sondertyp. Beim zweiten wird es eine Kette von
Bedingungen, beim dritten unlesbar. Die Naht liegt aber richtig: alles steckt in
einer Komponente plus einer reinen Funktion.

## Drei Fragen, die vor dem Bau zu klären sind

**1. Wohin mit den Werten?** Heute: in den Markdown-Text gefaltet. Das kostet
keine Migration, ist sofort durchsuchbar und braucht kein neues Rendering — aber
es ist Text, keine Daten. Nichts kann nach „alle Rechnungen über 200 €" filtern.
Die Alternative wäre `documents.fields jsonb` plus ein Renderer in der
Detailansicht. Der Preis ist ein zweiter Ort für Dokumentinhalt neben `ocr_text`.

**2. Der eigentliche Knackpunkt: Doppelung mit der Extraktion.** Für gescannte
Dokumente macht die LLM-Analyse genau das schon — `facts` (Label/Wert),
`amounts` (kind, Label, Datum), `dates` (Typ, Label). Ein Rechnungsformular mit
den Feldern „Betrag" und „Fälligkeit" würde eine zweite, konkurrierende
Datenquelle für dieselbe Information aufmachen. Zugangsdaten waren deshalb der
saubere Fall: sie haben kein Extraktionspendant, weil sie nie gescannt werden.

Die brauchbare Formulierung ist wohl: typspezifische Felder sind der
**manuelle Ersatz** für die Extraktion, nicht ein zusätzlicher Kanal. Was der
Nutzer eintippt, müsste in dieselben Strukturen laufen (ein Feld „Betrag"
erzeugt einen `amount`-Eintrag), nicht daneben.

**3. Zwei Formularwege.** Manuell angelegt wird im Sheet, gescannt wird über die
Review-Card. Beide müssten dieselbe Felddefinition lesen, sonst laufen sie
auseinander.

## Wie eine Registry aussehen könnte

Neben `DOCUMENT_TYPE_LABELS` und `DOCUMENT_TYPE_ICONS` in
`src/lib/schemas/extraction.ts` eine dritte Tabelle: pro Typ eine Liste von
Feldern mit Key, Label, Eingabetyp (Text, URL, Betrag, Datum, Passwort),
Platzhalter und Ziel — Markdown-Text, `secret`, oder eine Extraktionsstruktur.
Das Sheet rendert die Liste, statt Bedingungen zu verzweigen; Zugangsdaten wird
der erste Eintrag darin und verliert seinen Sonderweg.

Kandidaten, falls es soweit kommt: Rechnung (Betrag, Fälligkeit,
Rechnungsnummer), Versicherung (Anbieter, Policennummer), Vertrag (Anbieter,
Laufzeit, Kündigungsfrist), Arztbrief (Praxis, Datum). Nicht alle neun Typen
brauchen eigene Felder — „Sonstiges" und „Notiz" bleiben leer.

## Erster kleiner Schritt

Beim **zweiten** Sondertyp, nicht vorher: Zugangsdaten in eine Registry
umziehen, ohne Verhalten zu ändern. Solange es bei einem bleibt, sind die
Bedingungen im Sheet die billigere Lösung.
