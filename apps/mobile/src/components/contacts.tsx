import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import {
  Building2,
  Check,
  Copy,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  OrdiloFormBody,
  OrdiloFormField,
  OrdiloFormFooter,
  OrdiloFormInput,
  OrdiloFormSheet,
} from "./sheet";
import { OrdiloButton } from "./ui";
import {
  buildWhatsAppHref,
  createContact,
  getContactInitial,
  normalizePhoneForLink,
  updateContact,
  type Contact,
  type ContactInput,
} from "@/src/lib/contacts";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { tap, success, fail } from "@/src/lib/feedback";

/**
 * Shared contact UI for the native app (list, detail route, form sheet).
 * Every action opens another app — nothing places a call or sends a
 * message without the family member's next deliberate step there.
 */

type Icon = typeof Phone;

export const EMPTY_CONTACT_FORM: ContactInput = {
  name: "",
  organization: "",
  role: "",
  phone: "",
  email: "",
};

/** tel: link for the dialer, null when no usable number exists. */
export function getCallHref(contact: Contact): string | null {
  if (!contact.phone) return null;
  const normalized = normalizePhoneForLink(contact.phone);
  return normalized ? `tel:${normalized}` : null;
}

/** wa.me link, null when the number lacks an international prefix. */
export function getWhatsAppHref(contact: Contact): string | null {
  return contact.phone ? buildWhatsAppHref(contact.phone) : null;
}

/** Opens a tel:/mailto:/wa.me link with haptics and quiet failure. */
export async function openContactHref(href: string): Promise<void> {
  tap();
  try {
    const supported = await Linking.canOpenURL(href);
    if (!supported) throw new Error("No handler");
    await Linking.openURL(href);
  } catch {
    await fail();
  }
}

export function ContactAvatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.avatar, large && styles.avatarLarge]}
    >
      <Text style={[styles.avatarText, large && styles.avatarTextLarge]}>
        {getContactInitial(name)}
      </Text>
    </View>
  );
}

/** The three reach-out actions: Anrufen, E-Mail, WhatsApp. */
export function ContactActionGrid({
  contact,
  compact = false,
}: {
  contact: Contact;
  compact?: boolean;
}) {
  const whatsapp = getWhatsAppHref(contact);
  return (
    <View style={styles.actionBlock}>
      <View style={styles.actionGrid}>
        <ContactAction
          compact={compact}
          href={getCallHref(contact)}
          icon={Phone}
          label="Anrufen"
        />
        <ContactAction
          compact={compact}
          href={contact.email ? `mailto:${contact.email}` : null}
          icon={Mail}
          label="E-Mail"
        />
        <ContactAction
          compact={compact}
          href={whatsapp}
          icon={MessageCircle}
          label="WhatsApp"
        />
      </View>
      {contact.phone && !whatsapp ? (
        <Text style={styles.whatsappHint}>
          Für WhatsApp braucht die Nummer eine internationale Vorwahl, zum
          Beispiel +49.
        </Text>
      ) : null}
    </View>
  );
}

function ContactAction({
  compact,
  href,
  icon: ActionIcon,
  label,
}: {
  compact: boolean;
  href: string | null;
  icon: Icon;
  label: string;
}) {
  return (
    <Pressable
      accessibilityHint={
        href
          ? `Öffnet ${label} auf diesem Gerät`
          : `${label} ist nicht verfügbar`
      }
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !href }}
      disabled={!href}
      onPress={() => (href ? void openContactHref(href) : undefined)}
      style={({ pressed }) => [
        styles.action,
        compact && styles.actionCompact,
        href && styles.actionActive,
        pressed && styles.pressed,
        !href && styles.actionDisabled,
      ]}
    >
      <ActionIcon
        color={href ? colors.harborBlue : colors.mistDark}
        size={20}
        strokeWidth={1.8}
      />
      <Text style={[styles.actionText, !href && styles.actionTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Read-only values with copy-to-clipboard (Telefon, E-Mail, Organisation). */
export function ContactDetailsCard({ contact }: { contact: Contact }) {
  return (
    <View style={styles.detailCard}>
      {contact.phone ? (
        <ContactValueRow icon={Phone} label="Telefon" value={contact.phone} />
      ) : null}
      {contact.email ? (
        <ContactValueRow icon={Mail} label="E-Mail" value={contact.email} />
      ) : null}
      {contact.organization ? (
        <ContactValueRow
          icon={Building2}
          label="Organisation"
          value={contact.organization}
        />
      ) : null}
    </View>
  );
}

function ContactValueRow({
  icon: RowIcon,
  label,
  value,
}: {
  icon: Icon;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copy = async () => {
    const copiedToClipboard = await Clipboard.setStringAsync(value);
    if (!copiedToClipboard) return;
    await success();
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <View style={styles.detailRow}>
      <RowIcon color={colors.mistDark} size={18} strokeWidth={1.8} />
      <View style={styles.detailValue}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text selectable style={styles.detailText}>
          {value}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`${label} kopieren`}
        accessibilityRole="button"
        hitSlop={6}
        onPress={() => void copy()}
        style={styles.iconButton}
      >
        {copied ? (
          <Check color={colors.harborBlue} size={18} />
        ) : (
          <Copy color={colors.harborBlue} size={18} />
        )}
      </Pressable>
    </View>
  );
}

/** Bottom-sheet form for creating and editing a contact. */
export function ContactFormSheet({
  contact,
  familyId,
  onClose,
  onSaved,
  visible,
}: {
  contact: Contact | null;
  familyId: string | null;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
  visible: boolean;
}) {
  const [form, setForm] = useState<ContactInput>(EMPTY_CONTACT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the sheet opens for another contact.
  useEffect(() => {
    if (!visible) return;
    void Promise.resolve().then(() => {
      setForm(
        contact
          ? {
              name: contact.name,
              organization: contact.organization ?? "",
              role: contact.role ?? "",
              phone: contact.phone ?? "",
              email: contact.email ?? "",
            }
          : EMPTY_CONTACT_FORM,
      );
      setError(null);
      setSaving(false);
    });
  }, [visible, contact]);

  const patch = useCallback(
    (key: keyof ContactInput) => (value: string) =>
      setForm((current) => ({ ...current, [key]: value })),
    [],
  );

  const save = async () => {
    if (!familyId || saving) return;
    setSaving(true);
    setError(null);
    const result = contact
      ? await updateContact(contact.id, familyId, form)
      : await createContact(familyId, form);
    if (!result.success) {
      setSaving(false);
      setError(result.error);
      await fail();
      return;
    }
    await success();
    setSaving(false);
    onSaved(result.contact);
  };

  return (
    <OrdiloFormSheet
      closeAccessibilityLabel="Kontakt schließen"
      dismissDisabled={saving}
      keyboardAvoiding
      onClose={onClose}
      subtitle="Telefonnummer oder E-Mail-Adresse reicht."
      title={contact ? "Kontakt bearbeiten" : "Neuer Kontakt"}
      visible={visible}
    >
      <OrdiloFormBody>
        <OrdiloFormField label="Name">
          <OrdiloFormInput
            accessibilityLabel="Name"
            autoCapitalize="words"
            autoFocus
            autoCorrect={false}
            onChangeText={patch("name")}
            value={form.name}
          />
        </OrdiloFormField>
        <OrdiloFormField label="Organisation">
          <OrdiloFormInput
            accessibilityLabel="Organisation"
            autoCorrect={false}
            onChangeText={patch("organization")}
            value={form.organization ?? ""}
          />
        </OrdiloFormField>
        <OrdiloFormField label="Rolle">
          <OrdiloFormInput
            accessibilityLabel="Rolle"
            autoCorrect={false}
            onChangeText={patch("role")}
            value={form.role ?? ""}
          />
        </OrdiloFormField>
        <OrdiloFormField label="Telefon">
          <OrdiloFormInput
            accessibilityLabel="Telefon"
            autoCorrect={false}
            keyboardType="phone-pad"
            onChangeText={patch("phone")}
            value={form.phone ?? ""}
          />
        </OrdiloFormField>
        <OrdiloFormField label="E-Mail">
          <OrdiloFormInput
            accessibilityLabel="E-Mail"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={patch("email")}
            value={form.email}
          />
        </OrdiloFormField>
      </OrdiloFormBody>
      <OrdiloFormFooter
        error={error}
        primary={<OrdiloButton
          disabled={saving || !familyId}
          icon={
            saving ? (
              <ActivityIndicator color={colors.warmWhite} size="small" />
            ) : undefined
          }
          onPress={() => void save()}
          size="lg"
          title={saving ? "Wird gespeichert …" : "Kontakt speichern"}
        />}
      />
    </OrdiloFormSheet>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: colors.harborBlue,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarLarge: { height: 56, width: 56 },
  avatarText: {
    color: colors.warmWhite,
    fontFamily: typography.display.fontFamily,
    fontSize: 16,
  },
  avatarTextLarge: { fontSize: 20 },
  actionBlock: { gap: spacing.sm },
  actionGrid: { flexDirection: "row", gap: spacing.sm },
  action: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 56,
  },
  actionCompact: { minHeight: 48 },
  actionActive: { borderColor: "rgba(48, 84, 96, 0.35)" },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: colors.harborBlue, ...typography.label },
  actionTextDisabled: { color: colors.mistDark },
  whatsappHint: { color: colors.mistDark, ...typography.label },
  detailCard: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  detailRow: {
    alignItems: "center",
    borderBottomColor: colors.mistLight,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.xs,
  },
  detailValue: { flex: 1, gap: 1, minWidth: 0 },
  detailLabel: { color: colors.mistDark, ...typography.label },
  detailText: { color: colors.graphite, ...typography.body },
  iconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  pressed: { opacity: 0.76 },
});
