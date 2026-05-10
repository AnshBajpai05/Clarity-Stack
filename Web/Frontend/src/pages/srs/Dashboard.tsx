import { useDocumentStore } from "@/store/documentStore";
import { AlertTriangle, FileText, Upload, Zap, ArrowRight, Loader2, Sparkles, Play, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProcessingOverlay } from "@/components/ui/ProcessingOverlay";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PIPELINE_STEPS = [
  { icon: Upload, label: "Upload", desc: "PDF Input" },
  { icon: FileText, label: "Extract", desc: "VLM Parsing" },
  { icon: Zap, label: "Structure", desc: "Intelligence" },
  { icon: AlertTriangle, label: "Detect", desc: "Ambiguities" },
];

function LandingView() {
  const { uploadPdf, isLoading, uploadProgress } = useDocumentStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false); // hard lock — prevents concurrent uploads
  const navigate = useNavigate();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingRef.current) return;
    uploadingRef.current = true;
    
    try {
      const { status, docId } = await uploadPdf(file);
      
      if (status === 'duplicate') {
        toast.success("⚡ Already analyzed. Opening results...");
        
        // Find the element and flash it
        const el = document.getElementById(`doc-${docId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-emerald-500', 'shadow-[0_0_20px_rgba(16,185,129,0.3)]', 'transform', 'scale-[1.02]', 'z-10');
          
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-emerald-500', 'shadow-[0_0_20px_rgba(16,185,129,0.3)]', 'transform', 'scale-[1.02]', 'z-10');
            navigate('/srs/issues');
          }, 1200);
        } else {
          navigate('/srs/issues');
        }

      } else {
        // Success
        navigate('/srs/issues');
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload or process document.");
    } finally {
      uploadingRef.current = false;
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-12 animate-slide-in">
      {/* Hero */}
      <div className="text-center pt-8 pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <Zap className="w-3 h-3" /> Requirements Intelligence Engine
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          <span className="gradient-text">SRS Clarity</span>
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
          Upload an SRS document. Get structured requirements with ambiguity detection — automatically.
        </p>
      </div>

      {/* Pipeline */}
      <div className="glass-card p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6 text-center">How It Works</h3>
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center gap-0">
              <div className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${i === 0 ? 'gradient-primary glow-primary' : 'bg-muted/20 border border-border'}`}>
                  <step.icon className={`w-5 h-5 ${i === 0 ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground">{step.desc}</p>
                </div>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="w-8 md:w-16 h-px bg-border mx-1 md:mx-3 mb-8" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Upload CTA */}
      <div className="glass-card p-8 text-center border-primary/20 glow-primary">
        <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 glow-primary">
          {isLoading ? <Loader2 className="w-6 h-6 text-primary-foreground animate-spin" /> : <Play className="w-6 h-6 text-primary-foreground ml-0.5" />}
        </div>
        <h2 className="text-xl font-bold mb-2">{isLoading ? 'Processing...' : 'Upload Your SRS'}</h2>
        <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
          {uploadProgress || 'Upload a PDF to extract requirements, detect ambiguities, and get actionable insights.'}
        </p>
        <Button onClick={() => fileRef.current?.click()} className="gap-2 gradient-primary border-0 px-6" disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isLoading ? 'Processing...' : 'Upload PDF'}
        </Button>
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
      </div>

      {/* Capabilities — trimmed */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 text-center">What You Get</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: FileText, title: "Structured Requirements", desc: "User stories parsed into Role, Goal, Reason with hierarchical acceptance criteria", color: "text-primary bg-primary/10" },
            { icon: AlertTriangle, title: "Ambiguity Detection", desc: "Vague terms like \"quickly\", \"user-friendly\" flagged with measurable alternatives", color: "text-warning bg-warning/10" },
            { icon: Sparkles, title: "Intelligence Model", desc: "If/Then logic extracted, actors normalized, confidence scored", color: "text-accent bg-accent/10" },
          ].map(cap => (
            <div key={cap.title} className="glass-card p-5 group hover:border-primary/30 transition-colors">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${cap.color}`}>
                <cap.icon className="w-5 h-5" />
              </div>
              <h4 className="font-semibold text-sm mb-1">{cap.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DocumentListView() {
  const { documents, fetchDocuments, selectDocument, deleteDocument, isLoading, issues } = useDocumentStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleSelect = async (docId: string) => {
    await selectDocument(docId);
    navigate('/srs/issues');
  };

  const handleDelete = async (docId: string) => {
    await deleteDocument(docId);
    toast.success('Document removed.');
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Processed documents</p>
      </div>

      {/* Alert summary */}
      {issues && (issues.total_ambiguities + (issues.total_conflicts || 0) + (issues.total_gaps || 0)) > 0 && (
        <div className="glass-card p-5 border-warning/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-warning/15 text-warning shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{issues.total_ambiguities + (issues.total_conflicts || 0) + (issues.total_gaps || 0)} Issues Detected</p>
              <div className="flex items-center gap-3 mt-1">
                {issues.total_ambiguities > 0 && <span className="text-xs text-warning">{issues.total_ambiguities} ambiguities</span>}
                {(issues.total_conflicts || 0) > 0 && <span className="text-xs text-destructive">{issues.total_conflicts} conflicts</span>}
                {(issues.total_gaps || 0) > 0 && <span className="text-xs text-accent">{issues.total_gaps} gaps</span>}
              </div>
            </div>
            <Button variant="outline" size="sm" className="ml-auto gap-1.5 shrink-0" onClick={() => navigate('/srs/issues')}>
              View Issues <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Document list */}
      <div className="space-y-3 relative">
        {documents.map(doc => (
          <div key={doc.doc_id}
            id={`doc-${doc.doc_id}`}
            className="glass-card p-5 flex items-center justify-between hover:border-primary/30 transition-all duration-300 cursor-pointer relative bg-slate-900/50 group"
            onClick={() => handleSelect(doc.doc_id)}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{doc.doc_id.replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.stories} stories · {doc.actors.join(', ')} · {doc.original_issues || doc.issues} total issues
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {doc.issues > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
                  {doc.issues} issues
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Resolved
                </span>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                    title="Remove document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove document?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <span className="font-semibold text-foreground">{doc.doc_id.replace(/_/g, ' ')}</span> and all its processed artifacts. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      onClick={() => handleDelete(doc.doc_id)}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        ))}
        {documents.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No documents processed yet. Upload a PDF to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { documents, fetchDocuments, isLoading } = useDocumentStore();

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Removed early return spinner so ProcessingOverlay can take over.

  return (
    <div className="space-y-12">
      <ProcessingOverlay isVisible={isLoading} />
      
      {/* Always show LandingView content */}
      <LandingView />

      {/* Show processed documents below if any exist */}
      {documents.length > 0 && (
        <>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent my-12" />
          <DocumentListView />
        </>
      )}
    </div>
  );
}
