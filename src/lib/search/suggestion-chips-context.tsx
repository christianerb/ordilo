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
 * The global defaults keep the composer useful on every page. Individual
 * pages, currently /home, can temporarily replace them with contextual,
 * ready-to-send questions. Submitting a chip behaves exactly like typing
 * the question.
 *
 * The default context value is still a no-op, so components work without the
 * provider (unit tests render pages in isolation).
 */

export const DEFAULT_SUGGESTION_CHIPS = [
  "Was ist überfällig?",
  "Welche Dokumente muss ich bestätigen?",
  "Was wurde zuletzt gescannt?",
];

interface SuggestionChipsContextValue {
  chips: string[];
  setChips: (chips: string[]) => void;
}

const SuggestionChipsContext = createContext<SuggestionChipsContextValue>({
  chips: [],
  setChips: () => {},
});

export function SuggestionChipsProvider({ children }: { children: ReactNode }) {
  const [chips, setChips] = useState<string[]>(DEFAULT_SUGGESTION_CHIPS);
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
 * Registers chips while mounted; restores the global defaults on unmount.
 *
 * Render it with `key={chips.join("\n")}`: when the questions change, the
 * key change forces a clean remount and the mount effect registers the
 * new set — the codebase bans dependency-array effects (direct useEffect),
 * so remounting is the sanctioned re-registration mechanism.
 */
export function SuggestionChipsRegistrar({ chips }: { chips: string[] }) {
  const { setChips } = useContext(SuggestionChipsContext);
  useMountEffect(() => {
    setChips(chips.length > 0 ? chips : DEFAULT_SUGGESTION_CHIPS);
    return () => setChips(DEFAULT_SUGGESTION_CHIPS);
  });
  return null;
}
