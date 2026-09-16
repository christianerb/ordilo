import type { PurchasesPackage } from "react-native-purchases";
import {
  ACCOUNT_DELETION_SUBSCRIPTION_NOTICE,
  subscriptionPriceLabel,
  subscriptionRenewalText,
} from "../lib/subscription-disclosure";

function subscription(packageType: string, priceString: string) {
  return { packageType, product: { priceString } } as PurchasesPackage;
}

describe("subscription disclosures", () => {
  it("shows the full annual price with its billing period", () => {
    const annual = subscription("ANNUAL", "79,99 €");
    expect(subscriptionPriceLabel(annual)).toBe("79,99 € / Jahr");
    expect(subscriptionRenewalText(annual)).toContain("Jahresabo: 79,99 € / Jahr.");
  });

  it("uses the localized store price, not a hard-coded euro price", () => {
    const monthly = subscription("MONTHLY", "$7.99");
    expect(subscriptionPriceLabel(monthly)).toBe("$7.99 / Monat");
    expect(subscriptionRenewalText(monthly)).toContain("Monatsabo: $7.99 / Monat.");
  });

  it("does not invent a billing period when a package is unavailable or custom", () => {
    expect(subscriptionRenewalText(null)).toMatch(/^Abo\./);
    expect(subscriptionPriceLabel(subscription("CUSTOM", "9,99 €"))).toBe("9,99 €");
  });

  it("explains renewal, cancellation and the separate account deletion", () => {
    expect(subscriptionRenewalText(null)).toContain("24 Stunden vor Ablauf");
    expect(subscriptionRenewalText(null)).toContain("Store-Abonnements");
    expect(ACCOUNT_DELETION_SUBSCRIPTION_NOTICE).toContain("nicht automatisch");
    expect(ACCOUNT_DELETION_SUBSCRIPTION_NOTICE).toContain("Kündige es zusätzlich");
  });
});
