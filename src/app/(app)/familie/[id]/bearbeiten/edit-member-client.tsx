"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateInput } from "@/components/ordilo/date-input";
import { MemberPhotoPicker } from "@/components/ordilo/member-photo-picker";
import {
  RelationshipList,
  type RelationMemberOption,
} from "@/components/ordilo/relationship-list";
import { AVATAR_COLORS } from "@/lib/schemas/onboarding";
import type { MemberRelation } from "@/lib/family/relations";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import { removeFamilyMember, updateFamilyMember } from "../../actions";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

export interface EditMemberClientProps {
  member: MemberRow;
  relations: MemberRelation[];
  /**
   * The relationships could not be read. Editing them is off in that case:
   * saving the empty list the page fell back to would delete the stored
   * ones. Everything else on the page still saves.
   */
  relationsUnavailable?: boolean;
  photoUrl: string | null;
  otherMembers: RelationMemberOption[];
}

/**
 * "Person bearbeiten" — the full-page editor for one family member.
 *
 * Sections, top to bottom: the photo, the basics (name, birthdate, color),
 * and the relationships. Saving is one primary action at the bottom;
 * removing the person sits in the "…" menu, away from the thumb that just
 * wanted to save.
 */
export function EditMemberClient({
  member,
  relations: initialRelations,
  relationsUnavailable = false,
  photoUrl: initialPhotoUrl,
  otherMembers,
}: EditMemberClientProps) {
  const router = useRouter();

  const [name, setName] = useState(member.name);
  const [birthdate, setBirthdate] = useState(member.birthdate ?? "");
  const [avatarColor, setAvatarColor] = useState(member.avatar_color ?? "");
  const [relations, setRelations] = useState<MemberRelation[]>(initialRelations);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const profileHref = `/familie/${member.id}`;

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setValidationError(null);
      setServerError(null);

      if (!name.trim()) {
        setValidationError("Bitte einen Namen eingeben");
        return;
      }

      setIsSubmitting(true);
      const result = await updateFamilyMember(member.id, {
        name,
        birthdate: birthdate || undefined,
        avatar_color: avatarColor || undefined,
        // Omitting relations entirely tells the action to leave the stored
        // ones alone — the only safe option when they could not be read.
        relations: relationsUnavailable
          ? undefined
          : relations.filter((relation) => relation.role.trim() !== ""),
      });
      setIsSubmitting(false);

      if (!result.success) {
        setServerError(result.error);
        return;
      }

      toast.success("Gespeichert");
      router.push(profileHref);
      router.refresh();
    },
    [
      avatarColor,
      birthdate,
      member.id,
      name,
      profileHref,
      relations,
      relationsUnavailable,
      router,
    ],
  );

  const handleRemove = useCallback(async () => {
    setRemoveError(null);
    setIsRemoving(true);
    const result = await removeFamilyMember(member.id);
    setIsRemoving(false);
    if (!result.success) {
      setRemoveError(result.error);
      return;
    }
    setRemoveDialogOpen(false);
    toast.success(`${member.name} ist nicht mehr dabei`);
    router.push("/familie");
    router.refresh();
  }, [member.id, member.name, router]);

  return (
    <div className="app-page-stack">
      {/* Header — back, title, "…" */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={profileHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Zurück
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold text-foreground">
          Person bearbeiten
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Aktionen"
              data-testid="edit-member-actions"
              className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setRemoveError(null);
                setRemoveDialogOpen(true);
              }}
              data-testid="edit-member-remove"
            >
              <Trash2 className="size-4" />
              Person entfernen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Photo */}
        <div className="flex flex-col items-center gap-3 py-2">
          <MemberPhotoPicker
            memberId={member.id}
            memberName={name}
            avatarColor={avatarColor}
            photoUrl={photoUrl}
            onPhotoChange={setPhotoUrl}
            disabled={isSubmitting}
            size="lg"
          />

          {/* The color is what the circle shows until there is a photo — so
              it belongs to the photo, not to the list of facts below. */}
          {!photoUrl && (
            <div
              className="flex flex-wrap justify-center gap-2"
              role="group"
              aria-label="Farbe"
            >
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAvatarColor(avatarColor === color ? "" : color)}
                  className={cn(
                    "size-7 rounded-full transition-all",
                    avatarColor === color
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "ring-1 ring-border",
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`Farbe ${color} auswählen`}
                  aria-pressed={avatarColor === color}
                  disabled={isSubmitting}
                />
              ))}
            </div>
          )}
        </div>

        {/* Basics */}
        <section className="space-y-4 rounded-ordilo-md border border-border bg-card p-4">
          <div className="space-y-2">
            <Label htmlFor="member-name">Name</Label>
            <Input
              id="member-name"
              type="text"
              autoComplete="off"
              placeholder="z. B. Emma"
              maxLength={100}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (validationError) setValidationError(null);
                if (serverError) setServerError(null);
              }}
              aria-invalid={validationError ? true : undefined}
              disabled={isSubmitting}
              className="h-12 rounded-ordilo-md text-base"
            />
            {validationError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {validationError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-birthdate">Geburtsdatum</Label>
            <DateInput
              id="member-birthdate"
              value={birthdate}
              onChange={setBirthdate}
              disabled={isSubmitting}
              aria-label="Geburtsdatum"
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              Nur für Geburtstage und Erinnerungen in Ordilo.
            </p>
          </div>

        </section>

        {/* Relationships */}
        <section className="space-y-3 rounded-ordilo-md border border-border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Familienbeziehungen
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Wer ist {name.trim() || "diese Person"} für die anderen?
            </p>
          </div>
          {relationsUnavailable ? (
            <div
              className="flex items-start gap-2 rounded-ordilo-sm border border-border bg-secondary/50 px-3 py-2.5"
              data-testid="relations-unavailable"
            >
              <AlertCircle
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                Die Beziehungen konnten gerade nicht geladen werden. Sie
                bleiben unverändert — lade die Seite neu, um sie zu
                bearbeiten.
              </p>
            </div>
          ) : (
            <RelationshipList
              value={relations}
              onChange={setRelations}
              members={otherMembers}
              subjectName={name}
              disabled={isSubmitting}
            />
          )}
        </section>

        {serverError && (
          <div
            role="alert"
            className="rounded-ordilo-md border border-destructive/30 bg-destructive/5 px-4 py-3"
          >
            <p className="text-sm font-medium text-destructive">{serverError}</p>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="h-12 w-full rounded-ordilo-md text-base"
          data-testid="edit-member-save"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Wird gespeichert…
            </>
          ) : (
            <>
              <Check className="size-4" />
              Änderungen speichern
            </>
          )}
        </Button>
      </form>

      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="max-w-md rounded-ordilo-md">
          <DialogHeader>
            <DialogTitle>Person entfernen</DialogTitle>
            <DialogDescription>
              Möchtest du{" "}
              <span className="font-semibold text-foreground">{member.name}</span>{" "}
              wirklich entfernen? Die Beziehungen der anderen zu{" "}
              {member.name} verschwinden mit.
            </DialogDescription>
          </DialogHeader>

          {removeError && (
            <div
              role="alert"
              className="rounded-ordilo-sm border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <p className="text-sm font-medium text-destructive">{removeError}</p>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="destructive"
              disabled={isRemoving}
              onClick={handleRemove}
              className="w-full"
              data-testid="edit-member-remove-confirm"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Wird entfernt…
                </>
              ) : (
                "Entfernen"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isRemoving}
              onClick={() => setRemoveDialogOpen(false)}
              className="w-full"
            >
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
