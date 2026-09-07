import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import { IntakeBanner } from "@/src/components/intake-banner";
import { notificationDestination, syncPushRegistration } from "@/src/lib/notifications";
import { drainIntake } from "@/src/lib/intake-worker";
import {
  describeIntake,
  describeIntakeFailure,
  type IntakeStatus,
} from "@/src/lib/intake-status";
import { loadPersistedScanQueue } from "@/src/lib/scan";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Wait for auth/onboarding before resolving external arrivals; no payload is discarded by login. */
export function NativeArrivals({ familyId, userId }: { familyId: string | null; userId: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const handled = useRef<string | null>(null);
  const currentRoute = segments[0];
  const [intakeStatus, setIntakeStatus] = useState<
    { familyId: string; status: IntakeStatus } | null
  >(null);
  useEffect(() => {
    if (!familyId || !userId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = describeIntake(await loadPersistedScanQueue(familyId));
        if (!cancelled) setIntakeStatus(status ? { familyId, status } : null);
      } catch {
        if (!cancelled) {
          setIntakeStatus({ familyId, status: describeIntakeFailure() });
        }
      }
    };
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [familyId, userId]);
  useEffect(() => {
    if (!familyId || !userId || currentRoute === "scan" || currentRoute === "empfangen") return;
    let cancelled = false;
    const isCurrent = () => !cancelled && AppState.currentState === "active";
    const drain = () => { if (isCurrent()) void drainIntake(familyId, isCurrent).catch(() => {}); };
    drain();
    const timer = setInterval(drain, 15_000);
    const foreground = AppState.addEventListener("change", (state) => { if (state === "active") drain(); });
    return () => { cancelled = true; clearInterval(timer); foreground.remove(); };
  }, [familyId, userId, currentRoute]);
  const openNotification = useCallback((response: Notifications.NotificationResponse) => {
    if (!familyId) return;
    const id = response.notification.request.identifier;
    if (id === handled.current) return;
    const destination = notificationDestination(response.notification.request.content.data ?? {}, familyId);
    handled.current = id;
    void Notifications.clearLastNotificationResponseAsync();
    if (destination) router.push(destination);
  }, [familyId, router]);

  useEffect(() => {
    if (!familyId || !userId) return;
    let cancelled = false;
    let syncing = false;
    const sync = async () => {
      if (syncing) return;
      syncing = true;
      try { await syncPushRegistration(); } catch { /* Settings exposes retry. */ }
      finally { syncing = false; }
    };
    void sync();
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (!cancelled && response) openNotification(response); }).catch(() => {});
    const responseListener = Notifications.addNotificationResponseReceivedListener(openNotification);
    const tokenListener = Notifications.addPushTokenListener(() => { void sync(); });
    const foreground = AppState.addEventListener("change", (state) => { if (state === "active") void sync(); });
    return () => { cancelled = true; responseListener.remove(); tokenListener.remove(); foreground.remove(); };
  }, [familyId, userId, openNotification]);

  useEffect(() => {
    if (!familyId || !userId || currentRoute === "empfangen" || currentRoute === "scan") return;
    let cancelled = false;
    const check = () => {
      void import("@/src/lib/share-inbox").then((sharing) => {
        if (!cancelled && sharing.hasIncomingShare()) router.push("/empfangen");
      }).catch(() => {});
    };
    check();
    const foreground = AppState.addEventListener("change", (state) => { if (state === "active") check(); });
    return () => { cancelled = true; foreground.remove(); };
  }, [familyId, userId, currentRoute, router]);
  if (!userId || intakeStatus?.familyId !== familyId || currentRoute === "scan" || currentRoute === "empfangen") return null;
  return (
    <IntakeBanner
      onPress={() => router.push("/scan")}
      status={intakeStatus.status}
      topInset={insets.top}
    />
  );
}
