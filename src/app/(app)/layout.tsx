import { logout } from "./actions";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Layout for authenticated app pages.
 *
 * Renders a minimal top bar with a logout affordance. The full app shell
 * (bottom tab navigation, etc.) is added by a subsequent feature.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="flex items-center justify-end px-4 py-3">
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Abmelden
          </Button>
        </form>
      </div>
      <main className="px-4 pb-8">{children}</main>
    </div>
  );
}
