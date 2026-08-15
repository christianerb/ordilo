import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WelcomeIntro } from "../welcome-intro";

const { markWelcomeIntroSeen } = vi.hoisted(() => ({
  markWelcomeIntroSeen: vi.fn(),
}));

vi.mock("../actions", () => ({ markWelcomeIntroSeen }));

// The component leaves via window.location.assign, which jsdom cannot do.
const assign = vi.fn();

describe("WelcomeIntro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markWelcomeIntroSeen.mockResolvedValue({ success: true });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
  });

  it("greets the joined member by their new family", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

    expect(screen.getByTestId("welcome-intro")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Willkommen bei „Familie Erb“" }),
    ).toBeInTheDocument();
  });

  // The whole point of the intro: it explains, it does not assign work.
  it("asks for nothing — no inputs, no required choices", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("welcome-skip-button")).toBeInTheDocument();
  });

  it("steps through all three cards and only then offers the finish", () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

    expect(screen.getByTestId("welcome-card-0")).toBeInTheDocument();
    expect(screen.getByText("Alles an einem Ort")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("welcome-next-button"));
    expect(screen.getByText("Abfotografieren reicht")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("welcome-next-button"));
    expect(screen.getByText("Einfach fragen")).toBeInTheDocument();

    // Last card: finishing replaces skipping.
    expect(screen.getByTestId("welcome-next-button")).toHaveTextContent(
      "Los geht's",
    );
    expect(screen.queryByTestId("welcome-skip-button")).not.toBeInTheDocument();
  });

  it("records the acknowledgement when skipping, so it does not return", async () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

    fireEvent.click(screen.getByTestId("welcome-skip-button"));

    await waitFor(() => expect(markWelcomeIntroSeen).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith("/home");
  });

  it("records the acknowledgement when finishing", async () => {
    render(<WelcomeIntro familyName="Familie Erb" />);

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

    fireEvent.click(screen.getByTestId("welcome-skip-button"));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/home"));
  });

  it("does not record twice on a double tap", async () => {
    markWelcomeIntroSeen.mockReturnValue(new Promise(() => {}));
    render(<WelcomeIntro familyName="Familie Erb" />);

    const skip = screen.getByTestId("welcome-skip-button");
    fireEvent.click(skip);
    fireEvent.click(skip);

    await waitFor(() => expect(markWelcomeIntroSeen).toHaveBeenCalledTimes(1));
  });
});
