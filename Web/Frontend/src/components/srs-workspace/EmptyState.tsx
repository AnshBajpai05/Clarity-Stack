import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/store/documentStore";
import { useRef } from "react";

export function EmptyState({ title }: { title: string }) {
  const { uploadPdf, isLoading } = useDocumentStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadPdf(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center animate-slide-in">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-muted/20 border border-border">
        <FileText className="w-8 h-8 text-muted-foreground" />
      </div>

      <h2 className="text-xl font-semibold mb-1">{title}</h2>
      <p className="text-muted-foreground text-sm mb-6 max-w-lg leading-relaxed">
        Upload an SRS PDF to begin analysis.
      </p>

      <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2" disabled={isLoading}>
        <Upload className="w-4 h-4" /> Upload PDF
      </Button>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
    </div>
  );
}
