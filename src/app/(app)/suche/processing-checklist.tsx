"use client";

import { useState, useMemo, useRef } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Multiple themed step sets — randomly selected per render so the
 * loading state feels alive and varied, not robotic.
 */
const STEP_SETS: string[][] = [
  ["Verstehe deine Frage", "Durchsuche Dokumente", "Prüfe Aufgaben und Fristen", "Ermittle Antwort"],
  ["Lass mich darüber nachdenken…", "Stöbere in deinen Unterlagen", "Schau nach offenen Aufgaben", "Formuliere Antwort"],
  ["Fasse deine Frage zusammen", "Suche passende Dokumente", "Prüfe Fristen und Termine", "Schreibe Antwort"],
  ["Hm, gute Frage", "Blättere durch deine Akten", "Gucke nach, was ansteht", "Fast fertig…"],
  ["Analysiere, was du brauchst", "Durchsuche deine Dokumente", "Prüfe Aufgaben und Kalender", "Stelle Antwort zusammen"],
  ["Sammle Kontext", "Suche in deinem Archiv", "Ordne Fristen und ToDos", "Ermittle Antwort"],
];

const HEADER_PHRASES = [
  "Ordilo denkt nach",
  "Suche in deinen Unterlagen",
  "Prüfe deine Dokumente",
  "Ermittle die beste Antwort",
];

const BASE_STEP_MS = 700;
const STEP_JITTER_MS = 200;

export function ProcessingChecklist() {
  const stepSet = useMemo(
    () => STEP_SETS[Math.floor(Math.random() * STEP_SETS.length)],
    [],
  );
  const headerStart = useMemo(
    () => Math.floor(Math.random() * HEADER_PHRASES.length),
    [],
  );

  const [activeStep, setActiveStep] = useState(0);
  const [headerIdx, setHeaderIdx] = useState(headerStart);
  const activeStepRef = useRef(activeStep);
  activeStepRef.current = activeStep;
  const stepCountRef = useRef(stepSet.length);
  stepCountRef.current = stepSet.length;

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const prefersReducedMotionRef = useRef(prefersReducedMotion);
  prefersReducedMotionRef.current = prefersReducedMotion;

  useMountEffect(() => {
    if (prefersReducedMotionRef.current) return;

    let timer: number | null = null;
    let cancelled = false;

    const scheduleNextStep = () => {
      if (cancelled) return;
      if (activeStepRef.current >= stepCountRef.current - 1) return;

      const delay = BASE_STEP_MS + Math.random() * STEP_JITTER_MS;
      timer = window.setTimeout(() => {
        setActiveStep((prev) => {
          const next = Math.min(prev + 1, stepCountRef.current - 1);
          activeStepRef.current = next;
          return next;
        });
        scheduleNextStep();
      }, delay);
    };

    scheduleNextStep();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  });

  // Header phrase rotation
  useMountEffect(() => {
    if (prefersReducedMotion) return;

    const interval = setInterval(() => {
      setHeaderIdx((prev) => (prev + 1) % HEADER_PHRASES.length);
    }, 1400);

    return () => clearInterval(interval);
  });

  const headerPhrase = HEADER_PHRASES[headerIdx];

  return (
    <div
      data-testid="processing-checklist"
      className="space-y-2.5"
      role="status"
      aria-label="Ordilo denkt nach"
    >
      {/* Rotating header with sparkle icon */}
      <div className="flex items-center gap-2">
        <Sparkles
          className="size-3.5 shrink-0 animate-pulse"
          style={{ color: "var(--petrol)" }}
          aria-hidden="true"
        />
        <span
          key={headerPhrase}
          className="text-sm font-medium text-foreground animate-in fade-in slide-in-from-bottom-1 duration-300"
        >
          {headerPhrase}…
        </span>
      </div>

      {/* Steps — timeline with left border */}
      <div className="ml-5 space-y-1.5 border-l border-border/40 pl-3">
        {stepSet.map((step, i) => {
          const status =
            i < activeStep ? "done" : i === activeStep ? "active" : "pending";

          return (
            <div
              key={`${stepSet}-${i}`}
              data-testid="processing-step"
              data-status={status}
              className={cn(
                "flex items-center gap-2 text-sm transition-all duration-300",
                status === "done" && "text-muted-foreground/50",
                status === "active" && "text-foreground animate-in fade-in slide-in-from-left-1 duration-300",
                status === "pending" && "text-muted-foreground/20",
              )}
            >
              {status === "done" && (
                <CheckCircle2
                  className="size-3.5 shrink-0"
                  style={{ color: "var(--petrol)" }}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              )}
              {status === "active" && (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-[var(--petrol)] animate-pulse"
                  aria-hidden="true"
                />
              )}
              {status === "pending" && (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-border"
                  aria-hidden="true"
                />
              )}
              <span className={status === "active" ? "font-medium" : ""}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
