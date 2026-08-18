import { Mail, MessageCircle, Phone } from "lucide-react";
import {
  buildWhatsAppHref,
  normalizePhoneForLink,
} from "@/lib/contacts";
import { cn } from "@/lib/utils";

export type ContactActionKind = "phone" | "email" | "whatsapp";

/**
 * Safe contact launchers shared by contact details and chat cards. Every
 * action opens another app; none of them can place a call or send a message
 * without the family member's next deliberate step.
 */
export function ContactActionLinks({
  phone,
  email,
  preferred = null,
  messageDraft = "",
  className,
}: {
  phone: string | null;
  email: string | null;
  preferred?: ContactActionKind | null;
  messageDraft?: string;
  className?: string;
}) {
  const normalizedPhone = phone ? normalizePhoneForLink(phone) : "";
  const actions = [
    {
      kind: "phone" as const,
      href: normalizedPhone ? `tel:${normalizedPhone}` : null,
      label: "Anrufen",
      Icon: Phone,
      external: false,
    },
    {
      kind: "email" as const,
      href: email ? `mailto:${email}` : null,
      label: "E-Mail",
      Icon: Mail,
      external: false,
    },
    {
      kind: "whatsapp" as const,
      href: phone ? buildWhatsAppHref(phone, messageDraft) : null,
      label: "WhatsApp",
      Icon: MessageCircle,
      external: true,
    },
  ];

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {actions.map(({ kind, href, label, Icon, external }) => {
        const classes = cn(
          "flex min-h-14 flex-col items-center justify-center gap-1 rounded-ordilo-sm border px-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          href
            ? preferred === kind
              ? "border-[var(--petrol)] bg-[var(--petrol)] text-white"
              : "border-border bg-[var(--surface-box)] text-[var(--petrol)] transition-colors hover:bg-[var(--sand-warm)]"
            : "cursor-not-allowed border-border text-muted-foreground opacity-40",
        );

        if (!href) {
          return (
            <span key={kind} className={classes} aria-disabled="true">
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </span>
          );
        }

        return (
          <a
            key={kind}
            href={href}
            className={classes}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </a>
        );
      })}
    </div>
  );
}
