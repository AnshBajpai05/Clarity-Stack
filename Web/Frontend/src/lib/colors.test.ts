import { describe, it, expect } from "vitest";
import { stringToColor, getInitials, avatarProps } from "./colors";

describe("stringToColor", () => {
  it("is deterministic — same input always yields the same color", () => {
    expect(stringToColor("alice@example.com")).toBe(stringToColor("alice@example.com"));
  });

  it("returns a well-formed HSL string", () => {
    expect(stringToColor("bob")).toMatch(/^hsl\(\d{1,3}, 70%, 60%\)$/);
  });

  it("keeps the hue inside [0, 360)", () => {
    for (const s of ["", "a", "team-lead", "🦄", "a".repeat(500)]) {
      const hue = Number(stringToColor(s).match(/^hsl\((\d+),/)![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("falls back to a fixed color for empty input", () => {
    expect(stringToColor("")).toBe("hsl(260, 60%, 55%)");
  });

  it("maps different strings to different hues (no trivial collisions)", () => {
    expect(stringToColor("postgres")).not.toBe(stringToColor("kafka"));
  });
});

describe("getInitials", () => {
  it("takes the local part of an email", () => {
    expect(getInitials("alice@example.com")).toBe("AL");
  });

  it("uses two parts when the name splits on separators", () => {
    expect(getInitials("ada.lovelace")).toBe("AL");
    expect(getInitials("grace hopper")).toBe("GH");
    expect(getInitials("jean-luc")).toBe("JL");
  });

  it("uppercases and returns '?' for empty input", () => {
    expect(getInitials("bob")).toBe("BO");
    expect(getInitials("")).toBe("?");
  });
});

describe("avatarProps", () => {
  it("bundles the color and initials for one identity", () => {
    expect(avatarProps("alice@example.com")).toEqual({
      color: stringToColor("alice@example.com"),
      initials: "AL",
    });
  });
});
