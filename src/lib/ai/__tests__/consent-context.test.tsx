import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

import {
  AiConsentProvider,
  useAiConsent,
} from "@/lib/ai/consent-context";

/**
 * The provider is exercised through a probe that exposes the context the
 * way the real consumers (scan upload, chat submit, voice, live) use it:
 * an action awaits `ensureAiConsent()` before it may run.
 */

const mockFetch = vi.fn();

let lastEnsureResult: boolean | null = null;

function Probe() {
  const { ensureAiConsent, reviewAiConsent, status, isLoading } =
    useAiConsent();
  return (
    <div>
      <span data-testid="status">{status ?? "none"}</span>
      <span data-testid="loading">{isLoading ? "yes" : "no"}</span>
      <button
        data-testid="ensure"
        onClick={() => {
          void ensureAiConsent().then((result) => {
            lastEnsureResult = result;
          });
        }}
      >
        ensure
      </button>
      <button data-testid="review" onClick={reviewAiConsent}>
        review
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AiConsentProvider>
      <Probe />
    </AiConsentProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The provider GETs the status on mount; queue that answer. */
function givenStatus(status: "granted" | "declined" | null) {
  mockFetch.mockResolvedValueOnce(jsonResponse({ ai_data_sharing: status }));
}

describe("AiConsentProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    lastEnsureResult = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("loads the recorded decision on mount", async () => {
    givenStatus("declined");
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("declined"),
    );
    expect(screen.getByTestId("loading").textContent).toBe("no");
  });

  it("lets an action through immediately when consent is granted", async () => {
    givenStatus("granted");
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("granted"),
    );

    fireEvent.click(screen.getByTestId("ensure"));

    await waitFor(() => expect(lastEnsureResult).toBe(true));
    // No drawer, no extra requests.
    expect(screen.queryByTestId("ai-consent-drawer")).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("waits for the initial status read before deciding", async () => {
    // Cold load: a consenting user who acts while the mount GET is still
    // in flight must not see the drawer. The gate awaits the read, then
    // resolves directly — no second decision is forced.
    let resolveRead: (response: Response) => void = () => {};
    mockFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRead = resolve;
      }),
    );
    renderProvider();

    fireEvent.click(screen.getByTestId("ensure"));

    // Still waiting on the read: no drawer, no resolution yet.
    expect(screen.queryByText("Bevor Ordilo mitdenkt")).toBeNull();
    expect(lastEnsureResult).toBeNull();

    resolveRead(jsonResponse({ ai_data_sharing: "granted" }));

    await waitFor(() => expect(lastEnsureResult).toBe(true));
    expect(screen.queryByText("Bevor Ordilo mitdenkt")).toBeNull();
  });

  it("opens the drawer when never asked and records the grant", async () => {
    givenStatus(null);
    mockFetch.mockResolvedValueOnce(jsonResponse({ ai_data_sharing: "granted" }));
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );

    fireEvent.click(screen.getByTestId("ensure"));

    // The disclosure names both processors before anything is sent.
    await screen.findByText("Bevor Ordilo mitdenkt");
    expect(screen.getByText(/OpenAI/).textContent).toContain("Datalab");
    expect(lastEnsureResult).toBeNull();

    fireEvent.click(screen.getByTestId("ai-consent-accept"));

    await waitFor(() => expect(lastEnsureResult).toBe(true));
    const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/me/ai-consent");
    expect(JSON.parse(init.body as string)).toEqual({ decision: "granted" });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("granted"),
    );
  });

  it("records a decline and blocks the waiting action", async () => {
    givenStatus(null);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ai_data_sharing: "declined" }),
    );
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );

    fireEvent.click(screen.getByTestId("ensure"));
    await screen.findByText("Bevor Ordilo mitdenkt");
    fireEvent.click(screen.getByTestId("ai-consent-decline"));

    await waitFor(() => expect(lastEnsureResult).toBe(false));
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("declined"),
    );
  });

  it("treats closing the drawer as no decision and asks again next time", async () => {
    givenStatus(null);
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );

    fireEvent.click(screen.getByTestId("ensure"));
    await screen.findByText("Bevor Ordilo mitdenkt");

    // The form drawer ships a close button; using it is not a decision.
    fireEvent.click(screen.getByRole("button", { name: /schließen/i }));

    await waitFor(() => expect(lastEnsureResult).toBe(false));
    // Nothing was recorded: only the mount GET ran.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the drawer open with an error when the save fails", async () => {
    givenStatus(null);
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );

    fireEvent.click(screen.getByTestId("ensure"));
    await screen.findByText("Bevor Ordilo mitdenkt");
    fireEvent.click(screen.getByTestId("ai-consent-accept"));

    await screen.findByRole("alert");
    // The failed save neither resolves the waiting action nor closes.
    expect(lastEnsureResult).toBeNull();
    expect(screen.getByTestId("ai-consent-drawer")).toBeDefined();
  });

  it("opens the same drawer from the settings for review", async () => {
    givenStatus("granted");
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("granted"),
    );

    fireEvent.click(screen.getByTestId("review"));

    await screen.findByText("Bevor Ordilo mitdenkt");
  });
});
