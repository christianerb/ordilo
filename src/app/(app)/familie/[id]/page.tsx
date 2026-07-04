import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ordilo/empty-state";
import { formatGermanDate } from "@/lib/format";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

/**
 * Person profile placeholder page (`/familie/[id]`).
 *
 * Shows the member's avatar, name, role, and birthdate. The full person
 * profile (documents per person, timeline, open tasks) is built in M5.
 * For now, this serves as a navigation target from the family management
 * page's person cards.
 *
 * The member is fetched RLS-scoped — only the authenticated user's family
 * members are accessible.
 */
export default async function PersonProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch the member by ID (RLS-scoped to the user's family).
  const { data: member } = await supabase
    .from("family_members")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // If the member doesn't exist or doesn't belong to the user's family,
  // return 404.
  if (!member) {
    notFound();
  }

  const typedMember = member as MemberRow;
  const formattedBirthdate = formatGermanDate(typedMember.birthdate);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/familie"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Familie
      </Link>

      {/* Member header — avatar + name + role + birthdate */}
      <div className="flex flex-col items-center gap-3 py-6">
        <div
          className="flex size-20 items-center justify-center rounded-full text-3xl font-semibold text-white"
          style={{
            backgroundColor: typedMember.avatar_color ?? "#305460",
          }}
          aria-hidden="true"
        >
          {typedMember.name.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {typedMember.name}
          </h1>
          {typedMember.role && typedMember.role.trim() !== "" && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {typedMember.role}
            </p>
          )}
          {formattedBirthdate && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formattedBirthdate}
            </p>
          )}
        </div>
      </div>

      {/* Placeholder for the full profile (M5) */}
      <div className="rounded-ordilo-lg border border-border bg-card p-6 shadow-card">
        <EmptyState
          icon={FileText}
          title="Demnächst verfügbar"
          description="Das vollständige Profil mit Dokumenten, Verlauf und Aufgaben wird in einem kommenden Update verfügbar sein."
        />
      </div>
    </div>
  );
}
