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
      <div className="relative glass-panel p-6 w-full max-w-md animate-scale-in shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold gradient-text">Create New Chat</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="chat-title">Chat Title</Label>
            <Input
              id="chat-title"
              placeholder="Enter chat title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-muted/50 border-glass focus:border-primary"
              autoFocus
            />
          </div>

          {/* Source Type */}
          <div className="space-y-2">
            <Label>Source Type</Label>
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
          <div className="space-y-2">
            <Label>Purpose</Label>
            <Input
              placeholder="Why does this chat exist?"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="bg-muted/50 border-glass"
            />
          </div>

          <div className="space-y-2">
            <Label>Phase</Label>
            <Input
              placeholder="e.g. Data Cleaning, Research, Planning"
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="bg-muted/50 border-glass"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="Short explanation of what happens in this chat"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-muted/50 border-glass"
            />
          </div>

          <div className="space-y-2">
            <Label>Owner</Label>
            <Input
              placeholder="Who manages this chat?"
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
