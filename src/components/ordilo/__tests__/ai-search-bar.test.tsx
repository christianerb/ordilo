import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockCancel = vi.fn();
const mockSubscribeLevels = vi.fn(() => () => {});
const mockLevels = new Array(24).fill(0);
const mockGetLevels = vi.fn(() => mockLevels);
let mockVoiceStatus = "idle";
let voiceCallbacks: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
};

class MockSpeechRecognition {
  static instance: MockSpeechRecognition | null = null;

  lang = "";
  interimResults = false;
  maxAlternatives = 0;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  onresult: ((event: {
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    MockSpeechRecognition.instance = this;
  }

  emitFinal(transcript: string) {
    this.onresult?.({
      results: [{ isFinal: true, 0: { transcript } }],
    });
  }
}

vi.mock("@/lib/realtime/use-realtime-transcription", () => ({
  useRealtimeTranscription: vi.fn(
    (callbacks: typeof voiceCallbacks) => {
      voiceCallbacks = callbacks;
      return {
        status: mockVoiceStatus,
        start: mockStart,
        stop: mockStop,
        cancel: mockCancel,
        subscribeLevels: mockSubscribeLevels,
        getLevels: mockGetLevels,
      };
    },
  ),
}));

import { AISearchBar } from "@/components/ordilo/ai-search-bar";

describe("AISearchBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockSpeechRecognition.instance = null;
    mockVoiceStatus = "idle";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a text input", () => {
    render(<AISearchBar onSubmit={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("renders the Ordilo elephant mark", () => {
    const { container } = render(<AISearchBar onSubmit={vi.fn()} />);
    expect(
      container.querySelector('[data-part="elephant-silhouette"]'),
    ).not.toBeNull();
  });

  it("renders a send button", () => {
    render(<AISearchBar onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /senden/i })).toBeDefined();
  });

  it("does not call onSubmit when Enter is pressed (without Shift)", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Zeig mir Dokumente" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit when Shift+Enter is pressed", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Mehrzeilige\nEingabe" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ["Cmd", { metaKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Alt", { altKey: true }],
  ])("calls onSubmit when %s+Enter is pressed", (_label, modifier) => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Finde die letzte Rechnung" } });
    fireEvent.keyDown(input, { key: "Enter", ...modifier });

    expect(onSubmit).toHaveBeenCalledWith("Finde die letzte Rechnung");
  });

  it("calls onSubmit when the send button is clicked", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Finde Rechnung" } });
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(onSubmit).toHaveBeenCalledWith("Finde Rechnung");
  });

  it("does not call onSubmit when input is empty or whitespace only", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the input after successful submit via button", () => {
    render(<AISearchBar onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Test query" } });
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(input.value).toBe("");
  });

  it("accepts an initial value", () => {
    render(<AISearchBar onSubmit={vi.fn()} initialValue="Vorausgefüllt" />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toBe("Vorausgefüllt");
  });

  it("disables input and button when isLoading is true", () => {
    render(<AISearchBar onSubmit={vi.fn()} isLoading={true} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    const button = screen.getByRole("button", {
      name: /senden/i,
    }) as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(button.disabled).toBe(true);
  });

  it("does not call onSubmit when disabled (isLoading)", () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} isLoading={true} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.click(
      screen.getByRole("button", { name: /senden/i }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a single row regardless of layout", () => {
    const { unmount } = render(<AISearchBar onSubmit={vi.fn()} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).rows).toBe(1);
    unmount();

    render(<AISearchBar onSubmit={vi.fn()} layout="stacked" />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).rows).toBe(1);
  });

  it("uses the provided placeholder text", () => {
    render(
      <AISearchBar
        onSubmit={vi.fn()}
        placeholder="Frage Ordilo…"
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.getAttribute("placeholder")).toBe("Frage Ordilo…");
  });

  it("uses native speech recognition in a regular browser tab", () => {
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Mit Sprache fragen" }),
    );

    const recognition = MockSpeechRecognition.instance;
    expect(recognition).not.toBeNull();
    expect(recognition?.start).toHaveBeenCalledOnce();
    expect(mockStart).not.toHaveBeenCalled();
    expect(screen.getByTestId("voice-level-meter").children).toHaveLength(12);

    act(() => {
      recognition?.emitFinal("Zeig mir Rechnungen von gestern");
    });

    expect(onSubmit).toHaveBeenCalledWith("Zeig mir Rechnungen von gestern");
  });

  it("uses Realtime transcription in an installed PWA", () => {
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<AISearchBar onSubmit={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Mit Sprache fragen" }),
    );

    expect(mockStart).toHaveBeenCalledOnce();
    expect(MockSpeechRecognition.instance).toBeNull();
  });

  it("renders the Realtime waveform while listening", () => {
    mockVoiceStatus = "connecting";
    render(<AISearchBar onSubmit={vi.fn()} />);

    expect(screen.getByTestId("voice-level-meter").children).toHaveLength(24);
  });

  it("falls back to Realtime when native speech recognition fails", () => {
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
    render(<AISearchBar onSubmit={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Mit Sprache fragen" }),
    );
    act(() => {
      MockSpeechRecognition.instance?.onerror?.();
    });

    expect(mockStart).toHaveBeenCalledOnce();
  });

  it("submits the final Realtime voice transcript", async () => {
    const onSubmit = vi.fn();
    render(<AISearchBar onSubmit={onSubmit} />);

    await act(async () => {
      voiceCallbacks.onTranscript("Zeig mir Rechnungen von gestern");
    });

    expect(onSubmit).toHaveBeenCalledWith(
      "Zeig mir Rechnungen von gestern",
    );
  });
});

describe("AISearchBar — Controlled mode", () => {
  it("renders the provided value when controlled", () => {
    render(
      <AISearchBar
        onSubmit={vi.fn()}
        value="Vorausgefüllt"
        onValueChange={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toBe("Vorausgefüllt");
  });

  it("calls onValueChange when the user types in controlled mode", () => {
    const onValueChange = vi.fn();
    render(
      <AISearchBar
        onSubmit={vi.fn()}
        value=""
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Neuer Text" } });
    expect(onValueChange).toHaveBeenCalledWith("Neuer Text");
  });

  it("does not call onSubmit when the controlled value is empty", () => {
    const onSubmit = vi.fn();
    render(
      <AISearchBar
        onSubmit={onSubmit}
        value=""
        onValueChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the controlled value and clears via onValueChange", () => {
    const onSubmit = vi.fn();
    const onValueChange = vi.fn();
    render(
      <AISearchBar
        onSubmit={onSubmit}
        value="Finde Rechnung"
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /senden/i }));
    expect(onSubmit).toHaveBeenCalledWith("Finde Rechnung");
    // After submit, the bar clears by notifying the parent.
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("renders a controlled value without auto-submitting (parent controls submission)", () => {
    const onSubmit = vi.fn();
    const onValueChange = vi.fn();
    render(
      <AISearchBar
        onSubmit={onSubmit}
        value="Zeig mir alle Dokumente von Emma"
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    // The AISearchBar renders the controlled value but does not auto-submit
    // on value change — submission happens via Enter/Send button or by the
    // parent calling onSubmit directly (e.g. example-click autosubmit).
    expect(input.value).toBe("Zeig mir alle Dokumente von Emma");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
