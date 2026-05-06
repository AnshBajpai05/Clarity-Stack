import { Badge } from "@/components/ui/badge";

const colors = {
  low: 'bg-success/15 text-success border-success/30',
  medium: 'bg-warning/15 text-warning border-warning/30',
  high: 'bg-destructive/15 text-destructive border-destructive/30',
  critical: 'bg-destructive/20 text-destructive border-destructive/50',
};

const categoryColors: Record<string, string> = {
  'Ambiguous': 'bg-warning/15 text-warning border-warning/30',
  'Conflict': 'bg-destructive/15 text-destructive border-destructive/30',
  'Missing': 'bg-accent/15 text-accent border-accent/30',
  'Critical': 'bg-destructive/20 text-destructive border-destructive/50',
  'vague': 'bg-warning/15 text-warning border-warning/30',
  'missing-actor': 'bg-accent/15 text-accent border-accent/30',
  'undefined-term': 'bg-primary/15 text-primary border-primary/30',
  'conflict': 'bg-destructive/15 text-destructive border-destructive/30',
  'version-mismatch': 'bg-warning/15 text-warning border-warning/30',
  'dependency': 'bg-accent/15 text-accent border-accent/30',
  'logic': 'bg-primary/15 text-primary border-primary/30',
  'functional': 'bg-primary/15 text-primary border-primary/30',
  'edge': 'bg-warning/15 text-warning border-warning/30',
  'negative': 'bg-destructive/15 text-destructive border-destructive/30',
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="outline" className={`text-xs capitalize ${colors[severity as keyof typeof colors] || 'bg-muted/15 text-muted-foreground border-muted/30'}`}>
      {severity}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const label = category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <Badge variant="outline" className={`text-xs ${categoryColors[category] || 'bg-muted/15 text-muted-foreground border-muted/30'}`}>
      {label}
    </Badge>
  );
}
