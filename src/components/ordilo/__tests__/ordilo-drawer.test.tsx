import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerFooter,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDrawer(
  overrides: Partial<React.ComponentProps<typeof OrdiloDrawer>> = {},
) {
  const props: React.ComponentProps<typeof OrdiloDrawer> = {
    open: true,
    onOpenChange: vi.fn(),
    children: (
      <>
        <OrdiloDrawerHeader title="Wer macht das?" description="Trikot waschen" />
        <OrdiloDrawerBody>Inhalt</OrdiloDrawerBody>
      </>
    ),
    ...overrides,
  };
  render(<OrdiloDrawer {...props} />);
  return props;
}

const content = () => document.querySelector("[data-slot=drawer-content]");

/**
 * The detail variant asks matchMedia whether it is on a desktop. The shared
 * test setup answers "no" to everything, so this replaces it for the cases
 * that need the wide layout.
 */
function stubDesktop(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OrdiloDrawer", () => {
  it("renders title and description as the dialog's accessible name", () => {
    renderDrawer();

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Wer macht das?");
    expect(screen.getByText("Trikot waschen")).toBeInTheDocument();
  });

  it("keeps a hidden description available to screen readers", () => {
    renderDrawer({
      children: (
        <OrdiloDrawerHeader
          title="Neue Aufgabe"
          description="Erstelle eine neue Aufgabe für deine Familie"
          descriptionHidden
        />
      ),
    });

    expect(
      screen.getByText("Erstelle eine neue Aufgabe für deine Familie"),
    ).toHaveClass("sr-only");
  });

  it("omits the close button on pickers, where choosing is the way out", () => {
    renderDrawer({ variant: "picker" });

    expect(
      screen.queryByRole("button", { name: "Schließen" }),
    ).not.toBeInTheDocument();
  });

  it("offers a close button on forms and details", () => {
    const props = renderDrawer({ variant: "form" });

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("anchors pickers and forms to the bottom at every width", () => {
    stubDesktop(true);
    renderDrawer({ variant: "picker" });

    expect(content()).toHaveAttribute("data-vaul-drawer-direction", "bottom");
  });

  it("anchors detail drawers to the bottom on a phone", () => {
    stubDesktop(false);
    renderDrawer({ variant: "detail" });

    expect(content()).toHaveAttribute("data-vaul-drawer-direction", "bottom");
  });

  it("moves detail drawers to the side once there is room", () => {
    stubDesktop(true);
    renderDrawer({ variant: "detail" });

    expect(content()).toHaveAttribute("data-vaul-drawer-direction", "right");
  });

  it("keeps an open detail drawer where it is when the viewport crosses lg", () => {
    // Switching anchor remounts the drawer, which would discard whatever the
    // child is holding — a half-corrected document, a half-typed form. The
    // anchor is therefore frozen until the drawer closes.
    stubDesktop(false);
    const { rerender } = render(
      <OrdiloDrawer variant="detail" open onOpenChange={vi.fn()}>
        <OrdiloDrawerHeader title="Dokument" description="Details" />
        <OrdiloDrawerBody>
          <input data-testid="draft" defaultValue="" />
        </OrdiloDrawerBody>
      </OrdiloDrawer>,
    );
    (screen.getByTestId("draft") as HTMLInputElement).value = "halb getippt";

    stubDesktop(true);
    rerender(
      <OrdiloDrawer variant="detail" open onOpenChange={vi.fn()}>
        <OrdiloDrawerHeader title="Dokument" description="Details" />
        <OrdiloDrawerBody>
          <input data-testid="draft" defaultValue="" />
        </OrdiloDrawerBody>
      </OrdiloDrawer>,
    );

    expect(content()).toHaveAttribute("data-vaul-drawer-direction", "bottom");
    expect((screen.getByTestId("draft") as HTMLInputElement).value).toBe(
      "halb getippt",
    );
  });

  it("picks up the new anchor the next time it opens", () => {
    stubDesktop(false);
    const child = (
      <OrdiloDrawerHeader title="Dokument" description="Details" />
    );
    const { rerender } = render(
      <OrdiloDrawer variant="detail" open onOpenChange={vi.fn()}>
        {child}
      </OrdiloDrawer>,
    );

    stubDesktop(true);
    rerender(
      <OrdiloDrawer variant="detail" open={false} onOpenChange={vi.fn()}>
        {child}
      </OrdiloDrawer>,
    );
    rerender(
      <OrdiloDrawer variant="detail" open onOpenChange={vi.fn()}>
        {child}
      </OrdiloDrawer>,
    );

    expect(content()).toHaveAttribute("data-vaul-drawer-direction", "right");
  });

  it("gives the body the scroll and leaves the footer pinned", () => {
    renderDrawer({
      children: (
        <>
          <OrdiloDrawerHeader title="Titel" description="Beschreibung" />
          <OrdiloDrawerBody>Inhalt</OrdiloDrawerBody>
          <OrdiloDrawerFooter>Aktionen</OrdiloDrawerFooter>
        </>
      ),
    });

    expect(document.querySelector("[data-slot=drawer-body]")).toHaveClass(
      "overflow-y-auto",
      "min-h-0",
    );
    expect(document.querySelector("[data-slot=drawer-footer]")).not.toHaveClass(
      "overflow-y-auto",
    );
  });

  it("focuses the title when a call site passes a ref to it", () => {
    function Harness() {
      const titleRef = React.useRef<HTMLHeadingElement>(null);
      return (
        <OrdiloDrawer
          variant="detail"
          open
          onOpenChange={vi.fn()}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
        >
          <OrdiloDrawerHeader
            title="Aufgabe"
            titleRef={titleRef}
            description="Aufgabe ansehen"
            descriptionHidden
          />
        </OrdiloDrawer>
      );
    }
    render(<Harness />);

    expect(screen.getByText("Aufgabe")).toHaveFocus();
  });
});
