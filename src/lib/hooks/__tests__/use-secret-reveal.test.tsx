import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useSecretReveal } from "@/lib/hooks/use-secret-reveal";

/** Minimal probe component exposing the hook's state and actions. */
function Probe({ documentId = "doc-1" }: { documentId?: string }) {
  const { revealed, show, reveal, copy } = useSecretReveal(documentId);
  return (
    <div>
      <span data-testid="value">{revealed == null ? "none" : revealed}</span>
      <span data-testid="show">{String(show)}</span>
      <button type="button" onClick={reveal}>
        reveal
      </button>
      <button type="button" onClick={copy}>
        copy
      </button>
    </div>
  );
}

const writeText = vi.fn().mockResolvedValue(undefined);
const readText = vi.fn().mockResolvedValue("hunter2");

describe("useSecretReveal — expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockClear();
    readText.mockClear();
    Object.assign(navigator, { clipboard: { writeText, readText } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ secret: "hunter2" }) }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function revealSecret() {
    await act(async () => {
      screen.getByText("reveal").click();
    });
  }

  it("drops the revealed value after 30 seconds", async () => {
    render(<Probe />);
    await revealSecret();

    expect(screen.getByTestId("value").textContent).toBe("hunter2");
    expect(screen.getByTestId("show").textContent).toBe("true");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // Gone from state, not merely hidden — seeing it again goes through
    // the reveal endpoint once more.
    expect(screen.getByTestId("value").textContent).toBe("none");
    expect(screen.getByTestId("show").textContent).toBe("false");
  });

  it("keeps the value while the 30 seconds are still running", async () => {
    render(<Probe />);
    await revealSecret();

    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });

    expect(screen.getByTestId("value").textContent).toBe("hunter2");
  });

  it("clears the copied password from the clipboard after 30 seconds", async () => {
    render(<Probe />);
    await revealSecret();

    await act(async () => {
      screen.getByText("copy").click();
    });
    expect(writeText).toHaveBeenCalledWith("hunter2");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("leaves a clipboard the user has since overwritten alone", async () => {
    readText.mockResolvedValue("etwas anderes");

    render(<Probe />);
    await revealSecret();
    await act(async () => {
      screen.getByText("copy").click();
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenLastCalledWith("hunter2");
  });

  it("clears anyway when the clipboard cannot be read", async () => {
    // Firefox denies readText outright; overwriting is the safer mistake
    // right after a deliberate password copy.
    readText.mockRejectedValue(new Error("not allowed"));

    render(<Probe />);
    await revealSecret();
    await act(async () => {
      screen.getByText("copy").click();
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("retries the clipboard clear when the page regains focus", async () => {
    // Writing needs document focus — it fails while the user is pasting
    // the password into another window.
    writeText.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
      new Error("document not focused"),
    );

    render(<Probe />);
    await revealSecret();
    await act(async () => {
      screen.getByText("copy").click();
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(writeText).toHaveBeenCalledTimes(2);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(writeText).toHaveBeenCalledTimes(3);
    expect(writeText).toHaveBeenLastCalledWith("");
  });
});
