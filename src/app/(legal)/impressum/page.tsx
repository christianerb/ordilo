import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum — Ordilo",
};

/**
 * Impressum (§ 5 DDG) — complete. Operator: Erb Invest UG
 * (haftungsbeschränkt), Hamburg. Add a USt-IdNr. line under
 * "Registereintrag" once one is assigned.
 */
export default function ImpressumPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Impressum</h1>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Angaben gemäß § 5 DDG</h2>
        <p>
          Erb Invest UG (haftungsbeschränkt)
          <br />
          c/o unicorn workspaces
          <br />
          Burchardstr. 14
          <br />
          20095 Hamburg
          <br />
          Deutschland
        </p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Kontakt</h2>
        <p>E-Mail: info@ordilo.de</p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Vertreten durch</h2>
        <p>Christian Erb, Geschäftsführer</p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">Registereintrag</h2>
        <p>Handelsregister: Amtsgericht Hamburg, HRB 142639</p>
      </section>

      <section className="space-y-1.5 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p>
          Christian Erb
          <br />
          c/o unicorn workspaces, Burchardstr. 14, 20095 Hamburg
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
