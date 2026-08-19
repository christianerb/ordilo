"use client";

import { Smile, User, Users } from "lucide-react";
import {
  OrdiloFilterTabs,
  type OrdiloFilterTabItem,
} from "@/components/ordilo/ordilo-filter-tabs";
import type { FamilyFilter } from "./family-filters";

const TABS: OrdiloFilterTabItem<FamilyFilter>[] = [
  { key: "all", label: "Alle", icon: Users, testId: "family-filter-all" },
  { key: "adults", label: "Erwachsene", icon: User, testId: "family-filter-adults" },
  { key: "children", label: "Kinder", icon: Smile, testId: "family-filter-children" },
];

export function FamilyFilterTabs({
  value,
  onChange,
}: {
  value: FamilyFilter;
  onChange: (value: FamilyFilter) => void;
}) {
  return (
    <OrdiloFilterTabs
      value={value}
      onChange={onChange}
      tabs={TABS}
      ariaLabel="Nach Alter filtern"
    />
  );
}
