import type { Guide } from "./guides";

export const expandedGuides: Guide[] = [
  {
    slug: "familienkalender-organisieren",
    title:
      "Familienkalender organisieren: Termine, Wege und Zuständigkeit klären",
    description:
      "Papier oder digital? Ein Familienkalender mit klaren Einträgen, einer Entscheidungshilfe und einer kostenlosen Termin-Vorlage zum Kopieren.",
    topic: "Gemeinsame Termine",
    updated: "2026-10-21",
    answer:
      "Ein Familienkalender hilft, wenn alle den aktuellen Stand sehen und ein Eintrag mehr enthält als eine Uhrzeit. Haltet Anlass, Ort, Vorbereitung und Zuständigkeit fest. Klärt Änderungen ausdrücklich mit den betroffenen Personen. Ob Papier oder digital besser passt, hängt davon ab, wo ihr den Kalender tatsächlich braucht.",
    sections: [
      {
        id: "auswahl",
        title: "Papier oder digital: Welcher Familienkalender passt?",
        body: "Beginnt mit eurem Alltag: Wer muss unterwegs etwas nachsehen? Wer trägt Änderungen ein? Wo schaut ihr morgens wirklich hin? Ein schöner Kalender bringt wenig, wenn ihn nur die Person benutzt, die ohnehin alle Termine im Kopf hat.\n\n| Variante | Passt zu euch, wenn … | Das müsst ihr klären |\n| --- | --- | --- |\n| Wandkalender | ihr regelmäßig am selben Ort plant | Wie erfahren Abwesende von Änderungen? |\n| Gemeinsamer digitaler Kalender | mehrere Personen unterwegs nachsehen | Haben alle Zugriff und kennen die Ansicht? |\n| Papier plus digital | ihr bewusst zwei unterschiedliche Ansichten braucht | Welcher Stand ist verbindlich und wer gleicht ab? |\n\nZwei vollständige Kalender erhöhen den Pflegeaufwand. Wenn ihr beides nutzt, benennt einen verbindlichen Stand. Eine Papierübersicht kann beispielsweise nur die kommende Woche zeigen, während neue Termine zuerst digital eingetragen werden. Das ist ein möglicher Ablauf, keine Pflicht.",
      },
      {
        id: "eintrag",
        title: "Was gehört in einen Kalendereintrag?",
        body: "Ein Termin beschreibt, was wann stattfindet. Er beantwortet nicht automatisch, wer hinfährt oder was vorher erledigt werden muss. Notiert diese Informationen so, dass jemand anderes den Vorgang übernehmen könnte.\n\n**Fiktives Beispiel:** „Donnerstag, 15:30 Uhr: Elterntermin, Raum 2. Sam nimmt teil, Alex übernimmt die Abholung. Rückfragen stehen in der gemeinsamen Notiz. Einladung liegt in der Familienablage.“ Das ist nützlicher als „Schule 15:30“.\n\nPlant Wege und Übergaben bewusst ein. Wenn der Termin um 15:30 Uhr beginnt, ist das nicht unbedingt die Abfahrtszeit. Vereinbart wichtige Zuständigkeiten mit der Person, bevor ihr sie eintragt. Ein Name im Kalender ist noch keine angenommene Aufgabe.",
      },
      {
        id: "vorlage",
        title: "Kostenlose Vorlage für eure Termine",
        body: "Kopiert die Tabelle in eine gemeinsame Notiz oder nutzt die [Termin-Vorlage als CSV](/vorlagen/familienkalender.csv) in einem Tabellenprogramm. Sie ist eine Planungshilfe, keine automatisch synchronisierte Kalenderdatei. Die erste Zeile ist ein erfundenes Beispiel.\n\n| Termin | Wann und wo? | Wer übernimmt? | Was muss vorher passieren? | Quelle |\n| --- | --- | --- | --- | --- |\n| Elterntermin | Donnerstag, 15:30, Raum 2 | Sam; Abholung: Alex | Fragen sammeln, Fahrzeit klären | Einladung in der Ablage |\n| Euer Termin | Datum, Uhrzeit, Ort | Vereinbarter Name | Nächster Schritt und Frist | Aktuelle Nachricht |\n\nTragt eine Rückgabefrist als eigene Aufgabe ein, wenn sie vor dem eigentlichen Termin liegt. Sonst seht ihr zwar den Ausflug am Freitag, überseht aber die Einverständniserklärung am Dienstag. Für den Blick auf eine ganze Woche gibt es die [Wochenplan-Vorlage](/ratgeber/wochenplan-familie).",
      },
      {
        id: "aenderungen",
        title: "Was tun bei Änderungen und Terminkollisionen?",
        body: "Ändert sich etwas, prüft zuerst die Quelle. Ist die neue Uhrzeit bestätigt oder eine Vermutung im Elternchat? Aktualisiert danach den verbindlichen Kalender und sprecht mit den Personen, deren Aufgabe sich verändert. Eine automatische Benachrichtigung beweist nicht, dass die Änderung verstanden wurde.\n\nBei einer Kollision: Welche Termine lassen sich verschieben? Welche Wege können andere übernehmen? Was fällt aus? Klärt zuerst diese Fragen und verteilt danach neu. Zusätzliche Farben lösen keinen tatsächlichen Zeitkonflikt.\n\nBei wiederkehrenden Terminen lohnt ein Blick auf Ausnahmen: Ferien, einzelne Absagen oder ein neuer Treffpunkt. Prüft bei einer Änderung, ob nur dieser Termin oder die ganze Serie betroffen ist. Die genaue Bedienung hängt von eurem Kalender ab.",
      },
      {
        id: "start",
        title: "So startet ihr ohne einen Nachmittag Datenpflege",
        body: "Übertragt zunächst nur die kommenden zwei Wochen und wichtige spätere Termine, die euch schon bekannt sind. Prüft gemeinsam einen Beispieltag: Kann jede beteiligte Person erkennen, was sie übernehmen soll? Ergänzt nur die Angaben, die tatsächlich fehlen.\n\nVereinbart einen kurzen Wochenabgleich. Wenn jemand den Kalender nie öffnet, fragt nach dem Hindernis: fehlender Zugriff, zu viele Einträge oder ein anderer Arbeitsablauf? Erst danach entscheidet ihr, ob ihr das Werkzeug wechseln müsst.\n\nOrdilo kann die Einladungen und Briefe hinter euren Terminen gemeinsam auffindbar machen. Der Ratgeber setzt keine Kalender-Synchronisation durch Ordilo voraus. Termine und wichtige Angaben prüft ihr an der Originalquelle; Absprachen trefft ihr selbst. [Mehr zu den Funktionen](/hilfe).",
      },
    ],
    sources: [
      {
        title: "Ordilo Hilfe",
        url: "/hilfe",
        note: "Quelle für den genannten Produktumfang. Tabellen, Vorlagen und Beispiele sind eigene redaktionelle Organisationsvorschläge von Ordilo.",
      },
    ],
    related: [
      "wochenplan-familie",
      "kita-schulbriefe-organisieren",
      "haushaltsplan-familie",
    ],
  },
  {
    slug: "haushaltsplan-familie",
    title:
      "Haushaltsplan für Familien: Aufgaben fair und vollständig verteilen",
    description:
      "Ein Haushaltsplan mit Aufgaben, Verantwortung und Vertretung. Mit ausfüllbarer Vorlage und einem Beispiel für Wäsche, Einkaufen und Familienpost.",
    topic: "Aufgaben verteilen",
    updated: "2026-10-21",
    answer:
      "Ein Haushaltsplan legt fest, welche wiederkehrenden Aufgaben anstehen, wer sie vollständig übernimmt und wann eine neue Absprache nötig ist. Verteilt nach verfügbarer Zeit, Aufwand und Möglichkeiten statt nur nach der Zahl der Aufgaben. Startet mit wenigen Vorgängen und überprüft nach einer Woche, ob die Verteilung funktioniert.",
    sections: [
      {
        id: "umfang",
        title: "Was gehört in einen Haushaltsplan?",
        body: "Dieser Haushaltsplan betrifft Aufgaben, nicht das Familienbudget. Dazu gehören sichtbare Tätigkeiten wie Wäsche und Einkauf, aber auch die Vorbereitung: Vorräte prüfen, fehlende Sachen bemerken oder Rückfragen klären. Finanzplanung ist eine andere Aufgabe und wird in dieser Vorlage nicht berechnet.\n\nSammelt zunächst gemeinsam, was regelmäßig wiederkehrt. Jede erwachsene Person ergänzt ihre eigenen Aufgaben, damit nicht eine Person die ganze Bestandsaufnahme vorbereitet. Schreibt konkrete Vorgänge auf: „Wäsche bis in den Schrank“ ist verständlicher als „ein bisschen Haushalt“.\n\nTrennt Aufgaben von Terminen. „Kita-Abholung am Dienstag“ gehört auch in die Wochenplanung; „Kita-Post bearbeiten“ ist ein wiederkehrender Vorgang. Verlinkt bei Bedarf auf denselben Informationsort, statt widersprüchliche Notizen zu führen.",
      },
      {
        id: "fair",
        title: "Was bedeutet fair verteilen?",
        body: "Gleich viele Kästchen bedeuten nicht automatisch gleich viel Arbeit. Eine tägliche Aufgabe kann mehr Aufwand verursachen als eine monatliche. Beachtet außerdem Erwerbsarbeit, Wege, Betreuung, verfügbare Kraft und besondere Anforderungen. Eure Einschätzung muss nicht in eine exakte Punktzahl passen.\n\nFragt bei jeder Übernahme: Was gehört dazu? Wann gilt sie als erledigt? Was passiert, wenn es zeitlich nicht klappt? Die zuständige Person darf Hilfe organisieren; sie sollte den Vorgang aber nicht still an die andere Person zurückgeben.\n\nWenn Kinder beteiligt sind, wählt gemeinsam überschaubare, zu ihren Fähigkeiten passende Tätigkeiten. Erwachsene behalten die Verantwortung für Sicherheit, Anleitung und notwendige Kontrolle. Ein Haushaltsplan ist kein Wettbewerb, wer möglichst viele Aufgaben schafft.",
      },
      {
        id: "vorlage",
        title: "Haushaltsplan-Vorlage zum Kopieren",
        body: "Die Beispielnamen sind erfunden. Ersetzt die Zeilen durch eure tatsächlichen Abläufe. [Haushaltsplan als CSV herunterladen](/vorlagen/haushaltsplan.csv) oder direkt aus der Tabelle übernehmen.\n\n| Vorgang | Gehört dazu | Zuständig | Zeitpunkt oder Auslöser | Bei Ausfall |\n| --- | --- | --- | --- | --- |\n| Wäsche | Sortieren, waschen, trocknen, einräumen | Sam | Nach Bedarf; gemeinsam festlegen | Alex ansprechen, bevor es dringend wird |\n| Einkauf | Vorräte prüfen, Liste, Einkauf, wegräumen | Alex | Vor dem vereinbarten Einkaufstag | Liste übergeben und neu absprechen |\n| Familienpost | Lesen, offene Schritte klären, ablegen | Sam | Beim vereinbarten Post-Check | Dringende Fristen direkt melden |\n| Euer Vorgang | Anfang bis Abschluss | Name | Passender Zeitpunkt | Konkrete Absprache |\n\n„Nach Bedarf“ funktioniert nur, wenn klar ist, wer den Bedarf bemerkt. Legt bei schwierigen Vorgängen einen konkreten Auslöser fest. Die Tabelle soll Rückfragen verringern und nicht zur zusätzlichen täglichen Berichtspflicht werden.",
      },
      {
        id: "test",
        title: "Eine Woche testen: drei Fragen statt neuer Regeln",
        body: "Wählt zunächst zwei oder drei Aufgaben aus. Sprecht die Übernahme aus und sorgt dafür, dass die nötigen Informationen zugänglich sind. Wer die Familienpost bearbeitet, braucht zum Beispiel Zugriff auf die aktuellen Schreiben und muss wissen, welche Rückmeldungen offen sind.\n\nPrüft nach einer Woche: War klar, was dazugehört? War die Verteilung machbar? Hat jemand weiterhin unsichtbar erinnert oder nachgearbeitet? Besprecht konkrete Situationen statt pauschaler Urteile über Zuverlässigkeit.\n\nWenn eine Aufgabe regelmäßig liegen bleibt, verändert eine Sache: Umfang verkleinern, Zeitpunkt anpassen oder neu verteilen. Tauscht nicht sofort die gesamte Vorlage aus. Im [Mental-Load-Guide](/ratgeber/mental-load-familie) findet ihr eine ausführlichere Anleitung für vollständige Übergaben.",
      },
      {
        id: "abgrenzen",
        title: "Haushaltsplan, Putzplan und Dokumente zusammenbringen",
        body: "Der Haushaltsplan verteilt Verantwortungsbereiche. Ein [Putzplan](/ratgeber/putzplan-vorlage) beschreibt genauer, welche Reinigungsaufgaben ihr wann erledigen möchtet. Euer [Wochenplan](/ratgeber/wochenplan-familie) zeigt Termine und zeitliche Engpässe. Ihr müsst nicht jede Aufgabe in alle drei Listen schreiben.\n\nOrdilo passt zum Bereich Familienpost: Briefe scannen, wichtige Angaben am Original prüfen und Unterlagen gemeinsam wiederfinden. Es übernimmt nicht eure Einkäufe oder Absprachen. Startet mit einem einzigen Vorgang, bei dem fehlende Informationen bisher die Übergabe erschwert haben. Die [Hilfe](/hilfe) erklärt den Einstieg.",
      },
    ],
    sources: [
      {
        title: "Ordilo Hilfe",
        url: "/hilfe",
        note: "Quelle für den genannten Produktumfang. Tabellen, Vorlagen und Beispiele sind eigene redaktionelle Organisationsvorschläge von Ordilo.",
      },
    ],
    related: [
      "mental-load-familie",
      "putzplan-vorlage",
      "familienkalender-organisieren",
    ],
  },
  {
    slug: "putzplan-vorlage",
    title: "Putzplan-Vorlage: ein einfacher Wochenplan für euren Haushalt",
    description:
      "Eine kostenlose Putzplan-Vorlage mit Beispielwoche, Zuständigkeiten und einer kleinen Version für volle Wochen. Direkt kopieren oder als CSV herunterladen.",
    topic: "Eine einfache Routine",
    updated: "2026-10-21",
    answer:
      "Ein brauchbarer Putzplan nennt konkrete Aufgaben, zuständige Personen und passende Zeitfenster. Die Häufigkeit richtet sich nach eurem Haushalt und Bedarf. Nutzt die Vorlage als Ausgangspunkt, streicht unpassende Aufgaben und vereinbart eine kleinere Version für volle Wochen.",
    sections: [
      {
        id: "start",
        title: "Erst den Bedarf klären, dann die Woche füllen",
        body: "Bevor ihr Aufgaben auf Wochentage verteilt, schaut auf die Räume, die ihr tatsächlich nutzt. Was fällt regelmäßig an? Was stört euch im Alltag? Welche Aufgaben bleiben liegen, weil sich niemand zuständig fühlt? Sammelt diese Punkte gemeinsam.\n\nDie folgende Vorlage ist ein Organisationsbeispiel, keine Hygienevorschrift. Wie häufig eine Tätigkeit nötig ist, hängt unter anderem von Nutzung, Verschmutzung und eurem Haushalt ab. Produkt- und Materialhinweise bleiben bei der Durchführung maßgeblich; dieser Artikel gibt keine Reinigungsrezepte.\n\nBeginnt mit wenigen Aufgaben. Ein Plan, der jeden Abend mehrere zusätzliche Pflichten vorsieht, passt möglicherweise nicht zu euren verfügbaren Zeitfenstern. Legt erst fest, was machbar ist, und verteilt dann.",
      },
      {
        id: "vorlage",
        title: "Kostenlose Wochenvorlage mit Beispiel",
        body: "Die Wochentage und Namen sind frei gewählte Beispiele. Ihr könnt die Tabelle kopieren oder die [Putzplan-Vorlage als CSV herunterladen](/vorlagen/putzplan.csv). Für einen Papierplan lässt sich die Datei in einem Tabellenprogramm ausfüllen und drucken.\n\n| Zeitfenster | Aufgabe | Zuständig | Fertig, wenn … | Verschieben auf |\n| --- | --- | --- | --- | --- |\n| Montag | Benutzte Flächen in der Küche reinigen | Sam | Vereinbarte Flächen sauber und frei | Nach Bedarf absprechen |\n| Mittwoch | Bad nach eurem Bedarf reinigen | Alex | Vorher vereinbarte Bereiche erledigt | Konkretes Ersatzfenster |\n| Samstag | Häufig genutzte Böden reinigen | Sam | Vereinbarte Räume erledigt | Nach Bedarf absprechen |\n| Frei wählen | Eure Aufgabe | Name | Gemeinsamer Maßstab | Ersatzfenster |\n\nDas Beispiel deckt nicht alle notwendigen Arbeiten ab. Ergänzt euren tatsächlichen Bedarf. Statt „Wohnung machen“ nennt ihr die konkreten Bereiche. So müssen nicht beide dasselbe darunter verstehen und erst hinterher feststellen, dass etwas fehlt.",
      },
      {
        id: "haeufigkeit",
        title: "Was gehört täglich, wöchentlich oder bei Bedarf hinein?",
        body: "Trennt das, was unmittelbar anfällt, von planbaren Aufgaben. Ein verschüttetes Getränk wartet nicht auf den Putztag. Wiederkehrende Arbeiten könnt ihr dagegen in passende Zeitfenster legen, sofern der aktuelle Zustand das zulässt.\n\nSchreibt seltenere Aufgaben in eine eigene kurze Liste. Prüft diese beim Wochenabgleich und nehmt nur das in den aktuellen Plan auf, was ansteht. Sonst wird die Wochenübersicht schnell zu einem vollständigen Inventar der Wohnung.\n\nEin Aufgabenwechsel kann helfen, wenn eine Verteilung auf Dauer nicht passt. Er ist aber kein Muss: Auch feste Bereiche können funktionieren, wenn alle den Umfang akzeptieren und Ausfälle ausdrücklich besprochen werden. Verwendet den [Haushaltsplan](/ratgeber/haushaltsplan-familie), um diese Verantwortung zu klären.",
      },
      {
        id: "volle-woche",
        title: "Die kleine Version für volle Wochen",
        body: "Markiert gemeinsam, welche Aufgaben bei euch kurzfristig nötig sind und welche warten können. Diese Entscheidung sollte vor einer stressigen Woche fallen, damit nicht eine Person spontan alles auffängt. Eine kleinere Version bedeutet weniger Aufgaben, nicht denselben Plan in weniger Zeit.\n\nWenn ein Zeitfenster ausfällt, entscheidet bewusst: verschieben, reduzieren oder übergeben. Schiebt eine Aufgabe nicht jeden Tag kommentarlos weiter. Haltet bei einer Übergabe fest, was schon erledigt ist und was noch fehlt.\n\nEin nützlicher Satz ist: „Diese Woche schaffe ich den vereinbarten Umfang nicht. Was muss bleiben und was kann warten?“ Der Plan soll solche Absprachen erleichtern. Er ist kein Maßstab dafür, ob jemand den Haushalt richtig führt.",
      },
      {
        id: "dranbleiben",
        title: "Nach zwei Wochen prüfen: Was lohnt sich zu behalten?",
        body: "Schaut auf die tatsächlich erledigten Aufgaben. War das Zeitfenster realistisch? War der Umfang eindeutig? Habt ihr unnötige Einträge gepflegt? Streicht Felder, die euch nichts bringen, und passt die Verteilung an.\n\nFür den gesamten Alltag ergänzt der [Familien-Wochenplan](/ratgeber/wochenplan-familie) Termine und Vorbereitung. Ordilo ist für die Dokumente dahinter gedacht, etwa Briefe und Unterlagen. Für euren Putzplan genügt auch eine gemeinsame Notiz oder ein Blatt Papier. Verwendet das Werkzeug, das ihr zuverlässig nutzt.",
      },
    ],
    sources: [
      {
        title: "Ordilo Hilfe",
        url: "/hilfe",
        note: "Quelle für den genannten Produktumfang. Tabellen, Vorlagen und Beispiele sind eigene redaktionelle Organisationsvorschläge von Ordilo.",
      },
    ],
    related: [
      "haushaltsplan-familie",
      "wochenplan-familie",
      "familienalltag-organisieren-tipps",
    ],
  },
  {
    slug: "ordnerstruktur-private-dokumente",
    title: "Ordnerstruktur für private Dokumente: Vorlage und Beispiele",
    description:
      "Eine einfache Ordnerstruktur für private Dokumente, mit Dateinamen, Beispielablage und Suchtest. Als offene Vorlage ohne Anmeldung.",
    topic: "Dokumente wiederfinden",
    updated: "2026-10-21",
    answer:
      "Eine private Ordnerstruktur braucht wenige verständliche Bereiche, eindeutige Dateinamen und eine Regel für aktuelle Fassungen. Trennt offene Aufgaben vom Archiv. Testet die Struktur mit echten Suchfragen, bevor ihr den gesamten Bestand umsortiert.",
    sections: [
      {
        id: "vorlage",
        title: "Eine Ordnerstruktur, mit der ihr starten könnt",
        body: "Wählt Kategorien nach den Fragen, mit denen ihr später sucht. „Wo ist der Stromvertrag?“ führt eher zu Wohnen als zu einem Ordner namens Wichtig. Die folgende Struktur ist ein Vorschlag; streicht Bereiche, die ihr nicht braucht, und ergänzt nur tatsächlich fehlende Themen.\n\n| Bereich | Beispiele | Sinnvolle Ergänzung |\n| --- | --- | --- |\n| Wohnen | Mietunterlagen, Energie, Internet | Anbieter oder Wohnung |\n| Kinder | Kita, Schule, Vereine | Kind und Einrichtung |\n| Versicherungen | Verträge und Schreiben | Versicherungsart |\n| Arbeit | Arbeitsbezogene Unterlagen | Person und Arbeitgeber |\n| Anschaffungen | Rechnungen, Anleitungen | Gegenstand und Kaufdatum |\n| Persönliches | Individuelle Bescheinigungen | Person und Anlass |\n\nDie Tabelle ist eine Suchhilfe und keine Empfehlung, sämtliche Unterlagen mit allen zu teilen. Legt für persönliche Dokumente fest, wer Zugriff benötigt. Hier findet ihr die [Ordner-Vorlage als CSV](/vorlagen/ordnerstruktur.csv).",
      },
      {
        id: "namen",
        title: "Dateinamen: Datum, Absender und Anlass",
        body: "Ein Dateiname sollte sich auch außerhalb der ursprünglichen App verstehen lassen. Ein mögliches Muster ist **JJJJ-MM-TT_Absender_Anlass**. Nutzt das Datum des Dokuments oder ein anderes eindeutig vereinbartes Datum. Wechselt nicht unbemerkt zwischen Scan- und Dokumentdatum.\n\nFiktive Beispiele: **2026-10-21_Stromanbieter_Vertragsbestaetigung.pdf** oder **2026-10-21_Grundschule_Elternabend.pdf**. Bei mehreren Kindern kann eine zusätzliche Zuordnung sinnvoll sein. Vermeidet unnötig sensible Angaben in Dateinamen, die andere Personen schon in einer Dateiliste sehen könnten.\n\nNicht jede Ablage arbeitet mit Ordnern. In einer App mit Suche oder Kategorien übertragt ihr dieselbe Logik auf Titel und Zuordnung, soweit die Funktionen das unterstützen. Dieser Vorschlag setzt keine automatisch erzeugte Ordnerstruktur in Ordilo voraus.",
      },
      {
        id: "versionen",
        title: "Aktuelle Fassung oder alte Kopie?",
        body: "Wenn ein Schreiben geändert wird, darf die alte Kopie nicht unbemerkt als aktueller Stand weiterleben. Benennt den Unterschied eindeutig, zum Beispiel mit dem jeweiligen Dokumentdatum und dem Zusatz „ersetzt“. Bewahrt den Zusammenhang so auf, dass ihr die Änderung später nachvollziehen könnt.\n\nLegt eine Datei nicht vorsorglich in mehrere aktive Ordner. Kopien entwickeln sich schnell auseinander. Nutzt, sofern eure Ablage das unterstützt, einen Verweis auf denselben Stand. Wenn Kopien nötig sind, entscheidet, welche Fassung verbindlich gepflegt wird.\n\nOffene Arbeit gehört auf eine Aufgabenliste: „Rückmeldung abgeben“ oder „Betrag prüfen“. Der Ordner allein sagt nicht, ob das schon passiert ist. Für den Eingang neuer Post hilft der [Papierkram-Ablauf](/ratgeber/papierkram-organisieren-familie).",
      },
      {
        id: "umzug",
        title: "So sortiert ihr um, ohne euch im Archiv zu verlieren",
        body: "Beginnt mit zehn Unterlagen aus unterschiedlichen Bereichen. Ordnet sie nach dem Vorschlag ein und benennt sie verständlich. Führt eine kurze Liste mit Grenzfällen: Wo würdet ihr eine Rechnung für den Schulausflug erwarten? Einigt euch auf eine Regel, statt für jede Ausnahme einen neuen Ordner anzulegen.\n\nÜbertragt danach zuerst die Unterlagen, die ihr regelmäßig braucht. Alte Bestände dürfen vorübergehend als klar benanntes Altarchiv bestehen bleiben. Prüft bei einer technischen Umstellung, ob Dateien vollständig übernommen wurden und sich öffnen lassen, bevor ihr die ursprüngliche Ablage aufgebt.\n\nDiese Anleitung bewertet keine Aufbewahrungsfristen und empfiehlt nicht, Originale nach dem Scannen zu vernichten. Entscheidet das gesondert anhand der jeweiligen Dokumentart. Für die technische Vorbereitung gibt es die [zehn Digitalisierungstipps](/ratgeber/private-dokumente-digitalisieren).",
      },
      {
        id: "suchtest",
        title: "Der Suchtest: Versteht jemand anderes eure Ablage?",
        body: "Stellt einer berechtigten Person drei konkrete Fragen: Wo ist die Einladung zum Elternabend? Welche Vertragsbestätigung gehört zum aktuellen Anbieter? Welche Unterlage wartet noch auf eine Antwort? Beobachtet, welche Begriffe sie benutzt und wo sie zuerst sucht.\n\nWenn der Weg jedes Mal erklärt werden muss, passt die Struktur an. Vielleicht ist ein Kategoriename zu abstrakt oder ein Dokument nach Absender statt nach Anlass eingeordnet. Verbessert den betreffenden Bereich; ihr müsst nicht das komplette System neu erfinden.\n\nIn Ordilo könnt ihr Dokumente scannen, gemeinsam ablegen und Fragen mit Fundstelle stellen. Prüft wichtige Angaben an der Originalquelle und testet auch dort, ob die berechtigte andere Person den Vorgang findet. Eine gute Ablage ist dann nützlich, wenn ihr sie im Alltag ohne lange Erklärung verwenden könnt. [Ordilo kennenlernen](/hilfe).",
      },
    ],
    sources: [
      {
        title: "Ordilo Hilfe",
        url: "/hilfe",
        note: "Quelle für den genannten Produktumfang. Tabellen, Vorlagen und Beispiele sind eigene redaktionelle Organisationsvorschläge von Ordilo.",
      },
    ],
    related: [
      "papierkram-organisieren-familie",
      "private-dokumente-digitalisieren",
      "familienorganisation-was-tun-wenn",
      "unterlagen-aufbewahren-wie-lange",
    ],
  },
];
