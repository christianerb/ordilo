"use client";

import { useRouter } from "next/navigation";

export function AdminLogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/access", { method: "DELETE" });
    router.replace("/admin/access");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-ordilo-sm px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      Admin-Zugang schließen
    </button>
  );
}
