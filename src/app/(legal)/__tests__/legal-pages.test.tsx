import { renderToStaticMarkup } from "react-dom/server";
import DatenschutzPage from "@/app/(legal)/datenschutz/page";
import NutzungsbedingungenPage from "@/app/(legal)/nutzungsbedingungen/page";

describe("public legal pages", () => {
  it("describes both supported login methods in the privacy notice", () => {
    const html = renderToStaticMarkup(<DatenschutzPage />);

    expect(html).toContain("Einmalcode per E-Mail");
    expect(html).toContain("bestehenden Konten");
    expect(html).toContain("mit einem Passwort");
    expect(html).not.toContain("werden vor Launch");
  });

  it("discloses the optional monthly and annual iOS subscriptions", () => {
    const html = renderToStaticMarkup(<NutzungsbedingungenPage />);

    expect(html).toContain("Nutzungsbedingungen");
    expect(html).toContain("kostenlosen Einstieg");
    expect(html).toContain("7,99 € pro Monat oder 79,99 € pro Jahr");
    expect(html).toContain("ganzes Jahr im Voraus");
    expect(html).toContain("verlängert sich automatisch");
    expect(html).toContain("24 Stunden vor Ablauf");
    expect(html).toContain("keine kostenlose Testphase");
    expect(html).toContain("Käufe wiederherstellen");
    expect(html).toContain("Standard-Lizenzvertrag (EULA)");
    expect(html).toContain("als JSON-Datei");
    expect(html).not.toContain("gibt derzeit kein kostenpflichtiges Abo");
  });

  it("distinguishes account deletion, cancellation and statutory rights", () => {
    const html = renderToStaticMarkup(<NutzungsbedingungenPage />);

    expect(html).toContain("kündigt ein über Apple abgeschlossenes Abo nicht automatisch");
    expect(html).toContain("Widerrufs- und Erstattungsrechte bleiben unberührt");
    expect(html).toContain("nicht mit Apples Familienfreigabe");
    expect(html).toContain("setzt kein Plus-Abo voraus");
  });

  it("discloses subscription processing without claiming native replay", () => {
    const html = renderToStaticMarkup(<DatenschutzPage />);

    expect(html).toContain("RevenueCat");
    expect(html).toContain("Familienkennung als Kundenkennung");
    expect(html).toContain("Produkt- und Transaktionskennungen");
    expect(html).toContain("keine Dokumenttexte, Chat-Inhalte oder Familiennamen");
    expect(html).toContain("aber keine Sitzungsaufzeichnung");
    expect(html).toContain("rechtlich und anhand der Vertragsunterlagen geprüft");
  });

  it("describes the explicit AI consent, its withdrawal and its effect", () => {
    const html = renderToStaticMarkup(<DatenschutzPage />);

    // Apple 5.1.2(i): the notice must say consent is collected BEFORE the
    // first transfer, that it is revocable, and what declines changes.
    expect(html).toContain("Deine Einwilligung zur KI-Verarbeitung");
    expect(html).toContain("fragen wir dich ausdrücklich");
    expect(html).toContain("OpenAI");
    expect(html).toContain("Datalab");
    expect(html).toContain("jederzeit in den Einstellungen");
    expect(html).toContain("Ohne Zustimmung bleiben Scannen, Fragen und Spracheingabe aus");
    // Dictation also streams audio to OpenAI — not only Live.
    expect(html).toContain("diktust");
  });
});
