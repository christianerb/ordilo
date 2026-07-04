import { createClient } from "@/lib/supabase/server";

/**
 * Home dashboard (placeholder).
 *
 * The full home dashboard is built by a subsequent feature. This minimal
 * page confirms the user is authenticated and serves as the returning-user
 * landing destination after login.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Willkommen zurück
      </h1>
      <p className="text-sm text-muted-foreground">
        Du bist angemeldet{user?.email ? ` als ${user.email}` : ""}.
      </p>
    </div>
  );
}
