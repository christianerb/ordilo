import type { Guide } from "./guides";

const careSource =
  "https://www.bpb.de/kurz-knapp/zahlen-und-fakten/sozialbericht-2024/553159/wer-macht-was-die-verteilung-der-tatsaechlichen-und-mentalen-sorgearbeit/";

export const practicalGuides: Guide[] = [
  {
    slug: "mental-load-familie",
    title: "Mental Load in der Familie: verstehen und Verantwortung teilen",
    description:
      "Was Mental Load im Familienalltag bedeutet: ein ausführlicher Guide mit drei Ansätzen, einer Aufgaben-Vorlage und einem gemeinsamen Wochenexperiment.",
    topic: "Die unsichtbare Arbeit",
    updated: "2026-10-21",
    answer:
      "Mental Load meint die unsichtbare Denk- und Organisationsarbeit hinter dem Alltag: bemerken, was ansteht, Informationen sammeln, entscheiden und daran denken, ob etwas erledigt wurde. Wer nur die letzte Handlung übernimmt, übernimmt nicht automatisch diese Verantwortung. Drei Ansatzpunkte sind: Arbeit sichtbar machen, vollständige Vorgänge verteilen und Aufgaben gemeinsam vereinfachen.",
    sections: [
      {
        id: "bedeutung",
        title: "Was ist Mental Load – und was ist daran unsichtbar?",
        body: `Ein Kind zum Sport bringen ist sichtbar. Zu wissen, wann der Kurs beginnt, ob die Schuhe noch passen und wer bei einer Änderung informiert werden muss, ist weniger sichtbar. Auch diese Vorbereitung kostet Aufmerksamkeit. Der Begriff Mental Load hilft dabei, über diese Arbeit zu sprechen.

Der [Sozialbericht 2024 der Bundeszentrale für politische Bildung](${careSource}) unterscheidet tatsächliche und mentale Sorgearbeit und beschreibt ihre ungleiche Verteilung. Die Erklärung des Begriffs stützt sich darauf. Die folgenden Vorlagen und Gesprächsvorschläge sind unsere eigenen redaktionellen Hilfen, keine getestete Behandlungsmethode.

Für das Gespräch zu Hause ist nicht entscheidend, wer am meisten einzelne Handgriffe aufzählen kann. Hilfreicher ist die Frage: Wer bemerkt den Bedarf, trifft die Entscheidung und bleibt verantwortlich, wenn etwas anders läuft? Genau diese Schritte fehlen oft auf einer gewöhnlichen Aufgabenliste.`,
      },
      {
        id: "beispiel",
        title: "Ein Kita-Brief zeigt die Arbeit hinter der Aufgabe",
        body: `Das folgende Beispiel ist erfunden. Ein Ausflugsbrief liegt in der Postmappe. Bis Donnerstag soll eine Erklärung abgegeben werden. Die Veranstaltung ist erst in der folgenden Woche.

| Sichtbare Handlung | Arbeit, die davor oder danach liegt |
| --- | --- |
| Brief aus der Mappe holen | Bemerken, dass neue Post da ist |
| Formular unterschreiben | Lesen, Rückfragen klären und Frist erkennen |
| Erklärung abgeben | Zuständigkeit und Übergabe vereinbaren |
| Rucksack packen | Packliste finden und fehlende Dinge rechtzeitig bemerken |
| Kind zum Treffpunkt bringen | Uhrzeit, Weg und Änderungen im Blick behalten |

Wenn eine Person nur auf Zuruf unterschreibt, bleibt der übrige Vorgang möglicherweise bei der anderen. Das ist nicht automatisch böse Absicht. Es ist zunächst eine unklare Verteilung, die ihr konkret besprechen könnt. Fragt nicht nur „Wer unterschreibt?“, sondern „Wer übernimmt diesen Ausflug organisatorisch?“`,
      },
      {
        id: "sichtbar",
        title: "Ansatz 1: Erst sichtbar machen, dann verteilen",
        body: `Wählt einen ruhigen Zeitpunkt und einen überschaubaren Bereich. Jede erwachsene Person schreibt zunächst für sich auf, woran sie dort denkt. Ein Bereich kann die Kita-Post, die nächste Woche oder ein wiederkehrender Termin sein. So muss nicht eine Person allein die komplette Inventur vorbereiten.

Geht die Einträge anschließend gemeinsam durch. Ergänzt die unsichtbaren Schritte: Informationen beschaffen, entscheiden, erinnern, nachfragen und abschließen. Beschreibt Vorgänge so konkret, dass die andere Person weiß, was dazugehört.

Vermeidet beim ersten Durchgang eine Diskussion darüber, ob etwas „doch nur kurz“ dauert. Erst soll die Arbeit erkennbar werden. Danach könnt ihr entscheiden, welche Aufgaben nötig sind und wie ihr sie verteilt. Die Liste ist eine Momentaufnahme, kein Beweisstück für den nächsten Streit.

**Gesprächseinstieg:** „Ich möchte, dass wir beide sehen, was hinter der Kita-Post steckt. Lass uns für einen Brief die einzelnen Schritte aufschreiben.“`,
      },
      {
        id: "verantwortung",
        title: "Ansatz 2: Einen Vorgang vollständig übernehmen",
        body: `Vereinbart für einen konkreten Vorgang eine verantwortliche Person. Zur Übernahme gehören der nächste Schritt, offene Rückfragen und das Wissen, wann der Vorgang abgeschlossen ist. Haltet auch fest, wo die Informationen liegen und wann die andere Person eingebunden werden muss.

Verantwortung teilen heißt dabei nicht, dass eine Person alles allein können oder nie um Hilfe bitten muss. Sie kann Hilfe vereinbaren. Der Unterschied liegt darin, wer die Aufgabe im Blick behält und die nötigen Schritte anstößt.

Wenn bisher nur eine Person einen Ablauf kennt, braucht es zunächst eine Übergabe. Nehmt dafür einen echten, überschaubaren Vorgang. Klärt gemeinsam Zugriff, Ansprechpartner und Fristen. Danach sollte die übernehmende Person die Informationen selbst finden können, ohne für jeden Schritt erneut nachzufragen.

**Beispiel:** „Du übernimmst diesen Kita-Ausflug bis zur Rückgabe des Formulars. Der Brief liegt im gemeinsamen Ordner. Wenn Angaben fehlen, fragst du bei der Einrichtung nach. Falls du bis Mittwoch nicht weiterkommst, sprechen wir darüber.“`,
      },
      {
        id: "vereinfachen",
        title: "Ansatz 3: Gemeinsam entscheiden, was kleiner werden darf",
        body: `Eine fairer verteilte, zu große Aufgabenmenge bleibt zu groß. Prüft deshalb auch den Umfang: Muss diese Aufgabe erledigt werden? Muss sie so häufig stattfinden? Welcher Standard reicht für euch? Was kann warten oder ganz wegfallen?

Unterscheidet dabei zwischen verhandelbaren Vorlieben und festen Anforderungen. Eine Formularfrist könnt ihr nicht einfach ignorieren. Ob zusätzlich noch eine aufwendige Wochenübersicht gestaltet wird, könnt ihr dagegen selbst entscheiden.

Einigt euch auf eine praktikable Mindestversion. Zum Beispiel: Der Wochenplan enthält Termine, Vorbereitung und Zuständigkeit. Er braucht keine Farblegende mit zwölf Kategorien. Wenn die einfache Version funktioniert, ist sie ausreichend.

Auch verfügbare Zeit und Unterstützung sind unterschiedlich. Ein Modell mit zwei Erwachsenen lässt sich nicht unverändert auf einen Haushalt mit einer allein verantwortlichen Person übertragen. Dort kann die Frage lauten: Was lässt sich reduzieren und welche konkrete Hilfe ist tatsächlich verfügbar?`,
      },
      {
        id: "vorlage",
        title: "Vorlage: Was heißt bei uns wirklich „übernommen“?",
        body: `Kopiert die Tabelle in eine gemeinsame Notiz. Füllt zuerst nur eine Zeile aus. Die Beispielzeile ist erfunden.

| Vorgang | Nächster Schritt | Verantwortlich | Informationen | Fertig, wenn … |
| --- | --- | --- | --- | --- |
| Kita-Ausflug | Rückmeldung prüfen und abgeben | Sam | Vollständiger Brief in der Familienablage | Erklärung abgegeben und Vorbereitung geklärt |
| Euer Vorgang | Was passiert als Nächstes? | Eine Person | Wo ist die aktuelle Quelle? | Woran erkennen wir den Abschluss? |

Besprecht zusätzlich, was bei Krankheit, Überlastung oder fehlenden Informationen passiert. Eine Rückmeldung wie „Ich schaffe es nicht, wir brauchen eine neue Absprache“ ist besser als eine stille Rückgabe der Verantwortung.

Eine lange Tabelle ist kein Selbstzweck. Wenn ihr jeden Eintrag ständig erklären müsst, vereinfacht die Begriffe. Ziel ist, dass eine berechtigte Person den Vorgang nachvollziehen und weiterführen kann.`,
      },
      {
        id: "wochenexperiment",
        title: "Ein Wochenexperiment statt einer Komplettsanierung",
        body: `**Vor dem Start:** Wählt einen Vorgang, den ihr anders verteilen möchtet. Notiert die verantwortliche Person, die nötigen Informationen und den nächsten Schritt. Prüft, ob diese Person wirklich Zugriff auf den Brief oder die Liste hat.

**Während der Woche:** Die zuständige Person hält den Vorgang im Blick. Wenn eine Übergabe nötig wird, sagt sie konkret, was erledigt ist und was fehlt. Die andere Person übernimmt nicht automatisch im Hintergrund jeden offenen Schritt.

**Am Ende der Woche:** Besprecht drei Fragen: Waren die Informationen auffindbar? War die Zuständigkeit klar? War der Umfang realistisch? Entscheidet dann, was bleibt und was ihr verändert. Ein nicht gelungener Versuch zeigt eine Lücke im Ablauf, nicht automatisch fehlenden guten Willen.

Ihr müsst nicht sofort den ganzen Haushalt neu verteilen. Ein nachvollziehbarer Test ist oft leichter zu besprechen als ein abstraktes Versprechen, künftig „mehr zu helfen“. Für Termine und Vorbereitungen könnt ihr unsere [Wochenplan-Vorlage](/ratgeber/wochenplan-familie) verwenden.`,
      },
      {
        id: "ordilo",
        title: "Wo Ordilo helfen kann – und wo ihr die Absprache braucht",
        body: `Ordilo kann den Dokumententeil eines Vorgangs unterstützen: Brief scannen, erkannte Angaben prüfen, gemeinsam ablegen und später eine Frage mit Fundstelle beantworten lassen. So kann die Information dort liegen, wo die berechtigten Familienmitglieder sie nachsehen können.

Eine angelegte Aufgabe führt aber nicht von selbst eine Unterschrift, Zahlung oder Rückmeldung aus. Und eine gemeinsame Ablage entscheidet nicht, wer zuständig ist. Vereinbart diese Verantwortung ausdrücklich und kontrolliert wichtige Termine oder Beträge am Original.

Beginnt mit einem unkritischen Beispielbrief. Prüft zusammen, ob die andere Person die richtige Information findet. Scannen und Fragen sind kostenlos; das Live-Gespräch ist optional mit Plus verfügbar. [Einstieg, Kosten und Datenschutz](/hilfe) erklären den Rahmen.

Dieser Guide richtet sich auf Alltagsorganisation. Er verspricht keine bestimmte Entlastung und ersetzt keine persönliche Beratung. Wenn ihr organisatorisch feststeckt, könnt ihr auch Unterstützung außerhalb der App suchen; noch ein Tool ist nicht für jede Situation die passende Antwort.`,
      },
    ],
    sources: [
      {
        title: "bpb: Tatsächliche und mentale Sorgearbeit, Sozialbericht 2024",
        url: careSource,
        note: "Quelle zur Einordnung von Mental Load. Vorlagen, Beispielsituation und Wochenexperiment sind eigene redaktionelle Vorschläge.",
      },
      {
        title: "Ordilo Hilfe",
        url: "/hilfe",
        note: "Produktumfang und Grenzen der App.",
      },
    ],
    related: [
      "familienalltag-organisieren-tipps",
      "wochenplan-familie",
      "familienorganisation-was-tun-wenn",
    ],
  },
  {
    slug: "familienorganisation-was-tun-wenn",
    title:
      "Familienorganisation: Was tun, wenn Brief, Frist oder Absprache fehlen?",
    description:
      "Sechs typische Alltagssituationen mit einem konkreten nächsten Schritt: fehlender Brief, widersprüchliche Termine, verpasste Rückmeldung und unklare Zuständigkeit.",
    topic: "Was mache ich, wenn …?",
    updated: "2026-10-21",
    answer:
      "Wenn eine Information fehlt oder eine Absprache nicht funktioniert, kläre zuerst den aktuellen Stand an der ursprünglichen Quelle. Lege danach fest, wer den nächsten Schritt übernimmt und wo die bestätigte Information für alle Berechtigten liegt. Diese sechs Beispiele helfen, eine konkrete Situation zu bearbeiten, ohne sofort das ganze Familiensystem umzubauen.",
    sections: [
      {
        id: "brief-fehlt",
        title: "1. Was mache ich, wenn der Kita-Brief verschwunden ist?",
        body: `Prüfe die vereinbarten Eingangskanäle: Postmappe, E-Mail oder die App der Einrichtung. Wenn der Brief nicht auffindbar ist, bitte die Einrichtung um die aktuelle Fassung. Ein erinnerter Satz aus einem Chat reicht nicht, um Datum, Kosten oder Rückgabefrist sicher zu rekonstruieren.

Sobald der Brief vorliegt, legt ihn vollständig am gemeinsamen Ort ab. Notiert die offene Aufgabe separat. Vereinbart für die nächste Post einen festen Eingang, statt nur diesen einen Brief an eine weitere Person zu schicken.

**Nächster Schritt:** Eine Person beschafft die aktuelle Fassung und hält fest, was bis wann zu tun ist. Die [Anleitung für Kita- und Schulbriefe](/ratgeber/kita-schulbriefe-organisieren) zeigt den Ablauf.`,
      },
      {
        id: "zwei-termine",
        title:
          "2. Was mache ich, wenn zwei unterschiedliche Termine im Umlauf sind?",
        body: `Vergleicht Absender und Datum der Nachrichten. Sucht nach einer ausdrücklich bestätigten Änderung. Die neuere Chatnachricht ist nicht automatisch die verbindliche Quelle. Wenn der Widerspruch bleibt, fragt beim Veranstalter oder bei der Einrichtung nach.

Übernehmt erst danach den bestätigten Termin in euren Plan. Passt auch Abholung, Vorbereitung und alte Erinnerungen an. Informiert die betroffenen Personen, statt vorauszusetzen, dass jede Kalenderänderung bemerkt wird.

**Nächster Schritt:** Eine Person klärt den Widerspruch. Alle benutzen anschließend dieselbe bestätigte Fassung. Hebt die alte Nachricht bei Bedarf als alten Stand auf, nicht als zweite aktuelle Wahrheit.`,
      },
      {
        id: "frist-verpasst",
        title: "3. Was mache ich, wenn eine Rückgabefrist schon vorbei ist?",
        body: `Lies zuerst nach, welche Rückmeldung verlangt wurde und an wen sie gehen sollte. Nimm dann Kontakt mit der zuständigen Stelle auf und frage, ob und wie eine verspätete Rückgabe möglich ist. Das lässt sich nicht pauschal zusagen.

Eine Erinnerung für die nächste Woche löst die verpasste Rückmeldung nicht. Bearbeitet zuerst den offenen Vorgang. Danach könnt ihr prüfen, warum die Frist übersehen wurde: War sie unklar, fehlte die Zuständigkeit oder war der Brief nicht zugänglich?

**Nächster Schritt:** Nachfragen und die erhaltene Antwort festhalten. Bei rechtlichen oder finanziellen Folgen braucht ihr passende fachliche Auskunft. Dieser Artikel bewertet keine Rechtsfolgen oder gesetzlichen Fristen.`,
      },
      {
        id: "niemand",
        title:
          "4. Was mache ich, wenn beide dachten, die andere Person kümmert sich?",
        body: `Klärt den nächsten noch möglichen Schritt und benennt eine zuständige Person. Für den aktuellen Vorgang ist das hilfreicher als zuerst zu rekonstruieren, wer welchen Satz wie gemeint hat.

Besprecht später, welche Formulierung offenblieb. „Kannst du mal schauen?“ kann eine Bitte um Mitdenken oder um vollständige Übernahme sein. Formuliert künftig den Vorgang und den Abschluss: „Du übernimmst die Rückmeldung, bis sie abgegeben ist.“

**Nächster Schritt:** Eine konkrete Übernahme vereinbaren. Für die Vorbereitung hinter solchen Aufgaben findet ihr im [Mental-Load-Guide](/ratgeber/mental-load-familie) eine kurze Übergabe-Vorlage.`,
      },
      {
        id: "ki-unsicher",
        title:
          "5. Was mache ich, wenn die Antwort der App nicht zum Brief passt?",
        body: `Öffne die angegebene Fundstelle. Prüfe, ob sie zum richtigen Kind, Zeitraum und Vorgang gehört. Kontrolliere außerdem den Scan: Sind alle Seiten dabei und kleine Angaben lesbar? Eine plausible Antwort kann trotzdem falsch sein.

Übernimm den strittigen Betrag oder Termin nicht ungeprüft. Nutze die bestätigte Originalquelle und kläre Widersprüche mit dem Absender. Wenn das Dokument vollständig ist und die Antwort weiterhin falsch erscheint, kannst du den Support kontaktieren.

**Nächster Schritt:** Fundstelle und Original vergleichen. Beschreibe dem Support den Fehler, ohne ungefragt private Unterlagen oder Passwörter mitzuschicken. [Ordilo Hilfe](/hilfe) erklärt den Kontakt.`,
      },
      {
        id: "plan-klappt-nicht",
        title:
          "6. Was mache ich, wenn unser neuer Plan nach drei Tagen schon nicht mehr passt?",
        body: `Prüft, was sich tatsächlich verändert hat. Ein Plan kann wegen eines neuen Termins veraltet sein, zu viele Aufgaben enthalten oder an unklarem Zugriff scheitern. Diese Probleme brauchen unterschiedliche Lösungen.

Aktualisiert den bestehenden Plan und streicht, was gerade nicht machbar ist. Verteilt die verbleibenden Vorgänge neu. Wenn niemand auf den Plan schaut, klärt zuerst, wo und wann er gebraucht wird, bevor ihr noch eine App oder Liste ergänzt.

**Nächster Schritt:** Eine konkrete Hürde auswählen und beheben. Unsere [Wochenplan-Vorlage](/ratgeber/wochenplan-familie) trennt Termine, Vorbereitung und Zuständigkeit. Für die Dokumente dahinter kann Ordilo die gemeinsame Ablage ergänzen; Absprachen und Handlungen bleiben bei euch.`,
      },
    ],
    sources: [
      {
        title: "Ordilo: Hilfe bei Einstieg und falschen Antworten",
        url: "/hilfe",
        note: "Quelle für die beschriebenen Produktabläufe. Die Alltagssituationen sind redaktionelle Beispiele, keine Regeln einer bestimmten Einrichtung oder Rechtsberatung.",
      },
    ],
    related: [
      "mental-load-familie",
      "kita-schulbriefe-organisieren",
      "wochenplan-familie",
    ],
  },
];
