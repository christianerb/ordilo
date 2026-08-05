import { AppShell } from "@/components/ordilo/app-shell";
import type { SidebarProfile } from "@/components/ordilo/app-shell-shared";
import type { CollectionInfo } from "@/lib/collections/collections-context";
import { listConversations } from "@/lib/ai/chat-history";
import {
  createClient,
  getMiddlewareFamily,
  getMiddlewareUserEmail,
} from "@/lib/supabase/server";

/**
 * Layout for authenticated app pages.
 *
 * Resolves the sidebar profile and collections ON THE SERVER and hands
 * them to the AppShell as props — the shell no longer fires three
 * client-side Supabase queries (auth.getUser + families + collections)
 * after hydration on every full page load. The layout persists across
 * SPA navigations, so this work does NOT repeat on route transitions;
 * a router.refresh() re-runs it and the shell adopts the fresh props.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  // On full page loads the middleware already verified the family (and
  // resolved the user) for the onboarding gate and forwards both via
  // request headers — only RSC refreshes need the fallback queries.
  const middlewareFamily = await getMiddlewareFamily();

  let familyId: string | null = null;
  let profile: SidebarProfile | undefined;
  if (middlewareFamily) {
    familyId = middlewareFamily.id;
    const email = await getMiddlewareUserEmail();
    profile = { familyName: middlewareFamily.name, email };
  } else {
    // auth.getUser() and the families query are independent — run them
    // concurrently.
    const [
      {
        data: { user },
      },
      { data: family },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("families").select("id, name").limit(1).maybeSingle(),
    ]);
    if (family) {
      familyId = family.id;
      profile = { familyName: family.name, email: user?.email ?? null };
    }
  }

  // RLS scopes the query to the user's family; without a family (e.g.
  // mid-onboarding) there are no collections and the query is skipped.
  const [{ data: collectionRows }, conversations] = await Promise.all([
    familyId
      ? supabase
          .from("collections")
          .select("id, name, icon, color")
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: null }),
    familyId ? listConversations(supabase, familyId).catch(() => []) : Promise.resolve([]),
  ]);

  const initialCollections: CollectionInfo[] = (collectionRows ?? []).map(
    (row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
    }),
  );

  // The composer's zoomed-in overlay surfaces recent questions as tappable
  // suggestions (titles are auto-generated from each conversation's first
  // message — see /api/chat). Newest first, capped to what the chip row can
  // reasonably hold.
  const recentQueries = conversations
    .map((c) => c.title)
    .filter((title): title is string => Boolean(title))
    .slice(0, 4);

  return (
    <AppShell
      profile={profile}
      initialCollections={initialCollections}
      recentQueries={recentQueries}
    >
      {children}
    </AppShell>
  );
}
