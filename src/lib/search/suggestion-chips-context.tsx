"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Suggestion chips for the global composer.
 *
 * Pages (currently /home) register a few contextual, ready-to-send
 * questions; the AppShell composers render them as tappable chips above
 * the input. Submitting a chip behaves exactly like typing the question.
 *
 * The default context value is a no-op, so components work without the
 * provider (unit tests render pages in isolation).
 */

interface SuggestionChipsContextValue {
  chips: string[];
  setChips: (chips: string[]) => void;
}

const SuggestionChipsContext = createContext<SuggestionChipsContextValue>({
  chips: [],
  setChips: () => {},
});

export function SuggestionChipsProvider({ children }: { children: ReactNode }) {
  const [chips, setChips] = useState<string[]>([]);
  const value = useMemo(() => ({ chips, setChips }), [chips]);
  return (
    <SuggestionChipsContext.Provider value={value}>
      {children}
    </SuggestionChipsContext.Provider>
  );
}

/** Read the currently registered chips (empty when none / no provider). */
export function useSuggestionChips(): string[] {
  return useContext(SuggestionChipsContext).chips;
}

/**
 * Registers chips while mounted; clears them on unmount.
 *
 * Render it with `key={chips.join("\n")}`: when the questions change, the
 * key change forces a clean remount and the mount effect registers the
 * new set — the codebase bans dependency-array effects (direct useEffect),
 * so remounting is the sanctioned re-registration mechanism.
 */
export function SuggestionChipsRegistrar({ chips }: { chips: string[] }) {
  const { setChips } = useContext(SuggestionChipsContext);
  useMountEffect(() => {
    setChips(chips);
    return () => setChips([]);
  });
  return null;
}
