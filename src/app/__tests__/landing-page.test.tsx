import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { LandingPage } from "../landing-page";

describe("LandingPage", () => {
  it("renders the hero promise and the primary CTA to /login", () => {
    render(<LandingPage />);
    expect(screen.getByText(/Dokumenten-App/)).toBeDefined();
    const cta = screen.getByTestId("landing-cta-hero");
    expect(cta.textContent).toContain("Ordilo kostenlos starten");
    expect(cta.getAttribute("href")).toBe("/login");
  });

  it("renders the mobile scan-to-answer journey", () => {
    const { container } = render(<LandingPage />);
    expect(screen.getByText("Brief scannen")).toBeDefined();
    expect(screen.getByText("Ordilo versteht ihn")).toBeDefined();
    expect(screen.getByText("Du bleibst entspannt")).toBeDefined();
    expect(screen.getByText(/Kündigungsfrist in 30 Tagen/)).toBeDefined();
    expect(container.querySelector(".landing-phone-enter")).not.toBeNull();
    expect(
      container.querySelector(".landing-app-reveal--answer"),
    ).not.toBeNull();
    expect(container.querySelector(".landing-wordmark")).not.toBeNull();
  });

  it("keeps supporting mascots still and gives FAQ state visible continuity", () => {
    const { container } = render(<LandingPage />);

    expect(container.querySelectorAll(".landing-mascot-static")).toHaveLength(3);
    expect(container.querySelectorAll(".landing-faq-answer")).toHaveLength(4);
    expect(container.querySelectorAll(".landing-faq-chevron")).toHaveLength(4);
  });

  it("renders the privacy promise with concrete trust facts", () => {
    render(<LandingPage />);
    expect(
      screen.getByText(/Deine privatesten Papiere verdienen/),
    ).toBeDefined();
    expect(screen.getAllByText(/Server in der EU/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Verschlüsselt auf dem Weg/)).toBeDefined();
  });

  it("answers the first-visit objections in an FAQ", () => {
    render(<LandingPage />);
    expect(
      screen.getByText(/Was ist der Unterschied zu einem Cloud-Ordner/),
    ).toBeDefined();
    expect(screen.getByText(/Kann das nicht auch ChatGPT/)).toBeDefined();
    expect(screen.getByText(/Was kostet Ordilo/)).toBeDefined();
    expect(screen.getByText(/Wer kann meine Dokumente lesen/)).toBeDefined();
  });

  it("names the persona who carries the paperwork", () => {
    render(<LandingPage />);
    expect(
      screen.getByText(/Für die Person, die sonst alles im Kopf hat/),
    ).toBeDefined();
  });

  it("frames one document as a complete mobile workflow", () => {
    render(<LandingPage />);
    expect(screen.getByText("Ein Brief. Drei Sorgen weniger.")).toBeDefined();
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
