import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureFirstTouch, forgetFirstTouch, resetFirstTouchForTests } from "../first-touch";

describe("captureFirstTouch", () => {
  beforeEach(() => resetFirstTouchForTests());
  afterEach(() => window.history.pushState({}, "", "/"));

  it("keeps the first page's tags across client-side navigations", () => {
    window.history.pushState({}, "", "/ratgeber/kindergeld?utm_source=newsletter&utm_medium=email");
    expect(captureFirstTouch()).toEqual({
      source: "newsletter",
      medium: "email",
      landing: "/ratgeber/kindergeld",
    });

    // Internal navigation: no tags left in the URL.
    window.history.pushState({}, "", "/");
    expect(captureFirstTouch()).toEqual({
      source: "newsletter",
      medium: "email",
      landing: "/ratgeber/kindergeld",
    });
  });

  it("reads carried parameters when /login is the first page of the tab", () => {
    window.history.pushState({}, "", "/login?utm_source=podcast&lp=/ueber-uns");
    expect(captureFirstTouch()).toEqual({ source: "podcast", landing: "/ueber-uns" });
  });

  it("writes nothing to browser storage or cookies", () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/?utm_source=instagram");
    captureFirstTouch();
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("never remembers an app page as the first touch", () => {
    window.history.pushState({}, "", "/home");
    expect(captureFirstTouch()).toEqual({ landing: "/home" });
    window.history.pushState({}, "", "/login?utm_source=newsletter");
    expect(captureFirstTouch()).toEqual({ source: "newsletter", landing: "/login" });
  });

  it("starts over after forgetFirstTouch (someone signed in)", () => {
    window.history.pushState({}, "", "/?utm_source=instagram");
    captureFirstTouch();
    forgetFirstTouch();
    window.history.pushState({}, "", "/login?utm_source=newsletter");
    expect(captureFirstTouch().source).toBe("newsletter");
  });

  it("ignores the first visitor's referrer after someone signed in", () => {
    Object.defineProperty(document, "referrer", { configurable: true, value: "https://www.google.com/" });
    try {
      window.history.pushState({}, "", "/");
      expect(captureFirstTouch().referrer).toBe("google.com");
      forgetFirstTouch();
      window.history.pushState({}, "", "/login");
      expect(captureFirstTouch()).toEqual({ landing: "/login" });
    } finally {
      Object.defineProperty(document, "referrer", { configurable: true, value: "" });
    }
  });

  it("remembers an invite page as an entry, reduced to its first segment", () => {
    window.history.pushState({}, "", `/invite/${"a".repeat(64)}`);
    expect(captureFirstTouch()).toEqual({ landing: "/invite" });
    window.history.pushState({}, "", "/login");
    expect(captureFirstTouch()).toEqual({ landing: "/invite" });
  });
});

