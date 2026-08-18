import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { LandingPage } from "../landing-page";

describe("LandingPage", () => {
  it("renders the hero promise and the primary CTA to /login", () => {
    render(<LandingPage />);
    expect(screen.getByText(/Nie wieder suchen/)).toBeDefined();
    const cta = screen.getByTestId("landing-cta-hero");
    expect(cta.textContent).toContain("Kostenlos starten");
    expect(cta.getAttribute("href")).toBe("/login");
  });

  it("renders the three value props", () => {
    render(<LandingPage />);
    expect(screen.getByText("Scannen & vergessen")).toBeDefined();
    // "Einfach fragen" appears twice by design (value prop + step 3).
    expect(screen.getAllByText("Einfach fragen").length).toBeGreaterThan(0);
    expect(screen.getByText("Nichts mehr verpassen")).toBeDefined();
  });

  it("renders the privacy promise with concrete trust facts", () => {
    render(<LandingPage />);
    expect(screen.getByText("Eure Dokumente gehören euch")).toBeDefined();
    expect(screen.getByText("Server in der EU")).toBeDefined();
    expect(screen.getByText("Verschlüsselt")).toBeDefined();
  });

  it("answers the first-visit objections in an FAQ", () => {
    render(<LandingPage />);
    expect(
      screen.getByText(/Was ist der Unterschied zu einem Cloud-Ordner/),
    ).toBeDefined();
    expect(screen.getByText(/Kann das nicht auch ChatGPT/)).toBeDefined();
    expect(screen.getByText(/Was kostet Ordilo/)).toBeDefined();
    expect(screen.getByText(/Wer kann meine Dokumente lesen/)).toBeDefined();
    expect(screen.getByText(/Was, wenn mir mal etwas passiert/)).toBeDefined();
  });

  it("names the persona who carries the paperwork", () => {
    render(<LandingPage />);
    expect(
      screen.getByText("Für die, die alles im Kopf haben"),
    ).toBeDefined();
  });

  it("meets visitors with their problem before the features", () => {
    render(<LandingPage />);
    expect(screen.getByText("Kennst du das?")).toBeDefined();
  });

  it("offers a quiet login link in the header", () => {
    render(<LandingPage />);
    const login = screen.getByRole("link", { name: "Anmelden" });
    expect(login.getAttribute("href")).toBe("/login");
  });

  it("repeats the CTA at the bottom", () => {
    render(<LandingPage />);
    expect(
      screen.getByTestId("landing-cta-bottom").getAttribute("href"),
    ).toBe("/login");
  });
});
