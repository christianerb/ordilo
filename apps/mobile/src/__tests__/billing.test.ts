import type { CustomerInfo } from "react-native-purchases";

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    addCustomerInfoUpdateListener: jest.fn(),
    configure: jest.fn(),
    getAppUserID: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    isConfigured: jest.fn(),
    logIn: jest.fn(),
    purchasePackage: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    restorePurchases: jest.fn(),
    setLogLevel: jest.fn(),
  },
  LOG_LEVEL: { DEBUG: 0 },
}));

// eslint-disable-next-line import/first
import {
  hasPlusEntitlement,
  REVENUECAT_ENTITLEMENT_ID,
} from "@/src/lib/billing";

function customerInfo(active: Record<string, { isActive: boolean }>) {
  return { entitlements: { active } } as unknown as CustomerInfo;
}

describe("hasPlusEntitlement", () => {
  it("is false without customer info", () => {
    expect(hasPlusEntitlement(null)).toBe(false);
  });

  it("is true when the configured entitlement is active", () => {
    expect(
      hasPlusEntitlement(
        customerInfo({ [REVENUECAT_ENTITLEMENT_ID]: { isActive: true } }),
      ),
    ).toBe(true);
  });

  it("is false when the entitlement is missing or inactive", () => {
    expect(hasPlusEntitlement(customerInfo({}))).toBe(false);
    expect(
      hasPlusEntitlement(
        customerInfo({ [REVENUECAT_ENTITLEMENT_ID]: { isActive: false } }),
      ),
    ).toBe(false);
    expect(
      hasPlusEntitlement(customerInfo({ unrelated: { isActive: true } })),
    ).toBe(false);
  });

  it("defaults the entitlement identifier to plus", () => {
    expect(REVENUECAT_ENTITLEMENT_ID).toBe("plus");
  });
});
