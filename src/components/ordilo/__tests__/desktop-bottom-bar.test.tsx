import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopBottomBar } from "@/components/ordilo/app-shell-navigation";
import {
  SuggestionChipsProvider,
  SuggestionChipsRegistrar,
} from "@/lib/search/suggestion-chips-context";

describe("DesktopBottomBar", () => {
  it("shows frequent questions only while the composer is active", () => {
    render(
      <SuggestionChipsProvider>
        <SuggestionChipsRegistrar chips={["Was ist überfällig?"]} />
        <DesktopBottomBar
          collapsed={false}
          onSearch={vi.fn()}
          onOpenActions={vi.fn()}
        />
      </SuggestionChipsProvider>,
    );

    expect(screen.queryByText("Häufig gefragt")).toBeNull();

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);

    expect(screen.getByText("Häufig gefragt")).toBeDefined();
    expect(screen.getByText("Was ist überfällig?")).toBeDefined();

    fireEvent.blur(input);

    expect(screen.queryByText("Häufig gefragt")).toBeNull();
  });

  it("uses global frequent questions when no page registers its own", () => {
    render(
      <SuggestionChipsProvider>
        <DesktopBottomBar
          collapsed={false}
          onSearch={vi.fn()}
          onOpenActions={vi.fn()}
        />
      </SuggestionChipsProvider>,
    );

    fireEvent.focus(screen.getByRole("textbox"));

    expect(screen.getByText("Was ist überfällig?")).toBeDefined();
  });
});
