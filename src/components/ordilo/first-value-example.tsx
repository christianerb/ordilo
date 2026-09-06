"use client";

import { FIRST_VALUE_EXAMPLE as example } from "@ordilo/document-contract";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

/** Local-only demonstration. It must never enter the family's real data. */
export function FirstValueExample({ onContinue }: { onContinue?: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState(false);

  return (
    <div className="w-full space-y-3">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-full whitespace-normal"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          setAnswered(false);
        }}
      >
        {open ? "Beispiel schließen" : "Ohne eigenen Brief ausprobieren"}
      </Button>
      {open && (
        <section
          id={id}
          aria-label="Beispielbrief"
          className="space-y-4 rounded-ordilo-sm border border-border bg-card p-4 text-left"
        >
          <p className="text-xs font-medium text-[var(--petrol)]">Beispiel</p>
          <h2 className="text-lg font-semibold">{example.title}</h2>
          <p className="text-sm text-muted-foreground">{example.notice}</p>
          {!answered ? (
            <>
              <p className="text-base leading-relaxed">{example.letter}</p>
              <Button
                type="button"
                size="lg"
                className="min-h-12 w-full rounded-ordilo-md whitespace-normal"
                onClick={() => setAnswered(true)}
              >
                {example.question}
              </Button>
            </>
          ) : (
            <div aria-live="polite" className="space-y-4">
              <p className="font-medium">{example.question}</p>
              <h3 className="text-lg font-semibold text-[var(--petrol)]">
                {example.answer}
              </h3>
              <p className="text-xs font-medium text-[var(--petrol)]">
                Die Fundstelle im Beispielbrief
              </p>
              <blockquote className="text-base leading-relaxed">
                „{example.quote}“
              </blockquote>
              <p className="text-sm text-muted-foreground">{example.takeaway}</p>
              {onContinue && (
                <Button
                  type="button"
                  size="lg"
                  className="min-h-12 w-full rounded-ordilo-md whitespace-normal"
                  onClick={onContinue}
                >
                  Mit eigenem Brief loslegen
                </Button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
