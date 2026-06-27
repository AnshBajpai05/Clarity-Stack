import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Sparkles, ChevronLeft, ChevronUp, ChevronDown, MessageSquare, Star, ArrowLeft, Zap, AlertTriangle, Clock, Pencil, Trash2, CheckCircle, Lightbulb, FileText, Code, HelpCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { KnowledgeCardData, CardType } from '@/components/cards/KnowledgeCard';
import { CardDetailDrawer } from '@/components/cards/CardDetailDrawer';
import { ProjectSelectionPage, ProjectWithGlow } from '@/components/cards/ProjectSelectionPage';
import { cn } from '@/lib/utils';
import { getProjects, getChats, getTemporalCards, deleteTemporalCard, autoGenerateCards } from '@/lib/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface ExtendedCardData extends KnowledgeCardData {
  isPinned?: boolean;
}

interface ChatWithCards {
  id: string;
  title: string;
  phase: string;
  owner: string;
  project_id: string;
  cards: ExtendedCardData[];
}

const typeConfig: Record<CardType, { icon: any; color: string; bg: string; border: string; glow: string; label: string }> = {
  decision: { icon: CheckCircle, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', glow: '192 91% 55%', label: 'Decision' },
  insight: { icon: Lightbulb, color: 'text-neon-violet', bg: 'bg-neon-violet/10', border: 'border-neon-violet/30', glow: '270 60% 60%', label: 'Insight' },
  action: { icon: FileText, color: 'text-neon-mint', bg: 'bg-neon-mint/10', border: 'border-neon-mint/30', glow: '160 60% 55%', label: 'Action' },
  architecture: { icon: Code, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', glow: '192 91% 55%', label: 'Architecture' },
  risk: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', glow: '0 72% 51%', label: 'Risk' },
  conflict: { icon: AlertTriangle, color: 'text-neon-peach', bg: 'bg-neon-peach/10', border: 'border-neon-peach/30', glow: '25 95% 70%', label: 'Conflict' },
  progress: { icon: CheckCircle, color: 'text-[hsl(var(--success))]', bg: 'bg-[hsl(var(--success))]/10', border: 'border-[hsl(var(--success))]/30', glow: '152 60% 42%', label: 'Progress' },
  question: { icon: HelpCircle, color: 'text-[hsl(var(--warning))]', bg: 'bg-[hsl(var(--warning))]/10', border: 'border-[hsl(var(--warning))]/30', glow: '38 92% 50%', label: 'Question' },
  general: { icon: FileText, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30', glow: '215 20% 55%', label: 'General' },
  unknown: { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-muted/30', glow: '215 20% 55%', label: 'Unknown' },
};

const confidenceColors: Record<string, string> = {
  high: 'text-neon-mint',
  medium: 'text-neon-peach',
  low: 'text-destructive',
};

function mapLabelToCardType(label: string | null, category?: string): CardType {
  const source = (category || label || 'general').toLowerCase();
  const valid = ['risk', 'decision', 'architecture', 'action', 'insight', 'progress', 'conflict', 'question', 'general'];
  return valid.includes(source) ? source as CardType : 'general';
}

const GLOW_COLORS = ['192 91% 55%', '270 60% 60%', '160 60% 55%', '25 95% 70%', '0 72% 51%'];
function getProjectColor(projectId: any): string {
  if (!projectId) return GLOW_COLORS[0];
  const sum = String(projectId).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return GLOW_COLORS[sum % GLOW_COLORS.length];
}

function getTimelineText(cards: ExtendedCardData[]): string {
  if (cards.length === 0) return '';
  const dates = cards.map(c => new Date(c.created_at).getTime());
  const min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return min.getTime() === max.getTime() ? `${cards.length} card created ${f(min)}` : `${cards.length} cards: ${f(min)} – ${f(max)}`;
}

function sortCardsWithPinned(cards: ExtendedCardData[]): ExtendedCardData[] {
  return [...cards].sort((a, b) => (a.isPinned === b.isPinned ? 0 : a.isPinned ? -1 : 1));
}

export default function CardsPage() {
  const [projects, setProjects] = useState<ProjectWithGlow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [currentChatIndex, setCurrentChatIndex] = useState(0);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [selectedCard, setSelectedCard] = useState<KnowledgeCardData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [chatsWithCards, setChatsWithCards] = useState<ChatWithCards[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const f = await getProjects();
        setProjects(f.map(p => ({ id: p.id, name: p.name || 'Project', context: p.purpose || '', glowColor: getProjectColor(p.id) })));
      } catch (err) { console.error(err); } finally { setLoadingProjects(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    (async () => {
      setLoadingCards(true);
      try {
        const [ch, cr] = await Promise.all([getChats(selectedProjectId), getTemporalCards(selectedProjectId)]);
        const map = new Map<string, any>();
        map.set('project-context', { id: 'project-context', title: 'Project Context', phase: 'General', cards: [] });
        if (Array.isArray(ch)) ch.forEach(c => map.set(c.id, { ...c, cards: [] }));
        if (Array.isArray(cr)) {
          cr.forEach(c => {
            if (!c) return;
            const ui: ExtendedCardData = {
              id: c._id || c.id || Math.random().toString(),
              chat_id: c.sourceChatIds?.[0] || c.chat_id || 'project-context',
              chat_title: 'Chat',
              project_id: selectedProjectId,
              type: mapLabelToCardType(c.label, c.category),
              title: c.title || 'Untitled',
              summary: c.summary || '',
              tags: c.tags || [],
              confidence: c.confidence || 'medium',
              version: `v${c.version || 1}.0`,
              created_at: c.createdAt || new Date().toISOString(),
              updated_at: c.updatedAt || new Date().toISOString(),
              isPinned: false
            };
            const g = map.get(ui.chat_id) || map.get('project-context');
            ui.chat_title = g.title;
            g.cards.push(ui);
          });
        }
        setChatsWithCards(Array.from(map.values()).filter(c => c.cards.length > 0).sort((a,b) => a.id === 'project-context' ? -1 : 1));
        setCurrentChatIndex(0); setCurrentCardIndex(0);
      } catch (err) { console.error(err); } finally { setLoadingCards(false); }
    })();
  }, [selectedProjectId]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const currentChat = chatsWithCards[currentChatIndex];
  const sortedCards = currentChat ? sortCardsWithPinned(currentChat.cards) : [];
  const currentCard = sortedCards[currentCardIndex];

  const navigateChat = (dir: 'prev' | 'next') => {
    setIsTransitioning(true); setTimeout(() => setIsTransitioning(false), 300);
    if (dir === 'prev' && currentChatIndex > 0) setCurrentChatIndex(currentChatIndex - 1);
    else if (dir === 'next' && currentChatIndex < chatsWithCards.length - 1) setCurrentChatIndex(currentChatIndex + 1);
  };

  const navigateCard = (dir: 'prev' | 'next') => {
    if (dir === 'prev' && currentCardIndex > 0) setCurrentCardIndex(currentCardIndex - 1);
    else if (dir === 'next' && currentCardIndex < sortedCards.length - 1) setCurrentCardIndex(currentCardIndex + 1);
  };

  const togglePin = (id: string, e: any) => {
    e.stopPropagation();
    setChatsWithCards(p => p.map(ch => ({ ...ch, cards: ch.cards.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c) })));
  };

  const handleDeleteCard = async (id: string, e: any) => {
    e.stopPropagation();
    if (!window.confirm('Delete this card? This cannot be undone.')) return;
    try {
      await deleteTemporalCard(id);
      setChatsWithCards(p => p.map(ch => ({ ...ch, cards: ch.cards.filter(c => c.id !== id) })).filter(ch => ch.cards.length > 0));
      setCurrentCardIndex(0);
    } catch (err) {
      console.error(err);
    }
  };

  try {
    if (!selectedProjectId) {
      return (
        <MainLayout>
          {loadingProjects ? <div className="h-full flex items-center justify-center"><LoadingSpinner text="Scanning Hubs..." /></div>
          : <ProjectSelectionPage projects={projects} onSelectProject={setSelectedProjectId} />}
        </MainLayout>
      );
    }

    if (loadingCards) return <MainLayout><div className="h-full flex items-center justify-center"><LoadingSpinner text="Synthesizing Deck..." /></div></MainLayout>;

    if (!currentChat || !currentCard) {
      return (
        <MainLayout>
          <div className="p-10 h-full flex flex-col">
            <Button variant="ghost" onClick={() => setSelectedProjectId(null)} className="mb-8 w-fit"><ArrowLeft className="w-4 h-4 mr-2" /> All Projects</Button>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center glass-panel p-12 max-w-md">
                <Layers className="w-16 h-16 text-muted-foreground mx-auto mb-6 opacity-20" />
                <h2 className="text-2xl font-bold mb-3 text-foreground">Deck is Empty</h2>
                <p className="text-muted-foreground mb-8 text-sm">No insights extracted for {selectedProject?.name}. Click below to trigger the synthesis engine.</p>
                <Button variant="neon" size="lg" onClick={() => window.location.reload()}><Zap className="w-5 h-5 mr-2" /> Generate Now</Button>
              </div>
            </div>
          </div>
        </MainLayout>
      );
    }

    const config = typeConfig[currentCard.type] || typeConfig.general;
    const Icon = config.icon;

    return (
      <MainLayout wide>
        <div className="flex flex-col h-screen max-h-screen overflow-hidden p-8">
          <header className="flex items-center justify-between mb-10 flex-shrink-0">
            <div className="flex items-center gap-6">
              <Button variant="ghost" size="icon" onClick={() => setSelectedProjectId(null)} className="rounded-2xl glass-panel-hover"><ChevronLeft className="w-6 h-6" /></Button>
              <div>
                <h1 className="text-3xl font-display font-extrabold tracking-tight gradient-text">Knowledge Deck</h1>
                <p className="text-sm text-muted-foreground mt-1">Cross-thread intelligence for <span className="text-foreground font-medium">{selectedProject?.name}</span></p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3 bg-muted/20 px-5 py-2.5 rounded-2xl border border-border/50">
              <Sparkles className="w-4 h-4 text-neon-violet animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">Neural Synthesis Active</span>
            </div>
          </header>

          <main className="flex-1 flex gap-10 min-h-0 relative">
            <aside className="w-96 flex flex-col gap-4 overflow-y-auto no-scrollbar pb-20">
              {chatsWithCards.map((chat, idx) => (
                <button key={chat.id} onClick={() => { setCurrentChatIndex(idx); setCurrentCardIndex(0); }}
                  className={cn("group flex flex-col gap-3 p-5 rounded-3xl transition-all border text-left",
                    idx === currentChatIndex ? "bg-primary/10 border-primary/40 shadow-2xl shadow-primary/10" : "bg-card/30 border-transparent hover:bg-card/60")}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center transition-colors", idx === currentChatIndex ? "bg-primary/20" : "bg-muted/20")}>
                      <MessageSquare className={cn("w-5 h-5", idx === currentChatIndex ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={cn("font-bold text-sm truncate", idx === currentChatIndex ? "text-primary" : "text-foreground")}>{chat.title}</h3>
                      <p className="text-[10px] uppercase tracking-tighter text-muted-foreground/60 font-bold">{chat.phase}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground/80">
                    <span>{chat.cards.length} Fragments</span>
                    <span className="bg-muted/30 px-2 py-0.5 rounded-full">{chat.owner || 'AI Agent'}</span>
                  </div>
                </button>
              ))}
            </aside>

            <section className="flex-1 flex flex-col items-center justify-center gap-10 relative pb-24">
              <div className="w-full max-w-3xl flex items-center justify-between px-2">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-10 rounded-full bg-primary/20 relative overflow-hidden"><div className="absolute top-0 left-0 w-full bg-primary transition-all duration-500" style={{ height: `${((currentChatIndex + 1) / chatsWithCards.length) * 100}%` }} /></div>
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Current Focus</p>
                    <h2 className="text-lg font-bold truncate max-w-md">{currentChat.title}</h2>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Timeline Status</p>
                  <p className="text-xs text-muted-foreground/80 italic">{getTimelineText(sortedCards)}</p>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={`${currentChat.id}-${currentCard.id}`} initial={{ opacity: 0, scale: 0.98, y: isTransitioning ? 0 : 20, x: isTransitioning ? 40 : 0 }} animate={{ opacity: 1, scale: 1, y: 0, x: 0 }} exit={{ opacity: 0, scale: 0.98, y: isTransitioning ? 0 : -20, x: isTransitioning ? -40 : 0 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="w-full max-w-3xl relative">
                  <div className="absolute -inset-10 rounded-full opacity-30 blur-[100px] pointer-events-none transition-all duration-1000" style={{ background: `radial-gradient(circle, hsl(${config.glow} / 0.6), transparent 70%)` }} />
                  <div className="glass-panel p-12 w-full cursor-pointer group relative overflow-hidden transition-all duration-500 hover:border-primary/40" style={{ boxShadow: `0 0 80px hsl(${config.glow} / 0.08)` }} onClick={() => { setSelectedCard(currentCard); setDrawerOpen(true); }}>
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary/10 to-transparent blur-3xl opacity-20 -mr-24 -mt-24" />
                    <div className="absolute top-8 right-8 flex gap-3 z-20">
                      <button onClick={(e) => { e.stopPropagation(); togglePin(currentCard.id, e); }} className={cn("w-10 h-10 rounded-2xl flex items-center justify-center transition-all glass-panel-hover", currentCard.isPinned ? "text-neon-peach bg-neon-peach/10 border-neon-peach/30" : "text-muted-foreground opacity-0 group-hover:opacity-100")}>
                        <Star className={cn("w-5 h-5", currentCard.isPinned && "fill-current")} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteCard(currentCard.id, e); }} className="w-10 h-10 rounded-2xl flex items-center justify-center glass-panel-hover text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 mb-8">
                      <span className={cn("flex items-center gap-2.5 px-4 py-2 rounded-2xl border text-xs font-black uppercase tracking-[0.2em]", config.bg, config.border, config.color)}>
                        <Icon className="w-4 h-4" /> {config.label}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-border" />
                      <span className="text-xs font-bold text-muted-foreground/60 tracking-widest uppercase">{currentCard.version}</span>
                    </div>

                    <h2 className="text-4xl font-display font-extrabold text-foreground mb-6 leading-[1.1] tracking-tight">{currentCard.title}</h2>
                    <p className="text-xl text-muted-foreground/90 leading-relaxed mb-10 font-medium">{currentCard.summary}</p>

                    <div className="flex gap-2.5 flex-wrap mb-10">
                      {currentCard.tags.map(t => <span key={t} className="text-xs font-bold px-4 py-1.5 rounded-2xl bg-muted/40 text-muted-foreground/90 border border-border/40 hover:border-primary/40 hover:text-primary transition-colors cursor-default">#{t}</span>)}
                    </div>

                    <div className="flex items-center justify-between pt-8 border-t border-white/5">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", confidenceColors[currentCard.confidence]?.replace('text-', 'bg-'))} />
                        <span className={cn("text-xs font-black uppercase tracking-widest", confidenceColors[currentCard.confidence])}>{currentCard.confidence} Confidence Level</span>
                      </div>
                      <div className="flex -space-x-2">
                        {[1,2,3].map(i => <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-muted/50 flex items-center justify-center text-[10px] font-bold">AI</div>)}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              <nav className="flex items-center gap-6 z-10">
                <Button variant="ghost" size="icon" onClick={() => navigateCard('prev')} disabled={currentCardIndex === 0} className="w-12 h-12 rounded-2xl glass-panel-hover"><ChevronUp className="w-6 h-6" /></Button>
                <div className="flex items-center gap-2">
                  {sortedCards.map((_, i) => (
                    <button key={i} onClick={() => setCurrentCardIndex(i)} className={cn("h-1.5 rounded-full transition-all duration-300", i === currentCardIndex ? "w-10 bg-primary shadow-lg shadow-primary/40" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60")} />
                  ))}
                </div>
                <Button variant="ghost" size="icon" onClick={() => navigateCard('next')} disabled={currentCardIndex === sortedCards.length - 1} className="w-12 h-12 rounded-2xl glass-panel-hover"><ChevronDown className="w-6 h-6" /></Button>
              </nav>
            </section>
          </main>

          <CardDetailDrawer card={selectedCard} open={drawerOpen} onOpenChange={setDrawerOpen} />
        </div>
      </MainLayout>
    );
  } catch (err: any) {
    return <MainLayout><div className="h-full flex items-center justify-center p-8"><div className="glass-panel p-10 text-center max-w-md"><AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-6" /><h2 className="text-2xl font-bold mb-3">Render Exception</h2><p className="text-muted-foreground mb-8 text-sm">{err.message}</p><Button variant="outline" onClick={() => window.location.reload()}>Re-initialize</Button></div></div></MainLayout>;
  }
}
