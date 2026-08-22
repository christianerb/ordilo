import { afterEach, describe, expect, it } from "vitest";

import { GET as getAasa } from "../apple-app-site-association/route";
import { GET as getAssetlinks } from "../assetlinks.json/route";

/**
 * Both well-known routes follow the same contract: 404 until the
 * platform credentials are configured, then the verification document.
 */

const ENV_KEYS = ["APPLE_TEAM_ID", "ANDROID_SHA256_CERT_FINGERPRINTS"];
const savedEnv = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv.has(key)) {
      if (savedEnv.get(key) === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv.get(key);
      }
    }
    savedEnv.delete(key);
  }
});

function setEnv(key: string, value: string | undefined) {
  if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("GET /.well-known/apple-app-site-association", () => {
  it("404s without an Apple Team ID", async () => {
    setEnv("APPLE_TEAM_ID", undefined);
    const response = await getAasa();
    expect(response.status).toBe(404);
  });

  it("serves the invite path for the app once configured", async () => {
    setEnv("APPLE_TEAM_ID", "TEAM123456");
    const response = await getAasa();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applinks.details[0].appID).toBe("TEAM123456.com.ordilo.app");
    expect(body.applinks.details[0].paths).toContain("/invite/*");
  });
});

describe("GET /.well-known/assetlinks.json", () => {
  it("404s without signing certificate fingerprints", async () => {
    setEnv("ANDROID_SHA256_CERT_FINGERPRINTS", undefined);
    const response = await getAssetlinks();
    expect(response.status).toBe(404);
  });

  it("404s on an empty fingerprint list", async () => {
    setEnv("ANDROID_SHA256_CERT_FINGERPRINTS", " , ");
    const response = await getAssetlinks();
    expect(response.status).toBe(404);
  });

  it("serves all configured fingerprints for the app package", async () => {
    setEnv("ANDROID_SHA256_CERT_FINGERPRINTS", "AA:BB, CC:DD");
    const response = await getAssetlinks();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[0].relation).toContain(
      "delegate_permission/common.handle_all_urls",
    );
    expect(body[0].target.package_name).toBe("com.ordilo.app");
    expect(body[0].target.sha256_cert_fingerprints).toEqual([
      "AA:BB",
      "CC:DD",
    ]);
  });
});
