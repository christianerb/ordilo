import type { PurchasesPackage } from "react-native-purchases";

export function subscriptionPriceLabel(item: PurchasesPackage): string {
  const price = item.product.priceString;
  if (item.packageType === "ANNUAL") return `${price} / Jahr`;
  if (item.packageType === "MONTHLY") return `${price} / Monat`;
  return price;
}

export function subscriptionRenewalText(item: PurchasesPackage | null): string {
  const period =
    item?.packageType === "ANNUAL"
      ? "Jahresabo"
      : item?.packageType === "MONTHLY"
        ? "Monatsabo"
        : "Abo";
  const price = item ? `: ${subscriptionPriceLabel(item)}.` : ".";
  return `${period}${price} Zahlung nach Kaufbestätigung über deinen App Store. Automatische Verlängerung, wenn du nicht spätestens 24 Stunden vor Ablauf kündigst. Verwalten und kündigen in deinen Store-Abonnements.`;
}

export const ACCOUNT_DELETION_SUBSCRIPTION_NOTICE =
  "Ein Store-Abo endet nicht automatisch mit der Kontolöschung. Kündige es zusätzlich in deinen Store-Abonnements, damit keine weiteren Zahlungen anfallen.";
