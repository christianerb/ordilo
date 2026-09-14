import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import { apiFetch } from "./api";
import { useFamily } from "./family-context";
import { getSupabase } from "./supabase";

export const REVENUECAT_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "plus";

type PurchaseResult = "purchased" | "cancelled" | "pending";

interface BillingContextValue {
  available: boolean;
  enabled: boolean;
  error: string | null;
  isLoading: boolean;
  isPlus: boolean;
  managementUrl: string | null;
  offering: PurchasesOffering | null;
  purchase: (item: PurchasesPackage) => Promise<PurchaseResult>;
  refresh: () => Promise<void>;
  restore: () => Promise<boolean>;
}

const BillingContext = createContext<BillingContextValue>({
  available: false,
  enabled: false,
  error: null,
  isLoading: true,
  isPlus: false,
  managementUrl: null,
  offering: null,
  purchase: async () => "cancelled",
  refresh: async () => {},
  restore: async () => false,
});

function platformApiKey(): string | null {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || null;
  }
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || null;
  }
  return null;
}

export function hasPlusEntitlement(customerInfo: CustomerInfo | null): boolean {
  return Boolean(
    customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENT_ID]?.isActive,
  );
}

/**
 * Tell the server to re-sync exactly the family that is the RevenueCat
 * app user ID — an unordered membership pick could otherwise update a
 * different family than the one that just purchased.
 */
async function syncServerForFamily(familyId: string): Promise<void> {
  await apiFetch("/api/billing/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ family_id: familyId }),
  });
}

function isCancelledPurchase(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "userCancelled" in error &&
    (error as { userCancelled?: unknown }).userCancelled === true
  );
}

/**
 * RevenueCat uses the family UUID as its App User ID. A purchase therefore
 * belongs to the same family entity that server-side quotas and access checks
 * use, rather than to whichever family member happened to buy it.
 */
export function BillingProvider({ children }: { children: ReactNode }) {
  const { family } = useFamily();
  const familyId = family?.id ?? null;
  const apiKey = platformApiKey();
  const enabled =
    process.env.EXPO_PUBLIC_BILLING_ENTITLEMENTS_ENABLED === "1";
  const activeFamilyRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const [state, setState] = useState<{
    customerInfo: CustomerInfo | null;
    dbIsPlus: boolean;
    error: string | null;
    isLoading: boolean;
    offering: PurchasesOffering | null;
  }>({
    customerInfo: null,
    dbIsPlus: false,
    error: null,
    isLoading: true,
    offering: null,
  });

  const load = useCallback(
    async (targetFamilyId: string): Promise<void> => {
      const request = ++requestRef.current;
      setState((current) => ({ ...current, error: null, isLoading: true }));
      try {
        const configured = await Purchases.isConfigured();
        let customerInfo: CustomerInfo;
        if (!configured) {
          if (!apiKey) throw new Error("RevenueCat ist nicht konfiguriert.");
          Purchases.configure({ apiKey, appUserID: targetFamilyId });
          if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
          customerInfo = await Purchases.getCustomerInfo();
        } else {
          const currentId = await Purchases.getAppUserID();
          customerInfo =
            currentId === targetFamilyId
              ? await Purchases.getCustomerInfo()
              : (await Purchases.logIn(targetFamilyId)).customerInfo;
        }
        activeFamilyRef.current = targetFamilyId;

        const [offerings, entitlement] = await Promise.all([
          Purchases.getOfferings(),
          getSupabase().rpc("get_family_entitlement", {
            p_family_id: targetFamilyId,
          }),
        ]);
        if (request !== requestRef.current) return;
        let dbIsPlus =
          entitlement.data?.plan === "plus" ||
          entitlement.data?.plan === "founding";
        if (!dbIsPlus && hasPlusEntitlement(customerInfo)) {
          try {
            await syncServerForFamily(targetFamilyId);
            dbIsPlus = true;
          } catch {
            // RevenueCat remains visible in the paywall, but server-backed
            // Plus features stay locked until the purchase is verified.
          }
        }
        setState({
          customerInfo,
          dbIsPlus,
          error: null,
          isLoading: false,
          offering: offerings.current,
        });
      } catch {
        if (request !== requestRef.current) return;
        setState((current) => ({
          ...current,
          error:
            "Abos konnten gerade nicht geladen werden. Bitte versuch es nochmal.",
          isLoading: false,
        }));
      }
    },
    [apiKey],
  );

  useEffect(() => {
    if (!enabled || !familyId || !apiKey) {
      const request = ++requestRef.current;
      activeFamilyRef.current = null;
      void Promise.resolve().then(() => {
        if (request !== requestRef.current) return;
        setState({
          customerInfo: null,
          dbIsPlus: false,
          error:
            enabled && familyId && !apiKey
              ? "RevenueCat ist nicht konfiguriert."
              : null,
          isLoading: false,
          offering: null,
        });
      });
      return;
    }

    const listener = (customerInfo: CustomerInfo) => {
      if (activeFamilyRef.current !== familyId) return;
      setState((current) => ({ ...current, customerInfo }));
    };
    let disposed = false;
    let listenerAdded = false;
    void Promise.resolve()
      .then(() => load(familyId))
      .then(() => {
        if (disposed) return;
        Purchases.addCustomerInfoUpdateListener(listener);
        listenerAdded = true;
      });
    return () => {
      disposed = true;
      if (listenerAdded) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [apiKey, enabled, familyId, load]);

  const syncServer = useCallback(async () => {
    const familyId = activeFamilyRef.current;
    if (!familyId) throw new Error("Keine aktive Familie.");
    await syncServerForFamily(familyId);
  }, []);

  const purchase = useCallback(
    async (item: PurchasesPackage): Promise<PurchaseResult> => {
      try {
        const result = await Purchases.purchasePackage(item);
        setState((current) => ({
          ...current,
          customerInfo: result.customerInfo,
        }));
        if (hasPlusEntitlement(result.customerInfo)) {
          try {
            await syncServer();
            setState((current) => ({ ...current, dbIsPlus: true }));
          } catch {
            return "pending";
          }
        }
        return "purchased";
      } catch (error) {
        if (isCancelledPurchase(error)) return "cancelled";
        throw error;
      }
    },
    [syncServer],
  );

  const restore = useCallback(async (): Promise<boolean> => {
    const customerInfo = await Purchases.restorePurchases();
    setState((current) => ({ ...current, customerInfo }));
    const restored = hasPlusEntitlement(customerInfo);
    if (restored) {
      await syncServer();
      setState((current) => ({ ...current, dbIsPlus: true }));
    }
    return restored;
  }, [syncServer]);

  const value = useMemo<BillingContextValue>(
    () => ({
      available: Boolean(apiKey && state.offering),
      enabled,
      error: state.error,
      isLoading: state.isLoading,
      isPlus: !enabled || state.dbIsPlus,
      managementUrl: state.customerInfo?.managementURL ?? null,
      offering: state.offering,
      purchase,
      refresh: async () => {
        if (familyId) await load(familyId);
      },
      restore,
    }),
    [apiKey, enabled, familyId, load, purchase, restore, state],
  );

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
}

export function useBilling(): BillingContextValue {
  return useContext(BillingContext);
}
