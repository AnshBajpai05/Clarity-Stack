import { Globe } from "lucide-react";
import type { ScanResult } from "@/lib/api";

const DomainInfo = ({ result }: { result: ScanResult }) => (
  <div className="glass-card p-4 animate-fade-in">
    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
      <Globe className="h-4 w-4 text-primary" /> Network Status
    </h3>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <div>
        <p className="text-muted-foreground">Final URL</p>
        <p className="text-foreground font-medium truncate">{result.finalUrl}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Domain</p>
        <p className="text-foreground font-medium">{result.domain}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Load Time</p>
        <p className="text-foreground font-medium">{result.loadTime.toFixed(2)}s</p>
      </div>
      <div>
        <p className="text-muted-foreground">HTTP Status</p>
        <p className={`font-medium ${result.httpStatus === 200 ? "text-safe" : "text-danger"}`}>
          {result.httpStatus === null ? "OFFLINE" : result.httpStatus}
        </p>
      </div>
    </div>
  </div>
);

export default DomainInfo;
