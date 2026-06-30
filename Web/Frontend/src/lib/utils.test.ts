import { describe, it, expect, beforeEach } from "vitest";
import { cn, hexToHSL, applyAccentColor } from "./utils";

describe("cn", () => {
  it("joins truthy class names and drops falsy ones", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("lets a later Tailwind class win over an earlier conflicting one", () => {
    // tailwind-merge dedups conflicting utilities, keeping the last.
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("hexToHSL", () => {
  it("converts pure red", () => {
    expect(hexToHSL("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
  });

  it("converts black, white, and a mid grey to 0% saturation", () => {
    expect(hexToHSL("#000000")).toEqual({ h: 0, s: 0, l: 0 });
    expect(hexToHSL("#ffffff")).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHSL("#808080").s).toBe(0);
  });

  it("expands 3-digit shorthand the same as its 6-digit form", () => {
    expect(hexToHSL("#0f0")).toEqual(hexToHSL("#00ff00"));
  });
});

describe("applyAccentColor", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("style");
  });

  it("sets custom CSS variables for a hex color", () => {
    applyAccentColor("#ff0000");
    const root = document.documentElement;
    expect(root.getAttribute("data-accent")).toBe("custom");
    expect(root.style.getPropertyValue("--primary")).toBe("0 100% 50%");
  });

  it("uses a named accent and clears any custom variables", () => {
    applyAccentColor("#ff0000"); // first set custom vars…
    applyAccentColor("violet"); // …then a named accent must wipe them
    const root = document.documentElement;
    expect(root.getAttribute("data-accent")).toBe("violet");
    expect(root.style.getPropertyValue("--primary")).toBe("");
  });
});
