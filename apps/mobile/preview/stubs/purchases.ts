const annual = {
  identifier: "$rc_annual",
  packageType: "ANNUAL",
  product: {
    identifier: "com.ordilo.app.plus.yearly",
    priceString: "79,99 €",
    pricePerMonthString: "6,67 €",
    title: "Ordilo Plus jährlich",
  },
};

const monthly = {
  identifier: "$rc_monthly",
  packageType: "MONTHLY",
  product: {
    identifier: "com.ordilo.app.plus.monthly",
    priceString: "7,99 €",
    pricePerMonthString: "7,99 €",
    title: "Ordilo Plus monatlich",
  },
};

const customerInfo = {
  entitlements: { active: {} },
  managementURL: null,
};

const offering = {
  annual,
  availablePackages: [annual, monthly],
  identifier: "default",
  monthly,
};

const Purchases = {
  addCustomerInfoUpdateListener() {},
  async configure() {},
  async getAppUserID() {
    return "00000000-0000-4000-8000-000000000001";
  },
  async getCustomerInfo() {
    return customerInfo;
  },
  async getOfferings() {
    return { all: { default: offering }, current: offering };
  },
  async isConfigured() {
    return false;
  },
  async logIn() {
    return { customerInfo };
  },
  async purchasePackage() {
    return { customerInfo };
  },
  removeCustomerInfoUpdateListener() {},
  async restorePurchases() {
    return customerInfo;
  },
  async setLogLevel() {},
};

export const LOG_LEVEL = { DEBUG: 0 };
export default Purchases;
