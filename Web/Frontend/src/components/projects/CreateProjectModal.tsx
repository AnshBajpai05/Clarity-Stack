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
