import { Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-ordilo-lg bg-primary text-primary-foreground shadow-card">
          <Sparkles className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Ordilo
          </h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Dein privater AI-Familienordner. Das Projekt wurde erfolgreich
            eingerichtet.
          </p>
        </div>
      </div>
    </main>
  );
}
