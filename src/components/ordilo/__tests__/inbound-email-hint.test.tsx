import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InboundEmailHint } from "@/components/ordilo/inbound-email-hint";

const ADDRESS = "post-0123abcdfg@ordilo.de";

describe("InboundEmailHint", () => {
  it("shows the address with a plain-language explanation", () => {
    render(<InboundEmailHint address={ADDRESS} />);

    const hint = screen.getByTestId("inbound-email-hint");
    expect(hint).toHaveTextContent("Per E-Mail an Ordilo");
    expect(hint).toHaveTextContent(ADDRESS);
  });

  it("copies the address to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<InboundEmailHint address={ADDRESS} />);
    fireEvent.click(
      screen.getByRole("button", { name: "E-Mail-Adresse kopieren" }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ADDRESS));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "E-Mail-Adresse kopiert" }),
      ).toBeInTheDocument(),
    );
  });
});
