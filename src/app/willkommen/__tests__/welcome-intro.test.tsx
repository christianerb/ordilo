import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WelcomeIntro } from "../welcome-intro";

const { markWelcomeIntroSeen } = vi.hoisted(() => ({
  markWelcomeIntroSeen: vi.fn(),
}));

vi.mock("../actions", () => ({ markWelcomeIntroSeen }));

// The component leaves via window.location.assign, which jsdom cannot do.
const assign = vi.fn();

function swipe(element: HTMLElement, fromX: number, toX: number) {
  fireEvent.touchStart(element, { touches: [{ clientX: fromX, clientY: 100 }] });
  fireEvent.touchEnd(element, {
    changedTouches: [{ clientX: toX, clientY: 100 }],
  });
}

describe("WelcomeIntro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markWelcomeIntroSeen.mockResolvedValue({ success: true });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
  });

  // ---------------------------------------------------------------------------
  // Arrival — the single welcome moment.
  // ---------------------------------------------------------------------------

  it("opens with the celebration and greets the joined member by family", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

    expect(screen.getByTestId("welcome-arrival")).toBeInTheDocument();
    expect(screen.getByTestId("invite-join-celebration")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Willkommen in der Familie" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/„Familie Erb“/)).toBeInTheDocument();
  });

  it("offers a direct exit from the arrival that records the acknowledgement", async () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

    fireEvent.click(screen.getByTestId("welcome-direct-button"));

    await waitFor(() => expect(markWelcomeIntroSeen).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith("/home");
  });

  // The whole point of the intro: it explains, it does not assign work.
  it("asks for nothing across all steps — no inputs, no required choices", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("welcome-start-button"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("welcome-skip-button")).toBeInTheDocument();
  });

  // Regression: the intro must not welcome twice — the celebration is the
  // ONLY screen that says "Willkommen"; the cards get to work.
  it("never repeats the welcome on the cards", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

    fireEvent.click(screen.getByTestId("welcome-start-button"));

    expect(screen.queryByText(/Willkommen/)).not.toBeInTheDocument();
    expect(screen.getByText("So funktioniert Ordilo")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Cards — show, don't tell.
  // ---------------------------------------------------------------------------

  it("steps through all three cards and only then offers the finish", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);
    fireEvent.click(screen.getByTestId("welcome-start-button"));

    expect(screen.getByTestId("welcome-card-0")).toBeInTheDocument();
    expect(screen.getByText("Alles an einem Ort")).toBeInTheDocument();
    // The vignette shows real document rows, not just an icon.
    expect(screen.getByText("Kfz-Versicherung")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("welcome-next-button"));
    expect(screen.getByText("Abfotografieren reicht")).toBeInTheDocument();
    expect(screen.getByText("Frist: 31. März")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("welcome-next-button"));
    expect(screen.getByText("Einfach fragen")).toBeInTheDocument();
    expect(
      screen.getByText("Wann läuft die Kfz-Versicherung ab?"),
    ).toBeInTheDocument();

    // Last card: finishing replaces skipping.
    expect(screen.getByTestId("welcome-next-button")).toHaveTextContent(
      "Los geht's",
    );
    expect(screen.queryByTestId("welcome-skip-button")).not.toBeInTheDocument();
  });

  it("lets the dots jump directly between cards", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);
    fireEvent.click(screen.getByTestId("welcome-start-button"));

    fireEvent.click(screen.getByTestId("welcome-dot-2"));
    expect(screen.getByText("Einfach fragen")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-dot-2")).toHaveAttribute(
      "aria-current",
      "step",
    );
    const activeFill = screen.getByTestId("welcome-dot-2").querySelector(
      "span > span",
    );
    expect(activeFill?.className).toContain("scale-x-100");
    expect(activeFill?.className).not.toMatch(/\bw-(?:1\.5|6)\b/);

    fireEvent.click(screen.getByTestId("welcome-dot-0"));
    expect(screen.getByText("Alles an einem Ort")).toBeInTheDocument();
  });

  it("supports swiping forward and back between cards", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);
    fireEvent.click(screen.getByTestId("welcome-start-button"));
    const surface = screen.getByTestId("welcome-intro");

    swipe(surface, 300, 100); // left → next
    expect(screen.getByText("Abfotografieren reicht")).toBeInTheDocument();

    swipe(surface, 100, 300); // right → back
    expect(screen.getByText("Alles an einem Ort")).toBeInTheDocument();
  });

  it("ignores vertical scrolling and tiny horizontal movements", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);
    fireEvent.click(screen.getByTestId("welcome-start-button"));
    const surface = screen.getByTestId("welcome-intro");

    // Mostly vertical — a scroll, not a swipe.
    fireEvent.touchStart(surface, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(surface, {
      changedTouches: [{ clientX: 120, clientY: 400 }],
    });
    // Below the threshold.
    swipe(surface, 200, 180);

    expect(screen.getByText("Alles an einem Ort")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Leaving — the acknowledgement must be recorded on every exit.
  // ---------------------------------------------------------------------------

  it("records the acknowledgement when skipping from a card", async () => {
    render(<WelcomeIntro familyName="Familie Erb" />);
    fireEvent.click(screen.getByTestId("welcome-start-button"));

    fireEvent.click(screen.getByTestId("welcome-skip-button"));

    await waitFor(() => expect(markWelcomeIntroSeen).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith("/home");
  });

  it("records the acknowledgement when finishing the last card", async () => {
    render(<WelcomeIntro familyName="Familie Erb" />);
    fireEvent.click(screen.getByTestId("welcome-start-button"));
    fireEvent.click(screen.getByTestId("welcome-next-button"));
    fireEvent.click(screen.getByTestId("welcome-next-button"));
    fireEvent.click(screen.getByTestId("welcome-next-button"));

    await waitFor(() => expect(markWelcomeIntroSeen).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith("/home");
  });

  // A failed marker write must not strand someone on the intro — worst
  // case they see it once more.
  it("continues into the app even when the acknowledgement fails", async () => {
    markWelcomeIntroSeen.mockResolvedValue({ success: false, error: "kaputt" });
    render(<WelcomeIntro familyName={null} />);

    fireEvent.click(screen.getByTestId("welcome-direct-button"));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/home"));
  });

  it("does not record twice on a double tap", async () => {
    markWelcomeIntroSeen.mockReturnValue(new Promise(() => {}));
    render(<WelcomeIntro familyName="Familie Erb" />);
    fireEvent.click(screen.getByTestId("welcome-start-button"));

    const skip = screen.getByTestId("welcome-skip-button");
    fireEvent.click(skip);
    fireEvent.click(skip);

    await waitFor(() => expect(markWelcomeIntroSeen).toHaveBeenCalledTimes(1));
  });
});
