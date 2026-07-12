import type { Metadata } from "next";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = {
  title: "Impressum — Ordilo",
  robots: { index: false },
};

/**
 * Impressum (§ 5 DDG) — PLACEHOLDER content.
 *
 * Every value in [brackets] is dummy data and MUST be replaced with the
 * real operator's details before launch. The page is marked noindex and
 * carries a visible placeholder banner until then.
 */
export default function ImpressumPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Impressum</h1>

      <PlaceholderNotice />

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Angaben gemäß § 5 DDG</h2>
        <p>
          [Max Mustermann]
          <br />
          [Musterfirma UG (haftungsbeschränkt)]
          <br />
          [Musterstraße 1]
          <br />
          [12345 Musterstadt]
          <br />
          Deutschland
        </p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Kontakt</h2>
        <p>
          E-Mail: [hallo@ordilo.example]
          <br />
          Telefon: [+49 000 0000000]
        </p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Vertreten durch</h2>
        <p>[Max Mustermann, Geschäftsführer]</p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Registereintrag</h2>
        <p>
          [Handelsregister: Amtsgericht Musterstadt, HRB 00000]
          <br />
          [USt-IdNr.: DE000000000]
        </p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p>
          [Max Mustermann]
          <br />
          [Musterstraße 1, 12345 Musterstadt]
        </p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Streitbeilegung</h2>
        <p className="text-muted-foreground">
          Wir sind nicht bereit oder verpflichtet, an
          Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      </section>
    </article>
  );
}
