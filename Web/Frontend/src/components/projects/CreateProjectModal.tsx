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
      <DialogContent className="glass-panel border-neon-cyan/30 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="gradient-text">Create New Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Project Name *"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          <Textarea
            placeholder="Project Purpose — why does this exist? *"
            value={purpose}
            onChange={e => setPurpose(e.target.value)}
          />

          <Textarea
            placeholder="Success Criteria — what does good look like? *"
            value={success}
            onChange={e => setSuccess(e.target.value)}
          />

          <Textarea
            placeholder="Constraints — risks, limits, assumptions *"
            value={constraints}
            onChange={e => setConstraints(e.target.value)}
          />

          <Input
            placeholder="Owner (optional)"
            value={owner}
            onChange={e => setOwner(e.target.value)}
          />

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
