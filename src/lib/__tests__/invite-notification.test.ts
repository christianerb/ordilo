import { describe, expect, it } from "vitest";
import {
  inviteNotificationHtml,
  inviteNotificationSubject,
  inviteNotificationText,
} from "@/lib/invite-notification";

const join = {
  familyName: "Familie Erb",
  sourceFamilyName: null,
  appUrl: "https://ordilo.example",
};

describe("invite notification email", () => {
  it("writes a warm join notification with a family link", () => {
    expect(inviteNotificationSubject(join)).toBe(
      "Ein neues Mitglied ist „Familie Erb“ beigetreten",
    );
    expect(inviteNotificationText(join)).toContain(
      "Familie ansehen: https://ordilo.example/familie",
    );
    expect(inviteNotificationHtml(join)).toContain(
      'href="https://ordilo.example/familie"',
    );
  });

  it("explains a family merge and safely escapes names in HTML", () => {
    const merge = {
      ...join,
      familyName: "Erb & Co.",
      sourceFamilyName: '<Familie "Meyer">',
    };

    expect(inviteNotificationSubject(merge)).toBe(
      "Eine Familie wurde mit „Erb & Co.“ zusammengeführt",
    );
    expect(inviteNotificationText(merge)).toContain(
      "„<Familie \"Meyer\">“ wurde mit eurer Familie zusammengeführt.",
    );
    expect(inviteNotificationHtml(merge)).toContain(
      "„&lt;Familie &quot;Meyer&quot;&gt;“",
    );
  });
});
