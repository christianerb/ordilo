import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import {
  ActiveSearchProvider,
  useActiveSearch,
} from "@/lib/search/active-search-context";

/** Test consumer exposing submitQuery/setActiveHandler via buttons. */
function Consumer({
  registerEcho = false,
}: {
  registerEcho?: boolean;
}) {
  const { submitQuery, setActiveHandler } = useActiveSearch();
  const [received, setReceived] = useState<string | null>(null);

  if (registerEcho) {
    setActiveHandler((q: string) => setReceived(q));
  }

  return (
    <div>
      <button onClick={() => submitQuery("Rechnung")}>submit</button>
      <button onClick={() => setActiveHandler(null)}>unregister</button>
      {received && <span data-testid="received">{received}</span>}
    </div>
  );
}

describe("ActiveSearchContext", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("throws when used outside a provider", () => {
    // Suppress the expected React error boundary console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      /useActiveSearch must be used within an ActiveSearchProvider/,
    );
    spy.mockRestore();
  });

  it("navigates to /suche with the query when no handler is registered", () => {
    render(
      <ActiveSearchProvider>
        <Consumer />
      </ActiveSearchProvider>,
    );
    fireEvent.click(screen.getByText("submit"));
    expect(mockPush).toHaveBeenCalledWith("/suche?q=Rechnung");
  });

  it("forwards the query to the registered handler instead of navigating", () => {
    render(
      <ActiveSearchProvider>
        <Consumer registerEcho />
      </ActiveSearchProvider>,
    );
    fireEvent.click(screen.getByText("submit"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("received").textContent).toBe("Rechnung");
  });

  it("falls back to navigation again after the handler is unregistered", () => {
    render(
      <ActiveSearchProvider>
        <Consumer registerEcho />
      </ActiveSearchProvider>,
    );
    fireEvent.click(screen.getByText("unregister"));
    fireEvent.click(screen.getByText("submit"));
    expect(mockPush).toHaveBeenCalledWith("/suche?q=Rechnung");
  });
});
