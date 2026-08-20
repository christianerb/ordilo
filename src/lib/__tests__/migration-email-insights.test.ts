import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0067_email_insights.sql"),
  "utf8",
);

describe("0067_email_insights migration", () => {
  it("generates a short code from an alphabet without ambiguous characters", () => {
    expect(migration).toContain(
      "alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz'",
    );
    expect(migration).toContain("return 'post-' || code;");
  });

  it("accepts the legacy address without overwriting an existing family alias", () => {
    expect(migration).toContain("^post-[0-9abcdefghjkmnpqrstvwxyz]{10}$");
    expect(migration).toContain("^dokumente\\+[a-f0-9]{32}$");
    expect(migration).not.toContain(
      "set local_part = candidate\n        where family_id = alias.family_id",
    );
  });

  it("retries a code collision instead of failing the family creation", () => {
    expect(migration).toContain("when unique_violation then");
    expect(migration).toContain("if attempt >= 8 then");
  });

  it("stores the email copy and its proposals family-scoped with RLS", () => {
    expect(migration).toContain("create table if not exists public.inbound_emails");
    expect(migration).toContain(
      "create table if not exists public.inbound_suggestions",
    );
    expect(migration).toContain(
      "alter table public.inbound_emails enable row level security",
    );
    expect(migration).toContain(
      "alter table public.inbound_suggestions enable row level security",
    );
  });

  it("grants only the decision RPCs, never a table write", () => {
    expect(migration).toContain(
      "grant execute on function public.accept_inbound_suggestion(uuid) to authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.dismiss_inbound_suggestion(uuid) to authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.decide_inbound_email_retention(uuid, boolean) to authenticated",
    );
    expect(migration).not.toContain("for update using (public.user_belongs_to_family");
  });

  it("refuses a proposal from another family and never accepts one twice", () => {
    expect(migration).toContain("Kein Zugriff auf diesen Vorschlag.");
    expect(migration).toContain("if suggestion.status <> 'pending' then");
  });

  it("makes the retention decision first-writer-wins under concurrency", () => {
    expect(migration).toContain("for update;");
    expect(migration).toContain("if target.retention <> 'pending' then");
    expect(migration).toContain("and retention = 'pending'");
  });

  it("moves the end date past midnight instead of storing a backwards event", () => {
    expect(migration).toContain("suggestion.starts_time + interval '1 hour'");
    expect(migration).toContain("then 1");
  });

  it("erases the source and every derived proposal when the family says delete", () => {
    expect(migration).toContain("body_text = case when p_keep then body_text else null end");
    expect(migration).toContain("subject = case when p_keep then subject else '' end");
    expect(migration).toContain(
      "from_address = case when p_keep then from_address else '' end",
    );
    expect(migration).toContain("if not p_keep then");
    expect(migration).toContain("delete from public.inbound_suggestions");
    expect(migration).toContain("where inbound_email_id = p_inbound_email_id");
  });
});
