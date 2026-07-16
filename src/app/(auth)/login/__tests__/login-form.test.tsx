import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginForm } from "../login-form";

const { signInWithOtp, verifyOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithOtp, verifyOtp },
  })),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOtp.mockResolvedValue({ error: null });
    verifyOtp.mockResolvedValue({ error: null });
  });

  it("sends a code without an email redirect", async () => {
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
      target: { value: "familie@example.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /loslegen/i }).closest("form")!,
    );

    await screen.findByLabelText("Ziffer 1 des Anmelde-Codes");

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "familie@example.com",
    });
  });

  it("verifies the six-digit code for the requested email", async () => {
    verifyOtp.mockResolvedValue({ error: new Error("invalid token") });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
      target: { value: "familie@example.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /loslegen/i }).closest("form")!,
    );
    await screen.findByLabelText("Ziffer 1 des Anmelde-Codes");

    fireEvent.change(screen.getByLabelText("Ziffer 1 des Anmelde-Codes"), {
      target: { value: "123456" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Anmelden" }).closest("form")!,
    );

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({
        email: "familie@example.com",
        token: "123456",
        type: "email",
      }),
    );
    expect(
      await screen.findByText("Der Code ist nicht gültig oder abgelaufen. Bitte hol dir einen neuen."),
    ).toBeDefined();
  });
});
