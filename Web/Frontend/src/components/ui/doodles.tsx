import { cn } from "@/lib/utils";

// Hand-drawn accent shapes in the studio style: a four-point sparkle star,
// a loose squiggle underline, and a scribbled orbit ring. All stroke-based
// so they inherit the theme color via `text-*` classes + currentColor.

export const DoodleStar = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    aria-hidden="true"
    className={cn("w-8 h-8", className)}
  >
    <path
      d="M20 3 C21 12 23 15 30 17 C23 20 21 23 20 33 C19 23 17 20 9 17 C17 15 19 12 20 3 Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

export const DoodleSquiggle = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 120 16"
    fill="none"
    aria-hidden="true"
    preserveAspectRatio="none"
    className={cn("w-28 h-4", className)}
  >
    <path
      d="M3 10 C13 2 20 14 30 8 C40 2 46 14 58 8 C70 2 76 14 88 8 C98 3 104 12 117 6"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export const DoodleOrbit = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 64 40"
    fill="none"
    aria-hidden="true"
    className={cn("w-14 h-9", className)}
  >
    <ellipse
      cx="32"
      cy="20"
      rx="28"
      ry="11"
      stroke="currentColor"
      strokeWidth="2"
      strokeDasharray="3 4"
      transform="rotate(-12 32 20)"
    />
    <circle cx="32" cy="20" r="6" stroke="currentColor" strokeWidth="2" />
  </svg>
);
