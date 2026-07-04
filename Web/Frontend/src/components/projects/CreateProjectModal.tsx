import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { CreateProjectPayload } from '@/lib/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateProjectPayload) => void;
  isLoading: boolean;
}

export function CreateProjectModal({ isOpen, onClose, onSubmit, isLoading }: Props) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [success, setSuccess] = useState('');
  const [constraints, setConstraints] = useState('');
  const [owner, setOwner] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');

  const canSubmit =
    name.trim() &&
    purpose.trim() &&
    success.trim() &&
    constraints.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;

    onSubmit({
      name,
      purpose,
      success_criteria: success,
      constraints,
      owner: owner || null,
      visibility,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* max-h + scroll: on short screens (≤800px) the form is taller than the viewport
          and the submit button was unreachable — the dialog itself must scroll */}
      <DialogContent className="glass-panel border-neon-cyan/30 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="gradient-text">Create New Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Project Name</label>
            <Input
              placeholder="e.g. AI Research Platform, Clarity Hub *"
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-slate-900/50 border-white/10"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Project Purpose</label>
            <Textarea
              placeholder="e.g. To index core architectural decisions, microservice logs, and timeline specifications for the engineering team *"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              className="bg-slate-900/50 border-white/10 min-h-[70px]"
            />
            <p className="text-[10px] text-muted-foreground/70 italic mt-0.5">
              💡 ClarityStack's NLP parser uses this to filter chat noise and build entity nodes in the Knowledge Graph.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Success Criteria</label>
            <Textarea
              placeholder="e.g. 100% compliance score on SRS documents, zero critical ambiguities, and complete PlantUML mapping *"
              value={success}
              onChange={e => setSuccess(e.target.value)}
              className="bg-slate-900/50 border-white/10 min-h-[70px]"
            />
            <p className="text-[10px] text-muted-foreground/70 italic mt-0.5">
              💡 The SRS Intelligence Engine audits your requirements directly against these criteria.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Constraints</label>
            <Textarea
              placeholder="e.g. Must run offline locally on port 8000, rely on local SQLite, and avoid external API dependencies *"
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              className="bg-slate-900/50 border-white/10 min-h-[70px]"
            />
            <p className="text-[10px] text-muted-foreground/70 italic mt-0.5">
              💡 Key constraints are automatically analyzed by ThreatLens to flag potential security and integration risks.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Owner (Optional)</label>
            <Input
              placeholder="e.g. jayden@claritystack.io"
              value={owner}
              onChange={e => setOwner(e.target.value)}
              className="bg-slate-900/50 border-white/10"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Visibility</label>
            <div className="flex bg-white/5 p-1 rounded-lg w-fit">
              <button
                type="button"
                className={`px-4 py-1.5 text-xs rounded-md transition-colors ${visibility === 'private' ? 'bg-purple-600 shadow-md text-white' : 'hover:bg-white/10 text-muted-foreground'}`}
                onClick={() => setVisibility('private')}
              >
                Private
              </button>
              <button
                type="button"
                className={`px-4 py-1.5 text-xs rounded-md transition-colors ${visibility === 'public' ? 'bg-purple-600 shadow-md text-white' : 'hover:bg-white/10 text-muted-foreground'}`}
                onClick={() => setVisibility('public')}
              >
                Public
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              {visibility === 'public' ? 'Anyone can find and request access to this project.' : 'Only members can find and access this project.'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>

            <Button
              variant="neon"
              disabled={!canSubmit || isLoading}
              onClick={handleSubmit}
            >
              {isLoading ? 'Creating…' : 'Create Project'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
