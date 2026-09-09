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

  it("publishes terms for the current free prelaunch state", () => {
    const html = renderToStaticMarkup(<NutzungsbedingungenPage />);

    expect(html).toContain("Nutzungsbedingungen");
    expect(html).toContain("aktuellen Stand kostenlos");
    expect(html).toContain("kein kostenpflichtiges Abo");
    expect(html).toContain("als JSON-Datei");
    expect(html).not.toMatch(/\d+[,.]\d{2}\s*€/);
  });
});
