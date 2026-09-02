/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A tiny in-memory stand-in for the Supabase client, good enough to render
 * every screen with fixture data in the web preview. It understands the
 * query-builder subset the app uses (select/eq/neq/in/order/range/limit/
 * maybeSingle/single, count heads, insert/update) and answers everything
 * else with an empty success. Never used in a real build: metro only maps
 * src/lib/supabase here when ORDILO_PREVIEW=1.
 */
import { FAMILY_ID, session, tables } from "./fixtures";

type Filter = (row: Record<string, any>) => boolean;

function column(row: Record<string, any>, name: string): any {
  return row[name];
}

class Query implements PromiseLike<any> {
  private filters: Filter[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private from = 0;
  private to = Number.POSITIVE_INFINITY;
  private singleMode: "none" | "maybe" | "strict" = "none";
  private count = false;
  private head = false;
  private mutation: { kind: "insert" | "update" | "delete"; values?: any } | null = null;

  constructor(private readonly table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (options?.count) this.count = true;
    if (options?.head) this.head = true;
    return this;
  }
  insert(values: any) { this.mutation = { kind: "insert", values }; return this; }
  update(values: any) { this.mutation = { kind: "update", values }; return this; }
  delete() { this.mutation = { kind: "delete" }; return this; }
  eq(name: string, value: any) { this.filters.push((row) => column(row, name) === value); return this; }
  neq(name: string, value: any) { this.filters.push((row) => column(row, name) !== value); return this; }
  in(name: string, values: any[]) { this.filters.push((row) => values.includes(column(row, name))); return this; }
  is(name: string, value: any) { this.filters.push((row) => column(row, name) === value); return this; }
  not(name: string, _op: string, value: any) { this.filters.push((row) => column(row, name) !== value); return this; }
  gte(name: string, value: any) { this.filters.push((row) => String(column(row, name)) >= String(value)); return this; }
  lte(name: string, value: any) { this.filters.push((row) => String(column(row, name)) <= String(value)); return this; }
  gt(name: string, value: any) { this.filters.push((row) => String(column(row, name)) > String(value)); return this; }
  lt(name: string, value: any) { this.filters.push((row) => String(column(row, name)) < String(value)); return this; }
  or(_expression: string) { return this; }
  ilike(name: string, pattern: string) {
    const needle = pattern.replace(/%/g, "").toLowerCase();
    this.filters.push((row) => String(column(row, name) ?? "").toLowerCase().includes(needle));
    return this;
  }
  order(name: string, options?: { ascending?: boolean }) {
    this.orders.push({ column: name, ascending: options?.ascending ?? true });
    return this;
  }
  range(from: number, to: number) { this.from = from; this.to = to; return this; }
  limit(count: number) { this.to = Math.min(this.to, this.from + count - 1); return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "strict"; return this; }

  private resolve() {
    const rows = tables[this.table] ?? [];
    if (this.mutation?.kind === "insert") {
      const values = Array.isArray(this.mutation.values) ? this.mutation.values : [this.mutation.values];
      const inserted = values.map((value, index) => ({
        id: `new-${this.table}-${Date.now()}-${index}`,
        created_at: new Date().toISOString(),
        ...value,
      }));
      rows.push(...inserted);
      return { data: this.singleMode === "none" ? inserted : inserted[0], error: null, count: null };
    }
    if (this.mutation?.kind === "update") {
      const values = this.mutation.values;
      const updated = rows.filter((row) => this.filters.every((filter) => filter(row)));
      for (const row of updated) Object.assign(row, values);
      return { data: this.singleMode === "none" ? updated : updated[0] ?? null, error: null, count: null };
    }
    if (this.mutation?.kind === "delete") {
      return { data: null, error: null, count: null };
    }
    let result = rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const order of [...this.orders].reverse()) {
      result = [...result].sort((a, b) => {
        const left = String(column(a, order.column) ?? "");
        const right = String(column(b, order.column) ?? "");
        return order.ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }
    const total = result.length;
    result = result.slice(this.from, this.to + 1);
    if (this.head) return { data: null, error: null, count: total };
    if (this.singleMode !== "none") {
      return { data: result[0] ?? null, error: null, count: this.count ? total : null };
    }
    return { data: result, error: null, count: this.count ? total : null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return new Promise((resolve) => setTimeout(() => resolve(this.resolve()), 40)).then(onfulfilled, onrejected);
  }
}

const listeners = new Set<(event: string, session: any) => void>();

const fakeClient = {
  auth: {
    async getSession() { return { data: { session }, error: null }; },
    async getUser() { return { data: { user: session.user }, error: null }; },
    onAuthStateChange(callback: (event: string, session: any) => void) {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    startAutoRefresh() {},
    stopAutoRefresh() {},
    async signOut() { return { error: null }; },
    async signInWithOtp() { return { data: {}, error: null }; },
    async verifyOtp() { return { data: { session }, error: null }; },
  },
  from(table: string) { return new Query(table); },
  async rpc(name: string) {
    if (name === "get_family_invite_info") return { data: { family_name: "Müller", status: "valid" }, error: null };
    return { data: null, error: null };
  },
  channel() {
    const channel: any = { on: () => channel, subscribe: () => channel, unsubscribe: async () => "ok" };
    return channel;
  },
  removeChannel() { return Promise.resolve("ok"); },
};

export function getSupabase() {
  return fakeClient as any;
}

export const PREVIEW_FAMILY_ID = FAMILY_ID;
