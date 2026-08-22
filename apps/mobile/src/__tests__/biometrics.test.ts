import { biometryLabel } from "../lib/biometrics";

// Mirror of expo-local-authentication's AuthenticationType values.
const FINGERPRINT = 1;
const FACIAL_RECOGNITION = 2;
const IRIS = 3;

describe("biometryLabel", () => {
  it("prefers Face ID on iOS when the face sensor is present", () => {
    expect(biometryLabel([FACIAL_RECOGNITION], "ios")).toBe("Face ID");
  });

  it("calls the face sensor Gesichtserkennung on Android", () => {
    expect(biometryLabel([FACIAL_RECOGNITION], "android")).toBe(
      "Gesichtserkennung",
    );
  });

  it("is Touch ID on iOS and Fingerabdruck on Android", () => {
    expect(biometryLabel([FINGERPRINT], "ios")).toBe("Touch ID");
    expect(biometryLabel([FINGERPRINT], "android")).toBe("Fingerabdruck");
  });

  it("falls back to a generic German label for iris or unknown sensors", () => {
    expect(biometryLabel([IRIS], "ios")).toBe("Biometrie");
    expect(biometryLabel([], "ios")).toBe("Biometrie");
  });

  it("wins face over fingerprint when both exist", () => {
    expect(biometryLabel([FINGERPRINT, FACIAL_RECOGNITION], "ios")).toBe(
      "Face ID",
    );
  });
});
