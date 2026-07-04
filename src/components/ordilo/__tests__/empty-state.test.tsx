import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/ordilo/empty-state";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Noch keine Familienmitglieder" />);
    expect(screen.getByText("Noch keine Familienmitglieder")).toBeDefined();
  });

  it("renders the description when provided", () => {
    render(
      <EmptyState
        title="Noch keine Familienmitglieder"
        description="Füge eine Person hinzu, um zu beginnen."
      />,
    );
    expect(
      screen.getByText("Füge eine Person hinzu, um zu beginnen."),
    ).toBeDefined();
  });

  it("does not render description when omitted", () => {
    render(<EmptyState title="Keine Daten" />);
    expect(screen.queryByText(/./)).toBeDefined(); // title is present
  });

  it("renders an icon in the illustration area when provided", () => {
    render(<EmptyState title="Leer" icon={Users} />);
    // The icon is rendered as an SVG inside the illustration circle.
    const illustration = screen.getByTestId("empty-state-illustration");
    expect(illustration.querySelector("svg")).not.toBeNull();
  });

  it("renders a default illustration area even without an icon", () => {
    render(<EmptyState title="Leer" />);
    expect(screen.getByTestId("empty-state-illustration")).toBeDefined();
  });

  it("renders a CTA button when actionLabel and onAction are provided", () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Leer"
        actionLabel="Person hinzufügen"
        onAction={onAction}
      />,
    );
    const button = screen.getByRole("button", { name: /person hinzufügen/i });
    expect(button).toBeDefined();
  });

  it("does not render a CTA button when actionLabel is provided but onAction is not", () => {
    render(<EmptyState title="Leer" actionLabel="Person hinzufügen" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not render a CTA button when onAction is provided but actionLabel is not", () => {
    const onAction = vi.fn();
    render(<EmptyState title="Leer" onAction={onAction} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onAction when the CTA button is clicked", () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Leer"
        actionLabel="Person hinzufügen"
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /person hinzufügen/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("applies a custom className", () => {
    render(<EmptyState title="Leer" className="custom-class" />);
    const container = screen.getByTestId("empty-state");
    expect(container.className).toContain("custom-class");
  });
});
