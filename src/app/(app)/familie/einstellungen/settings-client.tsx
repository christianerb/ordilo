"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  CalendarDays,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatGermanDate } from "@/lib/format";
import { updateFamilyName } from "../actions";

/**
 * Props for the FamilySettingsClient component.
 */
export interface FamilySettingsClientProps {
  /** The family's id (unused directly here, kept for future settings). */
  familyId?: string;
  /** The current family name. */
  familyName?: string;
  /** ISO timestamp of when the family was created. */
  createdAt?: string | null;
  /** Number of family members (for the info card). */
  memberCount?: number;
  /** When true, the server-side family query failed — shows an error state. */
  fetchError?: boolean;
}

/**
 * Family Settings — client component for `/familie/einstellungen`.
 *
 * Currently supports:
 * - Renaming the family (inline input + save button, disabled until the
 *   value actually changes)
 * - A read-only info card (member count, creation date)
 *
 * All text in German.
 */
export function FamilySettingsClient({
  familyName = "",
  createdAt,
  memberCount = 0,
  fetchError = false,
}: FamilySettingsClientProps) {
  const router = useRouter();

  const [name, setName] = useState(familyName);
  const [savedName, setSavedName] = useState(familyName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = name.trim();
  const hasChanges = trimmed !== "" && trimmed !== savedName;

  const handleNameChange = (value: string) => {
    setName(value);
    setSaved(false);
    if (error) setError(null);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setError(null);
    setIsSaving(true);
    const result = await updateFamilyName(trimmed);
    setIsSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setName(result.data.name);
    setSavedName(result.data.name);
    setSaved(true);
  };

  if (fetchError) {
    return (
      <div
        data-testid="familie-settings-fetch-error"
        className="flex flex-col items-center justify-center px-6 py-12 text-center"
      >
        <div
          className="mb-5 flex size-20 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--destructive)" }}
          aria-hidden="true"
        >
          <AlertCircle className="size-9 text-white" strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          Daten konnten nicht geladen werden
        </h3>
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Es ist ein Fehler aufgetreten. Bitte versuche es erneut.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={() => router.refresh()}
          className="mt-6 h-12 rounded-ordilo-md px-6"
        >
          <RefreshCw className="h-5 w-5" />
          Erneut versuchen
        </Button>
      </div>
    );
  }

  const formattedCreatedAt = formatGermanDate(createdAt);

  return (
    <div className="app-page-stack">
      <Link
        href="/familie"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Familie
      </Link>

      <h1 className="app-page-heading text-xl font-semibold tracking-tight text-foreground">
        Familieneinstellungen
      </h1>

      {/* Family name */}
      <div className="space-y-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card">
        <Label htmlFor="family-settings-name">Familienname</Label>
        <Input
          id="family-settings-name"
          type="text"
          autoComplete="off"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={isSaving}
          aria-invalid={error ? true : undefined}
          className="h-12 rounded-ordilo-md text-base"
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--petrol)]">
            <Check className="size-4" strokeWidth={2} aria-hidden="true" />
            Gespeichert
          </p>
        )}
        <Button
          type="button"
          size="lg"
          disabled={!hasChanges || isSaving}
          onClick={handleSave}
          className="h-12 w-full rounded-ordilo-md text-base"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird gespeichert…
            </>
          ) : (
            "Speichern"
          )}
        </Button>
      </div>

      {/* Family info */}
      <div className="space-y-4 rounded-ordilo-md border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm"
            style={{ backgroundColor: "var(--secondary)" }}
            aria-hidden="true"
          >
            <Users
              className="size-4"
              style={{ color: "var(--mist-dark)" }}
              strokeWidth={1.5}
            />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Mitglieder</p>
            <p className="font-medium text-foreground">
              {memberCount === 1 ? "1 Person" : `${memberCount} Personen`}
            </p>
          </div>
        </div>

        {formattedCreatedAt && (
          <div className="flex items-center gap-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm"
              style={{ backgroundColor: "var(--secondary)" }}
              aria-hidden="true"
            >
              <CalendarDays
                className="size-4"
                style={{ color: "var(--mist-dark)" }}
                strokeWidth={1.5}
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Erstellt am</p>
              <p className="font-medium tabular-nums text-foreground">
                {formattedCreatedAt}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
