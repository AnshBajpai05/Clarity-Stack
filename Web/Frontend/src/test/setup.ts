// Vitest global setup: adds jest-dom matchers (toBeInTheDocument, toHaveClass, …)
// and clears the DOM between tests so component tests can't leak into each other.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
