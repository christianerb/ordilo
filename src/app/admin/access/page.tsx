import { redirect } from "next/navigation";
import { getCodeEligibleAdmin, getVerifiedAdmin } from "@/lib/admin/access";
import { AccessCodeForm } from "./access-code-form";

export const metadata = {
  title: "Admin-Zugang | Ordilo",
  robots: { index: false, follow: false },
};

export default async function AdminAccessPage() {
  const eligibleAdmin = await getCodeEligibleAdmin();
  if (!eligibleAdmin) redirect("/login");

  if (await getVerifiedAdmin()) redirect("/admin");

  return (
    <main className="min-h-dvh bg-[var(--canvas-warm)] px-4 py-12">
      <section className="mx-auto max-w-md rounded-ordilo-md border border-border bg-card p-6 shadow-card">
        <p className="text-sm text-muted-foreground">Ordilo intern</p>
        <h1 className="mt-2 text-xl font-semibold text-foreground">
          Admin-Zugang bestätigen
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Gib den zusätzlichen Zugangscode ein. Dieser Bereich ist nur für
          berechtigte Ordilo-Admins.
        </p>
        <div className="mt-6">
          <AccessCodeForm />
        </div>
      </section>
    </main>
  );
}
