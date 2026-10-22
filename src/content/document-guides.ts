import type { Guide } from "./guides";

/** Section URL on gesetze-im-internet.de, e.g. law("ao_1977", "355"). */
const law = (code: string, section: string) =>
  `https://www.gesetze-im-internet.de/${code}/__${section}.html`;

const notAdvice =
  "Dieser Ratgeber erklärt allgemeine gesetzliche Regeln. Er ist keine Rechts- oder Steuerberatung. Maßgeblich ist immer die Rechtsbehelfsbelehrung in deinem eigenen Brief.";

const notAdviceGeneral =
  "Dieser Ratgeber erklärt allgemeine gesetzliche Regeln. Er ist keine Rechts- oder Steuerberatung. Maßgeblich sind dein eigener Vertrag und das Schreiben selbst. Enthält ein Brief eine Rechtsbehelfsbelehrung, gilt die dort genannte Frist.";

export const documentGuides: Guide[] = [
  {
    slug: "steuerbescheid-pruefen",
    title: "Steuerbescheid prüfen: verstehen, Frist und Einspruch",
    description:
      "Steuerbescheid verstehen und prüfen: was drinsteht, wann die Einspruchsfrist von einem Monat beginnt und was du als Nächstes tust. Mit Beispiel und Checkliste.",
    topic: "Brief verstehen",
    updated: "2026-10-22",
    answer:
      "Vergleiche den Steuerbescheid mit deiner Steuererklärung: Lies zuerst die Erläuterungen, denn dort steht, wo das Finanzamt abgewichen ist. Gegen einen Steuerbescheid kannst du innerhalb eines Monats nach Bekanntgabe Einspruch einlegen (§ 355 AO). Ein Brief per Post gilt seit 2025 in der Regel am vierten Tag nach dem Absenden als bekannt gegeben (§ 122 AO).",
    sections: [
      {
        id: "was-steht-drin",
        title: "Was steht in einem Steuerbescheid?",
        body: `Ein Einkommensteuerbescheid hat meist mehrere Seiten. Für den ersten Blick sind vier Stellen wichtig:

- **Datum des Bescheids:** Danach richtet sich, wann die Frist beginnt.
- **Festsetzung:** Wie viel Steuer festgesetzt wurde.
- **Abrechnung:** Ob du etwas zurückbekommst oder nachzahlen musst – und bis wann.
- **Erläuterungen:** Hier schreibt das Finanzamt, wo es von deiner Erklärung abgewichen ist.

Am Ende steht die **Rechtsbehelfsbelehrung**. Sie sagt dir, welcher Rechtsbehelf möglich ist, bei welcher Stelle und in welcher Frist. Manche Bescheide enthalten außerdem Hinweise wie „vorläufig“ oder „unter dem Vorbehalt der Nachprüfung“. Was das für deinen Fall bedeutet, steht in den Erläuterungen oder kann beim Finanzamt erfragt werden.`,
      },
      {
        id: "worauf-achten",
        title: "Worauf solltest du beim Prüfen achten?",
        body: `Lege deine Steuererklärung neben den Bescheid. Prüfe vor allem die Punkte, bei denen du mit Belegen gearbeitet hast.

- Stimmen Name, Steuernummer und Steuerjahr?
- Stehen die Beträge aus der Erklärung auch im Bescheid?
- Hat das Finanzamt Ausgaben gestrichen oder gekürzt? Die Erläuterungen sagen, warum.
- Passen Kinder, Familienstand und gemeinsame Veranlagung?
- Bis wann musst du eine Nachzahlung leisten?

Nicht jede Abweichung ist ein Fehler. Manchmal fehlt nur ein Nachweis. Dann kann eine kurze Rückfrage beim Finanzamt schon helfen. Wichtig ist: Eine Rückfrage per Telefon hält die Einspruchsfrist nicht an.`,
      },
      {
        id: "frist",
        title: "Welche Frist gilt für den Einspruch?",
        body: `Der Einspruch muss **innerhalb eines Monats nach Bekanntgabe** eingelegt werden ([§ 355 Abs. 1 AO](${law("ao_1977", "355")})). Die Bekanntgabe ist nicht unbedingt der Tag, an dem der Brief im Kasten liegt.

Ein Bescheid, der im Inland per Post kommt, gilt nach [§ 122 Abs. 2 Nr. 1 AO](${law("ao_1977", "122")}) am **vierten Tag nach dem Absenden** als bekannt gegeben. Diese Vier-Tage-Regel gilt für Bescheide, die seit 2025 zur Post gegeben wurden; vorher waren es drei Tage. Kommt der Brief nachweislich später an, zählt der spätere Tag.

**Erfundenes Beispiel:** Das Finanzamt schickt den Bescheid am Montag, 2. November 2026 ab. Er gilt am Freitag, 6. November als bekannt gegeben. Die Einspruchsfrist endet dann am Sonntag, 6. Dezember. Weil das ein Sonntag ist, verschiebt sich das Ende auf Montag, 7. Dezember ([§ 108 Abs. 3 AO](${law("ao_1977", "108")})). Rechne in deinem Fall lieber mit einem früheren Termin und lies die Rechtsbehelfsbelehrung.`,
      },
      {
        id: "naechster-schritt",
        title: "Was tust du als Nächstes?",
        body: `**Alles stimmt:** Lege den Bescheid zu der Steuererklärung des Jahres. Trage eine eventuelle Nachzahlung mit Termin ein.

**Etwas ist unklar:** Frage beim Finanzamt nach und notiere dir, mit wem du wann gesprochen hast. Behalte die Frist trotzdem im Blick.

**Etwas ist falsch:** Lege rechtzeitig Einspruch ein. Das geht schriftlich oder elektronisch, zum Beispiel über Mein ELSTER. Nenne den Bescheid mit Datum und Steuernummer und schreib, was du ändern lassen möchtest. Belege kannst du nachreichen. Das Einspruchsverfahren beim Finanzamt kostet nach Angaben des Bundesfinanzministeriums keine Gebühr.

Bei größeren Beträgen oder schwierigen Fragen kann eine Steuerberatung oder ein Lohnsteuerhilfeverein helfen. ${notAdvice}`,
      },
      {
        id: "checkliste",
        title: "Checkliste für deinen Steuerbescheid",
        body: `1. Datum des Bescheids notieren.
2. Bekanntgabetag ausrechnen: vier Tage nach dem Absenden.
3. Fristende eintragen – mit ein paar Tagen Puffer.
4. Erläuterungen lesen: Wo ist das Finanzamt abgewichen?
5. Beträge mit deiner Erklärung vergleichen.
6. Nachzahlung oder Erstattung mit Termin notieren.
7. Bescheid und Erklärung zusammen ablegen.

Wie lange du Steuerunterlagen danach behältst, erklärt unser Ratgeber [Unterlagen aufbewahren](/ratgeber/unterlagen-aufbewahren-wie-lange).`,
      },
      {
        id: "ordilo",
        title: "So hilft eine Dokumenten-App",
        body: `Mit Ordilo kannst du den Bescheid scannen und danach fragen: „Bis wann muss ich nachzahlen?“ oder „Was hat das Finanzamt bei den Werbungskosten geändert?“ Ordilo antwortet aus dem gespeicherten Brief und zeigt die Fundstelle. Öffne sie und prüfe Zahlen und Fristen im Original.

Ordilo kann dich an eine Frist erinnern, die du selbst einträgst oder bestätigst. Ordilo legt keinen Einspruch ein und berät dich nicht steuerlich. Scannen, Fragen und Erinnerungen sind kostenlos; mehr dazu bei den [Preisen](/#preise) und im [Datenschutz](/datenschutz).`,
      },
    ],
    sources: [
      {
        title: "§ 355 AO: Einspruchsfrist",
        url: law("ao_1977", "355"),
        note: "Gesetzestext: Einspruch innerhalb eines Monats nach Bekanntgabe.",
      },
      {
        title: "§ 122 AO: Bekanntgabe des Verwaltungsakts",
        url: law("ao_1977", "122"),
        note: "Gesetzestext: Bekanntgabe am vierten Tag nach Aufgabe zur Post (Fassung seit 2025).",
      },
      {
        title: "§ 108 AO: Fristen und Termine",
        url: law("ao_1977", "108"),
        note: "Gesetzestext: Fristende am Wochenende oder Feiertag verschiebt sich auf den nächsten Werktag.",
      },
      {
        title: "BMF: Amtliches AO-Handbuch zu § 355 AO",
        url: "https://ao.bundesfinanzministerium.de/ao/2024/Abgabenordnung/Siebenter-Teil/Zweiter-Abschnitt/Paragraf-355/inhalt.html",
        note: "Primärquelle des Bundesfinanzministeriums. Rechenbeispiel und Checkliste sind eigene, erfundene Beispiele.",
      },
    ],
    related: [
      "unterlagen-aufbewahren-wie-lange",
      "kindergeld-elterngeld-bescheid-verstehen",
      "ordnerstruktur-private-dokumente",
    ],
  },
  {
    slug: "nebenkostenabrechnung-pruefen",
    title: "Nebenkostenabrechnung prüfen: Fristen und Checkliste",
    description:
      "Nebenkostenabrechnung prüfen: Welche Fristen für Vermieter und Mieter gelten, welche Angaben drinstehen müssen und wie du Einwände formulierst. Mit Checkliste.",
    topic: "Brief verstehen",
    updated: "2026-10-22",
    answer:
      "Prüfe bei der Nebenkostenabrechnung zuerst die Fristen, dann die Rechnung. Der Vermieter muss spätestens zwölf Monate nach Ende des Abrechnungszeitraums abrechnen. Du hast nach Erhalt zwölf Monate Zeit für Einwände (§ 556 Abs. 3 BGB). Vergleiche Zeitraum, Kostenarten, Verteilerschlüssel und Vorauszahlungen mit dem Vorjahr und deinem Mietvertrag.",
    sections: [
      {
        id: "was-steht-drin",
        title: "Was steht in einer Nebenkostenabrechnung?",
        body: `Eine Nebenkostenabrechnung (auch Betriebskostenabrechnung) zeigt, welche Kosten für das Haus angefallen sind und welcher Anteil auf deine Wohnung entfällt. Darin stehen normalerweise:

- der **Abrechnungszeitraum**, meistens ein Jahr,
- die **Gesamtkosten** je Kostenart, zum Beispiel Wasser, Müll oder Hausreinigung,
- der **Verteilerschlüssel**, etwa nach Wohnfläche oder Personen,
- **dein Anteil** an jeder Kostenart,
- deine **Vorauszahlungen** und das Ergebnis: Nachzahlung oder Guthaben.

Welche Kosten grundsätzlich als Betriebskosten gelten, listet die [Betriebskostenverordnung](${law("betrkv", "2")}) auf. Welche davon du tatsächlich zahlen musst, hängt von deinem Mietvertrag ab.`,
      },
      {
        id: "worauf-achten",
        title: "Worauf solltest du achten?",
        body: `- **Zeitraum:** Umfasst die Abrechnung genau ein Jahr? Passt er zu deinem Einzug oder Auszug?
- **Kostenarten:** Stehen neue Posten drin, die im Mietvertrag nicht vereinbart sind?
- **Verteilerschlüssel:** Stimmt die Wohnfläche? Passt die Personenzahl?
- **Vorauszahlungen:** Sind alle Zahlungen angerechnet, die du geleistet hast?
- **Sprünge:** Ist eine Kostenart im Vergleich zum Vorjahr stark gestiegen?

Wenn dir etwas komisch vorkommt, darfst du die Belege beim Vermieter einsehen. Die Verbraucherzentrale bietet dazu Infos und Musterbriefe an. Auch Mietervereine prüfen Abrechnungen, meist für Mitglieder.`,
      },
      {
        id: "frist",
        title: "Welche Fristen gelten?",
        body: `[§ 556 Abs. 3 BGB](${law("bgb", "556")}) regelt zwei Fristen:

| Wer? | Frist | Folge, wenn sie verpasst wird |
| --- | --- | --- |
| Vermieter | Abrechnung spätestens bis Ende des 12. Monats nach Ende des Abrechnungszeitraums | Nachforderung meist ausgeschlossen, außer der Vermieter kann nichts für die Verspätung |
| Mieter | Einwände spätestens bis Ende des 12. Monats nach Zugang der Abrechnung | Einwände meist ausgeschlossen, außer du kannst nichts für die Verspätung |

**Erfundenes Beispiel:** Der Abrechnungszeitraum ist das Jahr 2025. Die Abrechnung muss also bis zum 31. Dezember 2026 bei dir sein. Sie kommt am 15. Juni 2026. Deine Frist für Einwände läuft dann bis Juni 2027. Warte trotzdem nicht so lange.

Wichtig: Die Frist für Einwände ist nicht die Zahlungsfrist. Eine Nachzahlung wird oft schon nach wenigen Wochen fällig. Was dann gilt, steht im Anschreiben.`,
      },
      {
        id: "naechster-schritt",
        title: "Was tust du als Nächstes?",
        body: `**Alles plausibel:** Zahle die Nachzahlung bis zum Termin oder prüfe, wie das Guthaben ausgezahlt wird. Lege die Abrechnung beim Mietvertrag ab.

**Fragen offen:** Bitte schriftlich um Einsicht in die Belege. Nenne die Kostenarten, um die es geht.

**Fehler gefunden:** Schreibe dem Vermieter, welche Position du für falsch hältst und warum. Schicke den Brief so, dass du den Zugang nachweisen kannst. Wenn du trotzdem zahlst, kannst du das „unter Vorbehalt“ tun.

Die Abrechnung kommt nie? Dann kann die Verbraucherzentrale mit einem Musterbrief helfen. Bei Streit helfen Mieterverein oder Verbraucherzentrale.

${notAdviceGeneral}`,
      },
      {
        id: "checkliste",
        title: "Checkliste Nebenkostenabrechnung",
        body: `1. Datum notieren, an dem die Abrechnung angekommen ist.
2. Prüfen: Kam sie innerhalb von zwölf Monaten nach Ende des Zeitraums?
3. Zeitraum, Wohnfläche und Personenzahl kontrollieren.
4. Kostenarten mit dem Mietvertrag vergleichen.
5. Vorauszahlungen mit deinen Kontoauszügen abgleichen.
6. Zahlungstermin und Frist für Einwände eintragen.
7. Abrechnung beim Mietvertrag ablegen.

Wie lange du Abrechnungen behalten solltest, steht im Ratgeber [Unterlagen aufbewahren](/ratgeber/unterlagen-aufbewahren-wie-lange).`,
      },
      {
        id: "ordilo",
        title: "So hilft eine Dokumenten-App",
        body: `Wenn Mietvertrag und frühere Abrechnungen in Ordilo liegen, kannst du fragen: „Wie hoch war die Hausreinigung letztes Jahr?“ oder „Welche Wohnfläche steht im Mietvertrag?“ Ordilo zeigt dir die Fundstelle, damit du direkt im Original nachsehen kannst.

Ordilo erinnert an die Termine, die du festlegst. Ob eine Abrechnung rechtlich korrekt ist, entscheidet Ordilo nicht. Scannen, Fragen und Erinnerungen sind kostenlos ([Preise](/#preise), [Datenschutz](/datenschutz)).`,
      },
    ],
    sources: [
      {
        title: "§ 556 BGB: Vereinbarungen über Betriebskosten",
        url: law("bgb", "556"),
        note: "Gesetzestext: Abrechnungsfrist für Vermieter und Einwendungsfrist für Mieter (Abs. 3).",
      },
      {
        title: "§ 2 BetrKV: Aufstellung der Betriebskosten",
        url: law("betrkv", "2"),
        note: "Gesetzestext: Liste der Kostenarten, die als Betriebskosten gelten können.",
      },
      {
        title:
          "Verbraucherzentrale: Hilfe bei hoher Betriebs- und Heizkostenabrechnung",
        url: "https://www.verbraucherzentrale.de/wissen/energie/preise-tarife-anbieterwechsel/nachzahlungsschock-hilfe-bei-hoher-betriebs-und-heizkostenabrechnung-83065",
        note: "Hinweise zu Belegeinsicht, Zahlung unter Vorbehalt und Musterbriefen. Das Fristbeispiel ist erfunden.",
      },
    ],
    related: [
      "mahnung-erhalten-was-tun",
      "unterlagen-aufbewahren-wie-lange",
      "ordnerstruktur-private-dokumente",
    ],
  },
  {
    slug: "mahnung-erhalten-was-tun",
    title: "Mahnung erhalten: Was tun bei Mahnung und Mahnbescheid?",
    description:
      "Mahnung oder Mahnbescheid im Briefkasten? So prüfst du die Forderung, erkennst den Unterschied und hältst die Frist von zwei Wochen ein. Mit Checkliste.",
    topic: "Brief verstehen",
    updated: "2026-10-22",
    answer:
      "Prüfe bei einer Mahnung zuerst, ob die Forderung stimmt und ob du schon bezahlt hast. Eine Mahnung kommt vom Gläubiger oder einem Inkassobüro. Ein gerichtlicher Mahnbescheid kommt vom Amtsgericht: Dagegen kannst du innerhalb von zwei Wochen nach Zustellung Widerspruch einlegen (§ 692 ZPO). Ignorieren solltest du keins von beiden.",
    sections: [
      {
        id: "unterschied",
        title: "Mahnung oder Mahnbescheid – was ist der Unterschied?",
        body: `| | Mahnung | Gerichtlicher Mahnbescheid |
| --- | --- | --- |
| Absender | Firma, Vermieter, Inkassobüro | Amtsgericht (Mahngericht) |
| Form | Normaler Brief, E-Mail | Gelber Umschlag mit förmlicher Zustellung |
| Frist | Zahlungsziel aus dem Brief | Zwei Wochen ab Zustellung |
| Wenn du nichts tust | Weitere Mahnungen, Kosten, evtl. Mahnbescheid | Vollstreckungsbescheid möglich |

Eine Mahnung fordert dich auf zu zahlen. Mit ihr kommst du in **Verzug**, wenn die Rechnung schon fällig war ([§ 286 Abs. 1 BGB](${law("bgb", "286")})). Ohne Mahnung kommst du spätestens 30 Tage nach Fälligkeit und Zugang der Rechnung in Verzug. Als Verbraucher gilt das aber nur, wenn die Rechnung darauf hingewiesen hat (§ 286 Abs. 3 BGB). Im Verzug können Zinsen und Kosten dazukommen.`,
      },
      {
        id: "worauf-achten",
        title: "Worauf solltest du achten?",
        body: `- **Kennst du den Absender?** Gibt es einen Vertrag oder eine Bestellung?
- **Stimmt der Betrag?** Vergleiche mit der ursprünglichen Rechnung.
- **Hast du schon bezahlt?** Suche die Überweisung im Kontoauszug.
- **Wofür sind Zusatzkosten?** Mahngebühren und Inkassokosten müssen nachvollziehbar sein.
- **Ist es echt?** Prüfe Kontaktdaten über eine unabhängige Quelle, nicht über die Nummer im Brief.

Ein gerichtlicher Mahnbescheid prüft nicht, ob die Forderung wirklich besteht. Das muss sogar im Bescheid stehen ([§ 692 Abs. 1 Nr. 2 ZPO](${law("zpo", "692")})). Du musst also selbst prüfen.`,
      },
      {
        id: "frist",
        title: "Welche Frist gilt beim Mahnbescheid?",
        body: `Der Mahnbescheid fordert dich auf, innerhalb von **zwei Wochen ab Zustellung** zu zahlen oder dem Gericht mitzuteilen, ob und wie weit du widersprichst ([§ 692 Abs. 1 Nr. 3 ZPO](${law("zpo", "692")})). Das Zustelldatum steht auf dem gelben Umschlag.

Widerspruch kannst du einlegen, solange noch kein Vollstreckungsbescheid erlassen ist ([§ 694 ZPO](${law("zpo", "694")})). Verlass dich darauf aber nicht – nach Ablauf der zwei Wochen kann der Gläubiger den Vollstreckungsbescheid beantragen.

**Erfundenes Beispiel:** Der Mahnbescheid wird am Mittwoch, 4. November 2026 zugestellt. Die zwei Wochen enden am Mittwoch, 18. November 2026. Schicke deinen Widerspruch so früh, dass er sicher vorher beim Gericht ist.`,
      },
      {
        id: "naechster-schritt",
        title: "Was tust du als Nächstes?",
        body: `**Die Forderung stimmt:** Zahle oder frag nach einer Ratenzahlung. Laut Verbraucherzentrale solltest du keinen Widerspruch einlegen, wenn du weißt, dass die Forderung besteht.

**Die Forderung stimmt nicht oder nur teilweise:** Bei einer Mahnung schreibst du dem Absender, warum du nicht zahlst. Beim Mahnbescheid nutzt du das beiliegende Widerspruchsformular. Du kannst der ganzen Forderung oder nur einem Teil widersprechen, etwa den Inkassokosten. Der Widerspruch geht an das **Gericht**, nicht an das Inkassobüro.

**Du bist unsicher:** Hol dir schnell Hilfe, zum Beispiel bei einer Verbraucherzentrale oder Schuldnerberatung. Gegen einen Vollstreckungsbescheid gibt es zwar noch einen Einspruch, aber auch dort ist die Frist kurz.

${notAdviceGeneral}`,
      },
      {
        id: "checkliste",
        title: "Checkliste bei Mahnung oder Mahnbescheid",
        body: `1. Absender prüfen: Firma, Inkasso oder Gericht?
2. Bei Mahnbescheid: Zustelldatum notieren und Fristende eintragen.
3. Ursprüngliche Rechnung und Vertrag heraussuchen.
4. Kontoauszüge prüfen: Schon bezahlt?
5. Entscheiden: zahlen, Ratenzahlung erfragen oder widersprechen.
6. Antwort oder Widerspruch nachweisbar verschicken.
7. Alles zusammen ablegen.`,
      },
      {
        id: "ordilo",
        title: "So hilft eine Dokumenten-App",
        body: `Gerade bei Mahnungen hilft es, die ursprüngliche Rechnung schnell zu finden. In Ordilo kannst du fragen: „Haben wir die Rechnung von Firma X bezahlt?“ oder „Wann kam die erste Rechnung?“ Ordilo antwortet aus euren gespeicherten Unterlagen und zeigt die Fundstelle.

Ordilo prüft nicht, ob eine Forderung rechtmäßig ist, und schickt keinen Widerspruch. Eine Erinnerung an die Zwei-Wochen-Frist kannst du dir aber anlegen. Scannen, Fragen und Erinnerungen sind kostenlos ([Preise](/#preise)).`,
      },
    ],
    sources: [
      {
        title: "§ 286 BGB: Verzug des Schuldners",
        url: law("bgb", "286"),
        note: "Gesetzestext: Verzug durch Mahnung oder 30 Tage nach Rechnung mit Hinweis für Verbraucher.",
      },
      {
        title: "§ 692 ZPO: Mahnbescheid",
        url: law("zpo", "692"),
        note: "Gesetzestext: keine Prüfung des Anspruchs, Frist von zwei Wochen ab Zustellung.",
      },
      {
        title: "§ 694 ZPO: Widerspruch gegen den Mahnbescheid",
        url: law("zpo", "694"),
        note: "Gesetzestext: Widerspruch möglich, solange kein Vollstreckungsbescheid verfügt ist.",
      },
      {
        title: "Verbraucherzentrale: Gerichtliches Mahnverfahren",
        url: "https://www.verbraucherzentrale.de/wissen/geld-versicherungen/kredit-schulden-insolvenz/gerichtliches-mahnverfahren-was-tun-bei-einem-mahnbescheid-10851",
        note: "Praktische Hinweise zu Teilwiderspruch und Adressat. Fristbeispiel ist erfunden.",
      },
    ],
    related: [
      "nebenkostenabrechnung-pruefen",
      "vertrag-kuendigen-frist",
      "unterlagen-aufbewahren-wie-lange",
    ],
  },
  {
    slug: "bescheid-krankenkasse-widerspruch",
    title: "Bescheid der Krankenkasse verstehen und widersprechen",
    description:
      "Brief von der Krankenkasse: So erkennst du einen Bescheid, verstehst die Ablehnung und hältst die Widerspruchsfrist von einem Monat ein. Mit Beispiel und Checkliste.",
    topic: "Brief verstehen",
    updated: "2026-10-22",
    answer:
      "Nicht jeder Brief der Krankenkasse ist ein Bescheid. Ein Bescheid entscheidet über deinen Fall, zum Beispiel eine Ablehnung, und hat am Ende eine Rechtsbehelfsbelehrung. Dagegen kannst du innerhalb eines Monats nach Bekanntgabe Widerspruch einlegen (§ 84 SGG). Eine Begründung kannst du nachreichen; wichtig ist, dass der Widerspruch rechtzeitig ankommt.",
    sections: [
      {
        id: "was-steht-drin",
        title: "Ist das ein Bescheid oder nur eine Info?",
        body: `Krankenkassen schicken viele Briefe: Mitgliedsbescheinigungen, Infos zu Beiträgen, Rückfragen oder Entscheidungen über Anträge. Ein **Bescheid** erkennst du meist an diesen Teilen:

- Eine klare **Entscheidung**, zum Beispiel „Wir lehnen die Kostenübernahme ab“.
- Eine **Begründung**, warum so entschieden wurde.
- Eine **Rechtsbehelfsbelehrung** am Ende mit Frist und Adresse.

Fehlt die Rechtsbehelfsbelehrung oder ist sie falsch, gilt nach [§ 66 SGG](${law("sgg", "66")}) in der Regel eine längere Frist von einem Jahr. Darauf solltest du dich aber nicht verlassen.`,
      },
      {
        id: "worauf-achten",
        title: "Worauf solltest du achten?",
        body: `- **Worüber wurde entschieden?** Welcher Antrag, welches Hilfsmittel, welcher Zeitraum?
- **Für wen?** Bei Familienversicherung: für welches Familienmitglied?
- **Warum?** Steht ein Gutachten oder fehlende Unterlage in der Begründung?
- **Aktenzeichen:** Notiere es. Du brauchst es für jede Antwort.
- **Datum:** Danach rechnest du die Frist.

Manchmal fehlt nur ein Nachweis, etwa eine ärztliche Bescheinigung. Dann kann ein Anruf klären, was noch gebraucht wird. Der Anruf ersetzt aber keinen Widerspruch.`,
      },
      {
        id: "frist",
        title: "Welche Frist gilt für den Widerspruch?",
        body: `Der Widerspruch muss **innerhalb eines Monats nach Bekanntgabe** eingelegt werden ([§ 84 Abs. 1 SGG](${law("sgg", "84")})). Er geht schriftlich, elektronisch in der vorgesehenen Form oder zur Niederschrift bei der Krankenkasse.

Ein Bescheid per Post gilt am **vierten Tag nach dem Absenden** als bekannt gegeben ([§ 37 Abs. 2 SGB X](${law("sgb_10", "37")})), außer er kommt nachweislich später an. Die Verbraucherzentrale weist darauf hin: Der Widerspruch muss bis zum Fristende bei der Kasse **ankommen**, Abschicken am letzten Tag reicht nicht.

**Erfundenes Beispiel:** Die Kasse schickt eine Ablehnung am 9. November ab. Sie gilt am 13. November als bekannt gegeben. Die Frist endet am 13. Dezember. Das ist ein Sonntag, also endet sie am Montag, 14. Dezember. Plane den Versand mindestens eine Woche vorher.`,
      },
      {
        id: "naechster-schritt",
        title: "Was tust du als Nächstes?",
        body: `**Du bist einverstanden:** Lege den Bescheid ab. Prüfe, ob er für eine spätere Leistung wichtig ist.

**Du willst widersprechen:** Schreibe kurz, gegen welchen Bescheid (Datum, Aktenzeichen) du Widerspruch einlegst. Die Begründung kannst du nachreichen. Schicke den Widerspruch so, dass du den Zugang beweisen kannst. Hebe eine Kopie auf.

**Du brauchst Hilfe:** Die Verbraucherzentrale, die Unabhängige Patientenberatung oder Sozialverbände unterstützen bei Widersprüchen. Wird der Widerspruch abgelehnt, ist eine Klage beim Sozialgericht möglich – auch dafür gilt eine Frist, die im Widerspruchsbescheid steht.

${notAdvice}`,
      },
      {
        id: "checkliste",
        title: "Checkliste Krankenkassen-Bescheid",
        body: `1. Prüfen: Ist das ein Bescheid mit Rechtsbehelfsbelehrung?
2. Aktenzeichen und Datum notieren.
3. Bekanntgabetag und Fristende ausrechnen.
4. Begründung lesen: Fehlt nur ein Nachweis?
5. Entscheiden: annehmen, nachfragen oder widersprechen.
6. Widerspruch nachweisbar schicken, Kopie behalten.
7. Antwort der Kasse beim Bescheid ablegen.`,
      },
      {
        id: "ordilo",
        title: "So hilft eine Dokumenten-App",
        body: `Krankenkassenpost betrifft oft mehrere Familienmitglieder. In Ordilo kannst du fragen: „Was hat die Kasse zu Milas Brille entschieden?“ oder „Welches Aktenzeichen hat der Bescheid?“ Die Antwort kommt mit Fundstelle, damit du im Original nachsehen kannst.

Gesundheitsdaten sind besonders sensibel. Überlegt, welche Unterlagen ihr gemeinsam teilt. Wie Ordilo Dokumente verarbeitet, steht im [Datenschutz](/datenschutz). Ordilo schreibt keinen Widerspruch für dich und gibt keine Rechtsberatung.`,
      },
    ],
    sources: [
      {
        title: "§ 84 SGG: Widerspruchsfrist",
        url: law("sgg", "84"),
        note: "Gesetzestext: Widerspruch innerhalb eines Monats nach Bekanntgabe.",
      },
      {
        title: "§ 37 SGB X: Bekanntgabe des Verwaltungsakts",
        url: law("sgb_10", "37"),
        note: "Gesetzestext: Bekanntgabe per Post am vierten Tag nach Aufgabe zur Post.",
      },
      {
        title: "§ 66 SGG: Rechtsbehelfsbelehrung",
        url: law("sgg", "66"),
        note: "Gesetzestext: längere Frist bei fehlender oder falscher Belehrung.",
      },
      {
        title: "Verbraucherzentrale: Widerspruch bei der Krankenkasse einlegen",
        url: "https://www.verbraucherzentrale.de/wissen/gesundheit-pflege/krankenversicherung/widerspruch-bei-der-krankenkasse-und-pflegekasse-einlegen-so-gehts-102986",
        note: "Praktische Hinweise zu Form, Zugang und Begründung. Das Fristbeispiel ist erfunden.",
      },
    ],
    related: [
      "kindergeld-elterngeld-bescheid-verstehen",
      "kita-gebuehrenbescheid-verstehen",
      "papierkram-organisieren-familie",
    ],
  },
  {
    slug: "kita-gebuehrenbescheid-verstehen",
    title: "Kita-Gebührenbescheid verstehen: Beitrag, Frist, Widerspruch",
    description:
      "Kita-Gebührenbescheid oder Elternbeitragsbescheid erhalten? So liest du Beitrag, Einkommen und Rechtsbehelfsbelehrung – und was je nach Bundesland gilt.",
    topic: "Brief verstehen",
    updated: "2026-10-22",
    answer:
      "Ein Kita-Gebührenbescheid legt fest, wie viel Elternbeitrag du zahlst. Die Regeln dafür macht jedes Bundesland und oft jede Stadt selbst – deshalb sehen Bescheide sehr unterschiedlich aus. Prüfe Einkommen, Betreuungszeit und Geschwisterermäßigung. Welcher Rechtsbehelf möglich ist und bis wann, steht in der Rechtsbehelfsbelehrung am Ende; oft ist es ein Monat.",
    sections: [
      {
        id: "was-steht-drin",
        title: "Was steht in einem Kita-Gebührenbescheid?",
        body: `Das Gesetz erlaubt, dass für die Kita Kostenbeiträge erhoben werden ([§ 90 SGB VIII](${law("sgb_8", "90")})). Wie hoch sie sind, regeln Landesgesetze und kommunale Satzungen. In vielen Bescheiden stehen:

- das **Kind** und die **Einrichtung**,
- die **Betreuungszeit**, zum Beispiel 35 oder 45 Stunden pro Woche,
- das **Einkommen**, nach dem der Beitrag berechnet wurde,
- **Ermäßigungen**, etwa für Geschwister,
- der **Monatsbeitrag** und ab wann er gilt,
- eventuell **Essensgeld**, das oft getrennt berechnet wird.

In einigen Bundesländern ist die Kita ganz oder teilweise beitragsfrei. Ob das für euch gilt, steht in eurer Satzung oder beim Jugendamt.`,
      },
      {
        id: "worauf-achten",
        title: "Worauf solltest du achten?",
        body: `- **Einkommen:** Hat die Stelle das richtige Jahr und den richtigen Betrag genommen?
- **Betreuungszeit:** Stimmt die gebuchte Stundenzahl?
- **Geschwister:** Sind alle Kinder berücksichtigt, die zählen?
- **Beginn:** Ab welchem Monat gilt der neue Beitrag?
- **Mitwirkung:** Musst du bis zu einem Termin Nachweise nachreichen?

Wer Bürgergeld, Kinderzuschlag oder Wohngeld bekommt, für den gilt der Beitrag nach [§ 90 Abs. 4 SGB VIII](${law("sgb_8", "90")}) als nicht zumutbar. Er wird dann auf Antrag erlassen. Frag beim Jugendamt oder deiner Stadt nach, wie der Antrag bei euch läuft.

Bei einer **privaten Kita** gibt es oft keinen Bescheid, sondern einen Vertrag. Dann gelten die Regeln aus dem Vertrag.`,
      },
      {
        id: "frist",
        title: "Welche Frist gilt?",
        body: `Kommt der Bescheid von der Stadt, dem Kreis oder dem Jugendamt, ist er ein Verwaltungsakt. Bundesrechtlich ist dafür der **Widerspruch innerhalb eines Monats** nach Bekanntgabe vorgesehen ([§ 70 VwGO](${law("vwgo", "70")})).

Aber: Die Bundesländer dürfen das Widerspruchsverfahren abschaffen ([§ 68 VwGO](${law("vwgo", "68")})). In manchen Ländern musst du deshalb direkt **Klage beim Verwaltungsgericht** einreichen. Was bei dir gilt, steht in der **Rechtsbehelfsbelehrung** am Ende des Bescheids. Fehlt sie oder ist sie falsch, gilt meist eine längere Frist ([§ 58 VwGO](${law("vwgo", "58")})).

**Erfundenes Beispiel:** Der Bescheid ist auf den 2. März datiert. In der Belehrung steht „Widerspruch innerhalb eines Monats nach Bekanntgabe“. Rechne mit ein paar Tagen Postweg und trage dir eine Erinnerung für Mitte März ein, damit du Zeit zum Nachfragen hast.`,
      },
      {
        id: "naechster-schritt",
        title: "Was tust du als Nächstes?",
        body: `**Alles stimmt:** Prüfe, ob der Beitrag per Lastschrift oder Überweisung läuft. Lege den Bescheid beim Kita-Vertrag ab.

**Eine Zahl stimmt nicht:** Ruf oder schreib der Stelle, die den Bescheid geschickt hat. Oft reicht ein fehlender Nachweis. Behalte die Frist trotzdem im Blick.

**Du bist nicht einverstanden:** Lege den Rechtsbehelf ein, der in der Belehrung steht. Nenne Aktenzeichen, Kind und Datum des Bescheids. Wenn sich euer Einkommen später ändert, frag nach, ob du das melden musst oder darfst.

${notAdvice}`,
      },
      {
        id: "checkliste",
        title: "Checkliste Kita-Gebührenbescheid",
        body: `1. Datum und Aktenzeichen notieren.
2. Rechtsbehelfsbelehrung lesen: Widerspruch oder Klage? Welche Frist?
3. Einkommen, Betreuungszeit und Geschwister prüfen.
4. Beginn und Höhe des Beitrags notieren.
5. Nachweise nachreichen, wenn verlangt.
6. Zahlungsweg prüfen.
7. Bescheid zum Kita-Vertrag legen.

Mehr zur Elternpost aus Kita und Schule findest du im Ratgeber [Kita- und Schulbriefe organisieren](/ratgeber/kita-schulbriefe-organisieren).`,
      },
      {
        id: "ordilo",
        title: "So hilft eine Dokumenten-App",
        body: `Kita-Bescheide kommen oft jedes Jahr neu. Wenn sie in Ordilo liegen, kannst du fragen: „Wie hoch war der Beitrag letztes Jahr?“ oder „Welches Einkommen hat die Stadt angesetzt?“ Ordilo zeigt dir die Fundstelle im Brief.

Ordilo kennt nicht die Satzung eurer Stadt und prüft nicht, ob der Beitrag richtig ist. Es hilft dir, die Angaben schnell zu finden und Fristen nicht zu vergessen. Scannen, Fragen und Erinnerungen sind kostenlos ([Preise](/#preise)).`,
      },
    ],
    sources: [
      {
        title: "§ 90 SGB VIII: Kostenbeiträge",
        url: law("sgb_8", "90"),
        note: "Gesetzestext: Grundlage für Kita-Beiträge und Erlass bei unzumutbarer Belastung (Abs. 4).",
      },
      {
        title: "§ 70 VwGO: Widerspruchsfrist",
        url: law("vwgo", "70"),
        note: "Gesetzestext: Widerspruch innerhalb eines Monats nach Bekanntgabe.",
      },
      {
        title: "§ 68 VwGO: Vorverfahren",
        url: law("vwgo", "68"),
        note: "Gesetzestext: Landesrecht kann das Widerspruchsverfahren ausschließen.",
      },
      {
        title: "§ 58 VwGO: Rechtsbehelfsbelehrung",
        url: law("vwgo", "58"),
        note: "Gesetzestext: längere Frist bei fehlender oder falscher Belehrung. Beispiel und Checkliste sind eigene Vorschläge; Beitragsregeln unterscheiden sich je nach Land und Kommune.",
      },
    ],
    related: [
      "kita-schulbriefe-organisieren",
      "kindergeld-elterngeld-bescheid-verstehen",
      "bescheid-krankenkasse-widerspruch",
    ],
  },
  {
    slug: "vertrag-kuendigen-frist",
    title: "Kündigungsbestätigung prüfen: Laufzeit und Kündigungsfrist",
    description:
      "Kündigungsbestätigung erhalten? So prüfst du Vertragsende, Mindestlaufzeit und Kündigungsfrist – und was der Kündigungsbutton bei Online-Verträgen bedeutet.",
    topic: "Brief verstehen",
    updated: "2026-10-22",
    answer:
      "Prüfe in der Kündigungsbestätigung vor allem das genannte Vertragsende. Bei vielen Verträgen, die seit März 2022 geschlossen wurden, darf die Kündigungsfrist höchstens einen Monat betragen; nach der Mindestlaufzeit kannst du dann jederzeit mit einem Monat Frist kündigen (§ 309 Nr. 9 BGB). Online-Verträge musst du über einen Kündigungsbutton beenden können (§ 312k BGB).",
    sections: [
      {
        id: "was-steht-drin",
        title: "Was steht in einer Kündigungsbestätigung?",
        body: `Eine gute Kündigungsbestätigung enthält:

- **Vertrag und Kundennummer**,
- das **Datum**, an dem deine Kündigung angekommen ist,
- das **Vertragsende**, also den letzten Tag, an dem du zahlst,
- eventuell Hinweise auf **Rückgabe** von Geräten oder offene Beträge.

Hast du über den Kündigungsbutton auf einer Website gekündigt, muss der Anbieter dir den Inhalt der Kündigung, Datum und Uhrzeit des Zugangs und das Vertragsende sofort elektronisch in Textform bestätigen ([§ 312k Abs. 4 BGB](${law("bgb", "312k")})).`,
      },
      {
        id: "worauf-achten",
        title: "Worauf solltest du achten?",
        body: `- **Stimmt das Vertragsende?** Rechne mit Vertragsbeginn, Mindestlaufzeit und Frist nach.
- **Wurde ein Rückholangebot angenommen?** Manche Anbieter rufen an und bieten einen neuen Tarif. Ein „Ja“ am Telefon kann einen neuen Vertrag bedeuten.
- **Laufen Abbuchungen weiter?** Prüfe nach dem Vertragsende deine Kontoauszüge.
- **Keine Bestätigung bekommen?** Frag nach und hebe deinen Nachweis über die Kündigung auf.

Vertragsdaten findest du meist in der ersten Auftragsbestätigung oder im Kundenkonto.`,
      },
      {
        id: "frist",
        title: "Welche Fristen gelten?",
        body: `Für viele Verbraucherverträge mit Allgemeinen Geschäftsbedingungen, die seit dem **1. März 2022** geschlossen wurden, gilt nach [§ 309 Nr. 9 BGB](${law("bgb", "309")}):

| Regel | Höchstens |
| --- | --- |
| Erste Mindestlaufzeit | zwei Jahre |
| Kündigungsfrist zum Ende der Mindestlaufzeit | ein Monat |
| Danach (automatische Verlängerung) | unbefristet, jederzeit mit einem Monat Frist kündbar |

Das betrifft zum Beispiel Fitnessstudio, Streaming oder Zeitschriften-Abos. Es gilt nicht für alle Verträge, etwa nicht für Mietverträge oder Versicherungen. Bei älteren Verträgen kann laut Verbraucherzentrale noch eine Frist von bis zu drei Monaten gelten. Für Handy- und Internetverträge gibt es eigene Regeln im Telekommunikationsgesetz.

**Erfundenes Beispiel:** Ein Fitnessvertrag beginnt am 1. April 2025 mit 24 Monaten Laufzeit. Er endet zuerst am 31. März 2027. Die Kündigung muss dann spätestens Ende Februar 2027 beim Studio sein. Verpasst du das, läuft er unbefristet weiter und ist dann jederzeit mit einem Monat Frist kündbar.`,
      },
      {
        id: "naechster-schritt",
        title: "Was tust du als Nächstes?",
        body: `1. Vergleiche das bestätigte Vertragsende mit deiner eigenen Rechnung.
2. Stimmt es nicht, schreibe dem Anbieter kurz mit Kundennummer und deinem Datum.
3. Trage dir das Vertragsende ein und prüfe danach, ob die Abbuchungen aufhören.
4. Hebe Kündigung und Bestätigung auf. Die Verbraucherzentrale empfiehlt, Kündigungen von Abos noch drei Jahre über die Laufzeit hinaus zu behalten.

${notAdviceGeneral}`,
      },
      {
        id: "checkliste",
        title: "Checkliste Kündigung",
        body: `1. Vertragsbeginn und Mindestlaufzeit heraussuchen.
2. Kündigungsfrist im Vertrag prüfen.
3. Nachweisbar kündigen, online über den Kündigungsbutton.
4. Bestätigung speichern: Datum, Uhrzeit, Vertragsende.
5. Vertragsende im Kalender eintragen.
6. Nach dem Ende: Kontoauszug prüfen.
7. Unterlagen aufbewahren.`,
      },
      {
        id: "ordilo",
        title: "So hilft eine Dokumenten-App",
        body: `Viele Verträge laufen über Jahre, und die Unterlagen sind dann schwer zu finden. In Ordilo kannst du fragen: „Wann habe ich den Handyvertrag abgeschlossen?“ oder „Welche Kundennummer hat das Fitnessstudio?“ Ordilo zeigt die Antwort mit Fundstelle.

Ordilo kündigt nicht für dich. Du kannst dir aber eine Erinnerung vor dem Vertragsende anlegen. Scannen, Fragen und Erinnerungen sind kostenlos ([Preise](/#preise)).`,
      },
    ],
    sources: [
      {
        title: "§ 309 BGB: Klauselverbote (Nr. 9 Laufzeit)",
        url: law("bgb", "309"),
        note: "Gesetzestext: Mindestlaufzeit, Verlängerung und Kündigungsfrist in AGB.",
      },
      {
        title: "§ 312k BGB: Kündigung im elektronischen Geschäftsverkehr",
        url: law("bgb", "312k"),
        note: "Gesetzestext: Kündigungsbutton und Bestätigungspflicht.",
      },
      {
        title: "Verbraucherzentrale: Gesetz für fairere Verträge",
        url: "https://www.verbraucherzentrale.de/wissen/vertraege-reklamation/kundenrechte/gesetz-fuer-fairere-vertraege-mehr-schutz-bei-kosten-und-laufzeiten-55274",
        note: "Erklärung der Regeln seit März 2022 und Hinweis auf ältere Verträge. Das Fitnessbeispiel ist erfunden.",
      },
      {
        title: "Verbraucherzentrale: Aufbewahrungspflichten",
        url: "https://www.verbraucherzentrale.de/wissen/digitale-welt/datenschutz/aufbewahrungspflichten-welche-unterlagen-muss-ich-wie-lange-behalten-84296",
        note: "Empfehlung zur Aufbewahrung von Kündigungen.",
      },
    ],
    related: [
      "mahnung-erhalten-was-tun",
      "unterlagen-aufbewahren-wie-lange",
      "ordnerstruktur-private-dokumente",
    ],
  },
  {
    slug: "unterlagen-aufbewahren-wie-lange",
    title: "Unterlagen aufbewahren: Wie lange privat behalten?",
    description:
      "Welche Unterlagen solltest du privat wie lange aufbewahren? Handwerkerrechnungen, Kaufbelege, Kontoauszüge und Bescheide – mit gesetzlichen Fristen und Übersicht.",
    topic: "Brief verstehen",
    updated: "2026-10-22",
    answer:
      "Privat gibt es nur wenige echte Pflichten: Rechnungen für Handwerker- und andere Arbeiten am Haus oder Grundstück musst du zwei Jahre aufheben (§ 14b UStG). Viele andere Belege lohnt es sich wegen der Verjährung von meist drei Jahren zu behalten. Urkunden, Zeugnisse und Verträge, die noch laufen, gehören dauerhaft in die Ablage.",
    sections: [
      {
        id: "pflicht",
        title: "Was musst du wirklich aufbewahren?",
        body: `**Rechnungen für Arbeiten am Haus oder Grundstück:** Wenn du als Privatperson zum Beispiel einen Handwerker, Gärtner oder Fensterputzer beauftragst, musst du die Rechnung oder einen Zahlungsbeleg **zwei Jahre** aufbewahren ([§ 14b Abs. 1 Satz 5 UStG](${law("ustg_1980", "14b")})). Die Frist beginnt mit dem Ende des Jahres, in dem die Rechnung ausgestellt wurde.

**Erfundenes Beispiel:** Die Rechnung für die Heizungsreparatur ist vom 10. Mai 2026. Die zwei Jahre beginnen am 31. Dezember 2026 und enden am 31. Dezember 2028.

Für die meisten anderen privaten Unterlagen gibt es keine feste gesetzliche Aufbewahrungspflicht. Es gibt aber gute Gründe, sie trotzdem zu behalten.`,
      },
      {
        id: "verjaehrung",
        title: "Warum sind drei Jahre oft eine gute Faustregel?",
        body: `Viele Ansprüche verjähren nach **drei Jahren** ([§ 195 BGB](${law("bgb", "195")})). Die Frist beginnt meist am Ende des Jahres, in dem der Anspruch entstanden ist und du davon wusstest ([§ 199 BGB](${law("bgb", "199")})).

Solange jemand noch Geld von dir verlangen kann, hilft dir ein Zahlungsbeleg. Deshalb empfiehlt die Verbraucherzentrale zum Beispiel, Kontoauszüge und Überweisungen mindestens drei Jahre aufzuheben.

Bei Käufen kommt die **Gewährleistung** dazu: Sie beträgt bei neuen Sachen meist zwei Jahre ab Lieferung ([§ 438 BGB](${law("bgb", "438")})). Hebe den Kaufbeleg mindestens so lange auf – bei teuren Geräten gern länger.`,
      },
      {
        id: "uebersicht",
        title: "Übersicht: Was wie lange?",
        body: `Diese Tabelle ist eine Orientierung, kein vollständiger Katalog. Sie folgt den genannten Gesetzen und den Empfehlungen der Verbraucherzentrale.

| Unterlage | Wie lange? | Warum? |
| --- | --- | --- |
| Handwerkerrechnungen (Haus, Wohnung, Grundstück) | 2 Jahre ab Jahresende | Pflicht nach § 14b UStG |
| Kaufbelege | mindestens Gewährleistung, meist 2 Jahre | Nachweis bei Mängeln |
| Kontoauszüge, Überweisungen | mindestens 3 Jahre | Verjährung |
| Nebenkostenabrechnungen, Mietunterlagen | 3 Jahre nach Mietende (Empfehlung) | Kaution, Streit nach Auszug |
| Kündigungen von Abos | 3 Jahre über die Laufzeit hinaus (Empfehlung) | Nachweis der Kündigung |
| Urkunden, Zeugnisse, Rentenunterlagen | dauerhaft | schwer oder nicht ersetzbar |
| Laufende Verträge, Versicherungen | solange sie laufen, dann noch eine Weile | Nachweis von Bedingungen |

Bei **Steuerunterlagen** ist es komplizierter. Hebe Belege mindestens auf, bis der Steuerbescheid geprüft und die Einspruchsfrist vorbei ist. Im Zweifel frag einen Lohnsteuerhilfeverein oder eine Steuerberatung.`,
      },
      {
        id: "digital",
        title: "Reicht ein Scan?",
        body: `Für viele private Belege ist ein lesbarer Scan im Alltag praktisch. Laut Verbraucherzentrale ändert die Form nichts an der Frist: Entscheidend ist der Inhalt. Ob ein Scan im Streitfall als Beweis genauso viel wert ist wie das Original, ist aber eine andere Frage.

Behalte deshalb Originale von Urkunden, Zeugnissen, notariellen Verträgen und allem, wo du unsicher bist. Wenn eine Frist abgelaufen ist, vernichte Papier mit persönlichen Daten sicher, etwa mit einem Aktenvernichter. Auch digitale Kopien solltest du dann löschen.

${notAdviceGeneral}`,
      },
      {
        id: "checkliste",
        title: "Checkliste: Einmal im Jahr aufräumen",
        body: `1. Handwerkerrechnungen nach Jahr sortieren; alles älter als zwei volle Jahre prüfen.
2. Kontoauszüge und Zahlungsbelege älter als drei Jahre prüfen.
3. Kaufbelege von Geräten ohne Gewährleistung aussortieren – außer du brauchst sie noch.
4. Urkunden und Zeugnisse nicht aussortieren.
5. Gekündigte Verträge mit Enddatum versehen.
6. Papier sicher vernichten, digitale Kopien löschen.

Eine passende Ablage beschreibt der Ratgeber [Ordnerstruktur für private Dokumente](/ratgeber/ordnerstruktur-private-dokumente).`,
      },
      {
        id: "ordilo",
        title: "So hilft eine Dokumenten-App",
        body: `In Ordilo kannst du fragen: „Wann war die letzte Rechnung vom Elektriker?“ oder „Haben wir noch den Kaufbeleg für die Waschmaschine?“ Die Antwort kommt mit Fundstelle aus euren Unterlagen.

Ordilo sagt dir nicht verbindlich, ob du ein Dokument löschen darfst. Du kannst dir aber eine Erinnerung setzen, wann du eine Unterlage wieder prüfen willst. Scannen, Fragen und Erinnerungen sind kostenlos; wie Dokumente verarbeitet werden, steht im [Datenschutz](/datenschutz).`,
      },
    ],
    sources: [
      {
        title: "§ 14b UStG: Aufbewahrung von Rechnungen",
        url: law("ustg_1980", "14b"),
        note: "Gesetzestext: Zwei-Jahres-Pflicht für Privatpersonen bei Leistungen am Grundstück (Abs. 1 Satz 5).",
      },
      {
        title: "§ 195 BGB: Regelmäßige Verjährungsfrist",
        url: law("bgb", "195"),
        note: "Gesetzestext: drei Jahre.",
      },
      {
        title: "§ 199 BGB: Beginn der Verjährung",
        url: law("bgb", "199"),
        note: "Gesetzestext: Beginn am Jahresende.",
      },
      {
        title: "§ 438 BGB: Verjährung der Mängelansprüche",
        url: law("bgb", "438"),
        note: "Gesetzestext: in der Regel zwei Jahre ab Ablieferung.",
      },
      {
        title:
          "Verbraucherzentrale: Welche Unterlagen muss ich wie lange behalten?",
        url: "https://www.verbraucherzentrale.de/wissen/digitale-welt/datenschutz/aufbewahrungspflichten-welche-unterlagen-muss-ich-wie-lange-behalten-84296",
        note: "Empfehlungen zu Kontoauszügen, Mietunterlagen und Kündigungen. Die Übersicht fasst Gesetz und Empfehlungen zusammen; das Beispiel ist erfunden.",
      },
    ],
    related: [
      "ordnerstruktur-private-dokumente",
      "steuerbescheid-pruefen",
      "private-dokumente-digitalisieren",
    ],
  },
  {
    slug: "kindergeld-elterngeld-bescheid-verstehen",
    title: "Kindergeld- und Elterngeldbescheid verstehen",
    description:
      "Kindergeld- oder Elterngeldbescheid erhalten? So liest du Betrag, Zeitraum und Begründung und legst innerhalb eines Monats Einspruch oder Widerspruch ein.",
    topic: "Brief verstehen",
    updated: "2026-10-22",
    answer:
      "Prüfe beim Kindergeld- und Elterngeldbescheid Kind, Zeitraum und Betrag. Gegen einen Kindergeldbescheid der Familienkasse legst du innerhalb eines Monats Einspruch ein (§ 355 AO). Gegen einen Elterngeldbescheid legst du innerhalb eines Monats Widerspruch bei der Elterngeldstelle ein (§ 84 SGG). Die genaue Frist und Adresse stehen in der Rechtsbehelfsbelehrung.",
    sections: [
      {
        id: "was-steht-drin",
        title: "Was steht in den Bescheiden?",
        body: `**Kindergeldbescheid** (von der Familienkasse):

- für welches Kind und ab welchem Monat Kindergeld gezahlt wird,
- die Kindergeldnummer,
- bei älteren Kindern oft: bis wann Nachweise nötig sind, etwa zu Ausbildung oder Studium,
- bei einer Ablehnung oder Rückforderung: die Begründung.

**Elterngeldbescheid** (von der Elterngeldstelle deines Bundeslandes):

- welche Lebensmonate bewilligt sind, mit Basiselterngeld oder ElterngeldPlus,
- welches Einkommen vor der Geburt angesetzt wurde,
- den Betrag pro Monat,
- manchmal den Hinweis, dass der Bescheid **vorläufig** ist, zum Beispiel weil Einkommen nach der Geburt noch nicht feststeht.`,
      },
      {
        id: "worauf-achten",
        title: "Worauf solltest du achten?",
        body: `- **Richtiges Kind, richtige Monate?** Besonders bei Geschwistern und bei Partnermonaten.
- **Einkommen:** Hat die Elterngeldstelle die richtigen Gehaltsabrechnungen genutzt?
- **Vorläufig:** Musst du später Nachweise schicken? Dann notiere den Termin.
- **Nachweise beim Kindergeld:** Bis wann muss eine Schul- oder Ausbildungsbescheinigung da sein?
- **Rückforderung:** Laut Familienkasse stoppt ein Einspruch die Rückzahlung nicht automatisch.

Wenn sich etwas ändert, etwa Ausbildung beendet oder Umzug, musst du das der Familienkasse melden. Die Familienkasse bietet dafür Online-Wege an.`,
      },
      {
        id: "frist",
        title: "Welche Frist gilt?",
        body: `| | Kindergeld | Elterngeld |
| --- | --- | --- |
| Behörde | Familienkasse | Elterngeldstelle des Landes |
| Rechtsbehelf | Einspruch | Widerspruch |
| Frist | ein Monat nach Bekanntgabe ([§ 355 AO](${law("ao_1977", "355")})) | ein Monat nach Bekanntgabe ([§ 84 SGG](${law("sgg", "84")})) |
| Danach | Klage beim Finanzgericht | Klage beim Sozialgericht ([§ 13 BEEG](${law("beeg", "13")})) |

Kindergeld wird über das Steuerrecht gezahlt, deshalb gilt die Abgabenordnung. Ein Brief per Post gilt dort am vierten Tag nach dem Absenden als bekannt gegeben ([§ 122 AO](${law("ao_1977", "122")})). Beim Elterngeld gilt eine ähnliche Regel im Sozialrecht.

**Erfundenes Beispiel:** Die Elterngeldstelle schickt den Bescheid am Dienstag, 3. November ab. Er gilt am Samstag, 7. November als bekannt gegeben. Die Monatsfrist endet am Montag, 7. Dezember. Schicke deinen Widerspruch deutlich früher.`,
      },
      {
        id: "naechster-schritt",
        title: "Was tust du als Nächstes?",
        body: `**Alles stimmt:** Lege den Bescheid ab und trage Termine für Nachweise ein.

**Etwas ist unklar:** Frag bei der Familienkasse oder Elterngeldstelle nach. Halte die Frist trotzdem im Blick.

**Etwas ist falsch:** Lege rechtzeitig Einspruch (Kindergeld) oder Widerspruch (Elterngeld) ein. Nenne Datum des Bescheids, Kindergeldnummer oder Aktenzeichen und was geändert werden soll. Beim Kindergeld geht das laut Familienkasse auch online. Der Einspruch kostet nichts.

${notAdvice}`,
      },
      {
        id: "checkliste",
        title: "Checkliste Kindergeld- und Elterngeldbescheid",
        body: `1. Absender prüfen: Familienkasse oder Elterngeldstelle?
2. Kind, Monate und Betrag kontrollieren.
3. Datum, Kindergeldnummer oder Aktenzeichen notieren.
4. Fristende ausrechnen und eintragen.
5. Termine für Nachweise eintragen.
6. Bei Fehlern: Einspruch oder Widerspruch nachweisbar schicken.
7. Bescheid bei den Unterlagen des Kindes ablegen.`,
      },
      {
        id: "ordilo",
        title: "So hilft eine Dokumenten-App",
        body: `Familienleistungen bringen viele Briefe über Jahre. In Ordilo kannst du fragen: „Welche Kindergeldnummer haben wir?“ oder „Für welche Monate ist das Elterngeld bewilligt?“ Ordilo antwortet aus euren Bescheiden und zeigt die Fundstelle.

Beide Eltern können im gemeinsamen Familienbereich nachsehen. Ordilo stellt keine Anträge und legt keinen Widerspruch ein. Scannen, Fragen und Erinnerungen sind kostenlos ([Preise](/#preise), [Datenschutz](/datenschutz)).`,
      },
    ],
    sources: [
      {
        title:
          "Familienportal: Was tun, wenn ich mit der Entscheidung der Familienkasse nicht einverstanden bin?",
        url: "https://familienportal.de/familienportal/familienleistungen/kindergeld/faq/was-kann-ich-machen-wenn-ich-mit-der-entscheidung-der-familienkasse-nicht-einverstanden-bin--124974",
        note: "Offizielles Portal des Bundesfamilienministeriums zum Einspruch beim Kindergeld.",
      },
      {
        title: "Bundesagentur für Arbeit: Merkblatt Kindergeld",
        url: "https://www.arbeitsagentur.de/datei/kg2-merkblattkindergeld_ba034475.pdf",
        note: "Informationen der Familienkasse zu Kindergeld, Mitwirkung und Rechtsbehelf.",
      },
      {
        title: "§ 355 AO: Einspruchsfrist",
        url: law("ao_1977", "355"),
        note: "Gesetzestext: ein Monat nach Bekanntgabe, gilt auch für Kindergeldbescheide.",
      },
      {
        title: "§ 84 SGG: Widerspruchsfrist",
        url: law("sgg", "84"),
        note: "Gesetzestext: ein Monat nach Bekanntgabe.",
      },
      {
        title: "§ 13 BEEG: Rechtsweg",
        url: law("beeg", "13"),
        note: "Gesetzestext: Sozialgerichte sind für Elterngeld zuständig. Das Fristbeispiel ist erfunden.",
      },
    ],
    related: [
      "steuerbescheid-pruefen",
      "kita-gebuehrenbescheid-verstehen",
      "bescheid-krankenkasse-widerspruch",
    ],
  },
];
