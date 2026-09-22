import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("erb family plus grant migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0090_erb_family_plus_grant.sql"),
    "utf8",
  );

  it("grants the operating family an indefinite active Plus entitlement", () => {
    expect(migration).toContain("insert into public.family_entitlements");
    expect(migration).toContain("select id, 'plus', 'active'");
    expect(migration).toContain("lower(name) like '%erb%'");
  });

  it("is re-appliable and never overwrites a later non-free state", () => {
    expect(migration).toContain("on conflict (family_id) do update");
    expect(migration).toContain("where public.family_entitlements.status = 'free'");
  });

  it("stays provider-neutral so the constraint checks keep passing", () => {
    expect(migration).toContain("null, null, null, false");
    expect(migration).not.toContain("provider_customer_id");
    expect(migration).not.toContain("provider_subscription_id");
  });
});
