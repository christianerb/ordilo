import { describe, expect, it } from "vitest";
import { eventNameList, FEED_HIDDEN_EVENTS, NOT_PRODUCT_USE_EVENTS } from "../event-filters";

describe("event filters", () => {
  it("builds a PostgREST list literal", () => {
    expect(eventNameList(NOT_PRODUCT_USE_EVENTS)).toBe("(app_opened,invite_accepted)");
    expect(eventNameList(FEED_HIDDEN_EVENTS)).toBe("(app_opened)");
  });
});
