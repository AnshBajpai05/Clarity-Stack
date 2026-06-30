import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

// A small render test that proves the RTL + jsdom pipeline works end-to-end
// (JSX transform, the @/lib/utils alias via cn, and class-variance-authority).
describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("applies the default variant classes", () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText("Default")).toHaveClass("bg-primary/15");
  });

  it("switches classes for the destructive variant", () => {
    render(<Badge variant="destructive">Error</Badge>);
    const el = screen.getByText("Error");
    expect(el).toHaveClass("bg-destructive/15");
    expect(el).not.toHaveClass("bg-primary/15");
  });

  it("merges a caller-supplied className", () => {
    render(<Badge className="ml-2">Tagged</Badge>);
    expect(screen.getByText("Tagged")).toHaveClass("ml-2");
  });
});
