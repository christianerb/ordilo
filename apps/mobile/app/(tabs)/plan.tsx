import { CalendarDays } from "lucide-react-native";

import { EmptyState, Screen, ScreenHeader } from "@/src/components/ui";

/**
 * Plan — tasks and calendar as one family agenda. Arrives with the
 * Familienplaner milestone.
 */
export default function PlanScreen() {
  return (
    <Screen>
      <ScreenHeader title="Plan" subtitle="Aufgaben und Termine der Familie" />
      <EmptyState
        icon={CalendarDays}
        heading="Noch nichts geplant"
        description="Fristen aus deinen Dokumenten und Aufgaben der Familie erscheinen hier."
      />
    </Screen>
  );
}
