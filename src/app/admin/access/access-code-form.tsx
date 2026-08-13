"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AccessCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        setError("Zugang konnte nicht bestätigt werden.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Zugang konnte nicht bestätigt werden.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="admin-code" className="text-sm font-medium text-foreground">
          Zugangscode
        </label>
        <input
          id="admin-code"
          name="code"
          type="password"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="h-10 w-full rounded-ordilo-base border border-border bg-transparent px-3 text-foreground outline-none ring-offset-background focus:border-primary focus:ring-2 focus:ring-primary/30"
          required
          disabled={pending}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="h-10 w-full rounded-ordilo-sm bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "Wird geprüft …" : "Admin-Bereich öffnen"}
      </button>
    </form>
  );
}
