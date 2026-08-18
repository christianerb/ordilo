"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Building2,
  Mail,
  Phone,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OrdiloDrawer,
  OrdiloDrawerFooter,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import { EmptyState } from "@/components/ordilo/empty-state";
import {
  buildWhatsAppHref,
  type ContactInput,
} from "@/lib/contacts";
import { ContactActionLinks } from "@/components/ordilo/contact-actions";
import {
  createContact,
  updateContact,
  type ContactRow,
} from "./actions";

const EMPTY_CONTACT: ContactInput = {
  name: "",
  organization: "",
  role: "",
  phone: "",
  email: "",
};

export function ContactsView({
  initialContacts,
  onOpenSource,
}: {
  initialContacts: ContactRow[];
  onOpenSource: (documentId: string) => void;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ContactRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);

  const suggestions = contacts.filter((contact) => contact.status === "suggested");
  const confirmed = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de");
    return contacts
      .filter((contact) => contact.status === "confirmed")
      .filter((contact) => {
        if (!needle) return true;
        return [contact.name, contact.organization, contact.role, contact.phone, contact.email]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("de")
          .includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [contacts, search]);

  return (
    <div className="space-y-5 animate-card-in" data-testid="contacts-view">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name oder Organisation"
            aria-label="Kontakte durchsuchen"
            className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        <Button
          size="icon"
          className="size-12 shrink-0 rounded-full"
          aria-label="Kontakt hinzufügen"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-5" />
        </Button>
      </div>

      {suggestions.length > 0 && (
        <section aria-labelledby="contact-suggestions-heading">
          <h2 id="contact-suggestions-heading" className="mb-2 text-sm font-semibold">
            In Dokumenten gefunden
          </h2>
          <div className="space-y-2">
            {suggestions.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center gap-3 rounded-ordilo-sm border border-[color-mix(in_srgb,var(--petrol)_24%,var(--border))] bg-[var(--wash-sage)] p-3"
              >
                <ContactAvatar name={contact.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{contact.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {contact.organization || contact.phone || contact.email}
                  </p>
                </div>
                {contact.source_document_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenSource(contact.source_document_id!)}
                  >
                    Prüfen
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {confirmed.length > 0 ? (
        <section aria-labelledby="confirmed-contacts-heading">
          <h2 id="confirmed-contacts-heading" className="mb-2 text-sm font-semibold">
            Kontakte
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-ordilo-sm border border-border bg-[var(--sand)] shadow-card">
            {confirmed.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelected(contact)}
                className="flex min-h-20 w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--sand-warm)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
              >
                <ContactAvatar name={contact.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{contact.name}</span>
                  {(contact.organization || contact.role) && (
                    <span className="block truncate text-sm text-muted-foreground">
                      {[contact.organization, contact.role].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <span className="block truncate text-sm text-[var(--petrol)]">
                    {contact.phone || contact.email}
                  </span>
                </span>
                <span className="text-lg text-muted-foreground" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      ) : suggestions.length === 0 ? (
        <EmptyState
          title={search ? "Kein Kontakt gefunden" : "Noch keine Kontakte"}
          description={
            search
              ? "Versuch es mit einem anderen Namen."
              : "Ordilo erkennt Kontaktdaten in Dokumenten. Du kannst auch selbst einen Kontakt anlegen."
          }
          actionLabel={search ? undefined : "Kontakt hinzufügen"}
          onAction={
            search
              ? undefined
              : () => {
                  setEditing(null);
                  setFormOpen(true);
                }
          }
        />
      ) : null}

      <ContactDetail
        contact={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onEdit={(contact) => {
          setSelected(null);
          setEditing(contact);
          setFormOpen(true);
        }}
        onOpenSource={onOpenSource}
      />
      <ContactForm
        open={formOpen}
        contact={editing}
        onOpenChange={setFormOpen}
        onSaved={(contact) => {
          setContacts((current) => {
            const exists = current.some((item) => item.id === contact.id);
            return exists
              ? current.map((item) => (item.id === contact.id ? contact : item))
              : [...current, contact];
          });
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function ContactAvatar({ name }: { name: string }) {
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)] text-sm font-semibold text-white"
      aria-hidden="true"
    >
      {name.trim().charAt(0).toLocaleUpperCase("de") || "?"}
    </span>
  );
}

function ContactDetail({
  contact,
  onOpenChange,
  onEdit,
  onOpenSource,
}: {
  contact: ContactRow | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (contact: ContactRow) => void;
  onOpenSource: (documentId: string) => void;
}) {
  if (!contact) return null;
  const whatsapp = contact.phone ? buildWhatsAppHref(contact.phone) : null;

  return (
    <OrdiloDrawer variant="detail" open onOpenChange={onOpenChange}>
      <OrdiloDrawerHeader
        title={contact.name}
        description={[contact.organization, contact.role].filter(Boolean).join(" · ") || "Kontakt"}
      />
      <div className="space-y-5 p-4">
        <ContactActionLinks phone={contact.phone} email={contact.email} />
        <dl className="divide-y divide-border rounded-ordilo-sm border border-border bg-[var(--sand)] px-3">
          {contact.phone && <ContactValue icon={Phone} label="Telefon" value={contact.phone} />}
          {contact.email && <ContactValue icon={Mail} label="E-Mail" value={contact.email} />}
          {contact.organization && (
            <ContactValue icon={Building2} label="Organisation" value={contact.organization} />
          )}
        </dl>
        {contact.phone && !whatsapp && (
          <p className="text-xs text-muted-foreground">
            Für WhatsApp braucht die Nummer eine internationale Vorwahl, zum Beispiel +49.
          </p>
        )}
        {contact.source_document_id && (
          <button
            type="button"
            onClick={() => onOpenSource(contact.source_document_id!)}
            className="text-sm font-medium text-[var(--petrol)] hover:underline"
          >
            Quelldokument öffnen
          </button>
        )}
      </div>
      <OrdiloDrawerFooter>
        <Button variant="outline" className="w-full" onClick={() => onEdit(contact)}>
          Kontakt bearbeiten
        </Button>
      </OrdiloDrawerFooter>
    </OrdiloDrawer>
  );
}

function ContactValue({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Icon className="size-4 text-muted-foreground" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 truncate text-sm">{value}</dd>
    </div>
  );
}

function ContactForm({
  open,
  contact,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  contact: ContactRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (contact: ContactRow) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial = contact
    ? {
        name: contact.name,
        organization: contact.organization ?? "",
        role: contact.role ?? "",
        phone: contact.phone ?? "",
        email: contact.email ?? "",
      }
    : EMPTY_CONTACT;

  return (
    <OrdiloDrawer variant="form" open={open} onOpenChange={onOpenChange}>
      <form
        key={contact?.id ?? "new"}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const input = {
            name: String(data.get("name") ?? ""),
            organization: String(data.get("organization") ?? ""),
            role: String(data.get("role") ?? ""),
            phone: String(data.get("phone") ?? ""),
            email: String(data.get("email") ?? ""),
          };
          setError(null);
          startTransition(async () => {
            const result = contact
              ? await updateContact(contact.id, input)
              : await createContact(input);
            if (!result.success) {
              setError(result.error);
              return;
            }
            onSaved(result.data);
          });
        }}
      >
        <OrdiloDrawerHeader
          title={contact ? "Kontakt bearbeiten" : "Neuer Kontakt"}
          description="Telefonnummer oder E-Mail-Adresse reicht."
        />
        <div className="space-y-3 p-4">
          <ContactInput label="Name" name="name" defaultValue={initial.name} required />
          <ContactInput label="Organisation" name="organization" defaultValue={initial.organization} />
          <ContactInput label="Rolle" name="role" defaultValue={initial.role} />
          <ContactInput label="Telefon" name="phone" defaultValue={initial.phone} inputMode="tel" />
          <ContactInput label="E-Mail" name="email" defaultValue={initial.email} inputMode="email" />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <OrdiloDrawerFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Wird gespeichert …" : "Kontakt speichern"}
          </Button>
        </OrdiloDrawerFooter>
      </form>
    </OrdiloDrawer>
  );
}

function ContactInput({
  label,
  name,
  defaultValue,
  required = false,
  inputMode = "text",
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  inputMode?: "text" | "tel" | "email";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        inputMode={inputMode}
        type={inputMode === "email" ? "email" : "text"}
        className="h-11 w-full rounded-ordilo-sm border border-border bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
      />
    </label>
  );
}
