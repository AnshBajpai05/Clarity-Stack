import { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;

  // ⬇️ now sends chat context to API
  onSubmit: (title: string, sourceType: string, context: {
    purpose?: string;
    phase?: string;
    description?: string;
    owner?: string;
  }) => Promise<void>;

  isLoading: boolean;
}

const sourceTypes = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'slack', label: 'Slack' },
  { value: 'email', label: 'Email' },
  { value: 'user', label: 'User Input' },
];

export function CreateChatModal({ isOpen, onClose, onSubmit, isLoading }: CreateChatModalProps) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState('user');

  // 🧠 NEW — chat context fields
  const [purpose, setPurpose] = useState('');
  const [phase, setPhase] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await onSubmit(
      title.trim(),
      sourceType,
      {
        purpose: purpose.trim() || undefined,
        phase: phase.trim() || undefined,
        description: description.trim() || undefined,
        owner: owner.trim() || undefined
      }
    );

    // reset
    setTitle('');
    setSourceType('user');
    setPurpose('');
    setPhase('');
    setDescription('');
    setOwner('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      {/* max-h + scroll: 6 fields overflow short viewports; without this the submit
          button is unreachable on ≤800px-tall screens */}
      <div className="relative glass-panel p-6 w-full max-w-md animate-scale-in shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold gradient-text">Create New Chat</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <Label htmlFor="chat-title" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Chat Title</Label>
            <Input
              id="chat-title"
              placeholder="e.g. Sprint 1 Class Design Review, Slack Logs Import *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-muted/50 border-glass focus:border-primary"
              autoFocus
            />
          </div>

          {/* Source Type */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Source Type</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="bg-muted/50 border-glass focus:border-primary">
                <SelectValue placeholder="Select source type" />
              </SelectTrigger>
              <SelectContent className="glass-panel border-glass">
                {sourceTypes.map((type) => (
                   <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 📌 NEW — Chat Context */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Purpose</Label>
            <Input
              placeholder="e.g. Aligning on database schema migration and UML Class boundaries"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="bg-muted/50 border-glass"
            />
            <p className="text-[10px] text-slate-400/60 italic mt-0.5">
              💡 Helps the synthesis engine isolate active architecture decisions and flag blockers.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Phase</Label>
            <Input
              placeholder="e.g. Design, Research, Planning, Retrospective"
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="bg-muted/50 border-glass"
            />
            <p className="text-[10px] text-slate-400/60 italic mt-0.5">
              💡 Groups conversation timeline logs chronologically in your Delta drift history.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Description</Label>
            <Input
              placeholder="e.g. Discussing the migration from PostgreSQL to MongoDB offline cluster"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-muted/50 border-glass"
            />
            <p className="text-[10px] text-slate-400/60 italic mt-0.5">
              💡 Rich descriptions are parsed to generate learning checkpoints for Spaced Repetition cards.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Owner</Label>
            <Input
              placeholder="e.g. alice@claritystack.io"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="bg-muted/50 border-glass"
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="ghost" 
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>

            <Button 
              type="submit" 
              variant="neon"
              className="flex-1"
              disabled={!title.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Chat
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
