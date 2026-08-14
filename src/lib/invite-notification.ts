const EMAIL_COLORS = {
  warmWhite: "#FDFCFA",
  graphite: "#262421",
  mistDark: "#625D54",
  petrol: "#305460",
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InviteNotificationEmail = {
  familyName: string;
  sourceFamilyName: string | null;
  appUrl: string;
};

export function inviteNotificationSubject(
  email: InviteNotificationEmail,
): string {
  return email.sourceFamilyName
    ? `Eine Familie wurde mit „${email.familyName}“ zusammengeführt`
    : `Ein neues Mitglied ist „${email.familyName}“ beigetreten`;
}

export function inviteNotificationText(email: InviteNotificationEmail): string {
  const action = email.sourceFamilyName
    ? `„${email.sourceFamilyName}“ wurde mit eurer Familie zusammengeführt.`
    : "Ein neues Mitglied ist eurer Familie beigetreten.";

  return [
    `Hallo,`,
    "",
    action,
    `Ihr seid jetzt gemeinsam bei „${email.familyName}“.`,
    "",
    `Familie ansehen: ${email.appUrl}/familie`,
    "",
    "Dein Ordilo",
  ].join("\n");
}

export function inviteNotificationHtml(email: InviteNotificationEmail): string {
  const action = email.sourceFamilyName
    ? `<strong>„${escapeHtml(email.sourceFamilyName)}“</strong> wurde mit eurer Familie zusammengeführt.`
    : "Ein neues Mitglied ist eurer Familie beigetreten.";

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:${EMAIL_COLORS.warmWhite};color:${EMAIL_COLORS.graphite};padding:24px;max-width:520px;margin:0 auto;">
    <p style="font-size:15px;margin:0 0 12px;">Hallo,</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 8px;">${action}</p>
    <p style="font-size:13px;line-height:1.5;color:${EMAIL_COLORS.mistDark};margin:0;">Ihr seid jetzt gemeinsam bei „${escapeHtml(email.familyName)}“.</p>
    <p style="margin:24px 0 0;">
      <a href="${escapeHtml(email.appUrl)}/familie" style="display:inline-block;background:${EMAIL_COLORS.petrol};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;">Familie ansehen</a>
    </p>
    <p style="font-size:12px;color:${EMAIL_COLORS.mistDark};margin:24px 0 0;">Dein Ordilo</p>
  </div>`;
}
