import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { ConfirmDialog } from "./confirm-dialog";
import { InlineNotice, ListGroup, ListRow, ListSkeleton, OrdiloButton, SectionHeader } from "./ui";
import { getFamilyAccess, revokeFamilyAccess, type AccessMember, type AccessInvite, type FamilyAccess } from "@/src/lib/family-access";
import { colors, spacing, typography } from "@/src/theme/tokens";

type Target = { member: AccessMember } | { invite: AccessInvite };

export function FamilyAccessPanel({ familyId, isOwner, revision, onRevoked }: {
  familyId: string;
  isOwner: boolean;
  revision: number;
  onRevoked: () => void;
}) {
  const [data, setData] = useState<FamilyAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setError(null);
    const result = await getFamilyAccess(familyId);
    if (sequence.current !== current) return;
    if (result.success) setData(result.data);
    else { setData(null); setError(result.error); }
  }, [familyId]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  useEffect(() => { let active = true; if (revision > 0) void Promise.resolve().then(() => { if (active) void load(); }); return () => { active = false; }; }, [load, revision]);
  const select = (next: Target) => { setActionError(null); setTarget(next); };
  const revoke = async () => {
    if (!target || busy) return;
    setBusy(true);
    const result = await revokeFamilyAccess(familyId, "member" in target
      ? { userId: target.member.user_id } : { inviteId: target.invite.id });
    setBusy(false);
    if (!result.success) { setActionError(result.error); return; }
    setTarget(null);
    onRevoked();
    await load();
  };
  return <View style={styles.section}>
    <SectionHeader title="Wer Zugriff hat" />
    <Text style={styles.copy}>Diese Konten können alle Dokumente, Aufgaben und Termine der Familie sehen, bearbeiten und löschen. Die Personen oben haben allein durch ihren Eintrag keinen Zugriff.</Text>
    {error ? <><InlineNotice message={error} /><OrdiloButton title="Erneut versuchen" variant="outline" onPress={() => void load()} /></> : !data ? <ListSkeleton rows={2} /> : <>
      <ListGroup>{data.members.map((member, index) => <ListRow
        key={member.user_id}
        first={index === 0}
        titleLines={3}
        title={`${member.email ?? "Konto ohne E-Mail"}${member.is_self ? " (du)" : ""}`}
        subtitle={member.is_owner ? "Hat die Familie angelegt · verwaltet den Zugriff" : "Kann alles sehen und bearbeiten"}
        trailing={isOwner && !member.is_owner && !member.is_self
          ? <OrdiloButton title="Entfernen" variant="outline" onPress={() => select({ member })} /> : undefined}
      />)}</ListGroup>
      {isOwner ? <>
        <SectionHeader title="Aktive Einladungslinks" />
        <Text style={styles.copy}>Jede Person mit einem gültigen Link kann nach der Anmeldung beitreten. Teile Links nur mit Menschen, denen du alle Familienunterlagen anvertrauen möchtest.</Text>
        {data.invites.length === 0 ? <Text style={styles.copy}>Keine aktiven Einladungslinks.</Text> : <ListGroup>{data.invites.map((invite, index) => <ListRow
          key={invite.id} first={index === 0}
          title={`Einladungslink ${index + 1}`}
          subtitle={`Gültig bis ${new Date(invite.expires_at).toLocaleDateString("de-DE")}`}
          trailing={<OrdiloButton title="Deaktivieren" variant="outline" onPress={() => select({ invite })} />}
        />)}</ListGroup>}
      </> : <Text style={styles.copy}>Nur das Konto, das die Familie angelegt hat, kann einladen und den Zugriff anderer Konten beenden.</Text>}
    </>}
    <ConfirmDialog
      visible={target !== null} loading={busy} error={actionError}
      title={target && "member" in target ? "Zugriff beenden?" : "Link deaktivieren?"}
      confirmLabel={target && "member" in target ? "Zugriff beenden" : "Deaktivieren"}
      message={target && "member" in target
        ? `${target.member.email ?? "Dieses Konto"} hat danach keinen Zugriff mehr auf die Familie. Alle bisherigen Einladungslinks werden deaktiviert, damit das Konto nicht direkt wieder beitreten kann. Bereits gespeicherte Kopien können wir nicht zurückholen.`
        : "Mit diesem Link kann niemand mehr beitreten. Wer bereits beigetreten ist, behält seinen Zugriff."}
      onCancel={() => { if (!busy) setTarget(null); }} onConfirm={() => void revoke()}
    />
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  copy: { color: colors.mistDark, ...typography.body },
});
