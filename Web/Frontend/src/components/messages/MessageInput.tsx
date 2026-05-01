import { useState } from 'react';
import { Send, Loader2, User, Bot, Shield, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface MessageInputProps {
  onSubmit: (text: string, role: string, sender: string) => Promise<void>;
  isLoading: boolean;
}

const roles = [
  { value: 'user', label: 'User', icon: User },
  { value: 'assistant', label: 'Assistant', icon: Bot },
  { value: 'system', label: 'System', icon: Shield },
  { value: 'moderator', label: 'Moderator', icon: Megaphone },
];

export function MessageInput({ onSubmit, isLoading }: MessageInputProps) {
  const [text, setText] = useState('');
  const [role, setRole] = useState('user');
  const [sender, setSender] = useState('');

  const trimmedText = text.trim();
  const trimmedSender = sender.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!trimmedText || !trimmedSender || isLoading) return;

    await onSubmit(trimmedText, role, trimmedSender);

    // clear only the text, keep sender for convenience
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel p-4 space-y-3">
      <div className="flex gap-3">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-36 bg-muted/50 border-glass">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-panel border-glass">
            {roles.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                <div className="flex items-center gap-2">
                  <r.icon className="w-4 h-4" />
                  {r.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Sender name..."
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          className="flex-1 bg-muted/50 border-glass focus:border-primary"
        />
      </div>

      <div className="flex gap-3">
        {/* relative wrapper */}
        <div className="relative flex-1">
          <Textarea
            placeholder="Type your message... (Shift+Enter for new line)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="min-h-[80px] bg-muted/50 border-glass focus:border-primary resize-none pr-10"
          />

          {isLoading && (
            <div className="absolute bottom-2 right-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Sending…
            </div>
          )}
        </div>

        <Button
          type="submit"
          variant="neon"
          size="icon"
          className="h-[80px] w-12"
          disabled={!trimmedText || !trimmedSender || isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </div>

    </form>
  );
}
