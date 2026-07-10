"use client";

import {
  Car,
  CreditCard,
  FileCheck,
  Home,
  Package,
  Shield,
  Smartphone,
} from "lucide-react";

export interface InventoryItemDisplay {
  id: string;
  name: string;
  item_type: string;
  tags: string[];
  linked_member_id: string | null;
  status: string;
}

export const INVENTORY_ICONS: Record<string, typeof Car> = {
  vehicle: Car,
  insurance: Shield,
  bank_account: CreditCard,
  property: Home,
  contract: FileCheck,
  device: Smartphone,
  other: Package,
};

export const INVENTORY_LABELS: Record<string, string> = {
  vehicle: "Fahrzeug",
  insurance: "Versicherung",
  bank_account: "Konto",
  property: "Immobilie",
  contract: "Vertrag",
  device: "Gerät",
  other: "Sonstiges",
};

export const INVENTORY_TYPE_OPTIONS = Object.entries(INVENTORY_LABELS);
