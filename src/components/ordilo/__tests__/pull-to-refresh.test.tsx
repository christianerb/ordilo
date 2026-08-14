import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PullToRefresh } from "../pull-to-refresh";

describe("PullToRefresh", () => {
  it("refreshes only after the pull crosses the release threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>Dokumente</p>
      </PullToRefresh>,
    );

    const surface = screen.getByTestId("pull-to-refresh");
    fireEvent.touchStart(surface, { touches: [{ clientY: 20 }] });
    fireEvent.touchMove(surface, { touches: [{ clientY: 220 }] });

    expect(screen.getByText("Loslassen zum Aktualisieren")).toBeInTheDocument();

    fireEvent.touchEnd(surface);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });
});
