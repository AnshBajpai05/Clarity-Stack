import { Lock, Unlock, ShieldOff } from "lucide-react";
import type { ScanResult } from "@/lib/api";

const SslPanel = ({ ssl }: { ssl: ScanResult["ssl"] }) => {
  if (!ssl) {
    return (
      <div className="glass-card p-4 animate-fade-in">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ShieldOff className="h-4 w-4 text-danger" />
          SSL Certificate
          <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-danger/15 text-danger">No SSL</span>
        </h3>
        <p className="text-xs text-muted-foreground">No SSL certificate information available for this URL.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        {ssl.valid ? <Lock className="h-4 w-4 text-safe" /> : <Unlock className="h-4 w-4 text-danger" />}
        SSL Certificate
        <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${ssl.valid ? "bg-safe/15 text-safe" : "bg-danger/15 text-danger"}`}>
          {ssl.valid ? "Valid" : "Invalid"}
        </span>
      </h3>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Issuer</p>
          <p className="text-foreground font-medium truncate">{ssl.issuer}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Valid From</p>
          <p className="text-foreground font-medium">{ssl.validFrom}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Valid To</p>
          <p className="text-foreground font-medium">{ssl.validTo}</p>
        </div>
      </div>
    </div>
  );
};

export default SslPanel;
