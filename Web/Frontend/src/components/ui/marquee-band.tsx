import { cn } from "@/lib/utils";

export type MarqueeBandProps = {
  phrases: string[];
  className?: string;
  /** Separator drawn between phrases; "~" matches the studio style */
  separator?: string;
};

// Full-width scrolling text band. The track renders the phrase list twice so
// the -50% keyframe loops without a visible seam.
export const MarqueeBand = ({
  phrases,
  className,
  separator = "~",
}: MarqueeBandProps) => {
  const items = phrases.flatMap((p, i) => [
    <span key={`p-${i}`} className="whitespace-nowrap">
      {p}
    </span>,
    <span key={`s-${i}`} className="text-neon-peach mx-6 select-none" aria-hidden="true">
      {separator}
    </span>,
  ]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden border-y border-border/30 py-4",
        className,
      )}
    >
      <div className="flex w-max animate-marquee items-center font-display font-bold uppercase tracking-[0.2em] text-lg text-muted-foreground">
        <div className="flex items-center" aria-hidden="false">
          {items}
        </div>
        <div className="flex items-center" aria-hidden="true">
          {items}
        </div>
      </div>
    </div>
  );
};

export default MarqueeBand;
