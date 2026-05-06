import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Sparkles, Plus, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, MessageSquare, Star, ArrowLeft } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { KnowledgeCardData, CardType } from '@/components/cards/KnowledgeCard';
import { CardDetailDrawer } from '@/components/cards/CardDetailDrawer';
import { ProjectSelectionPage, ProjectWithGlow } from '@/components/cards/ProjectSelectionPage';
import { cn } from '@/lib/utils';
import { 
  CheckCircle, 
  Lightbulb, 
  FileText, 
  Code, 
  AlertTriangle, 
  HelpCircle,
  Pencil
} from 'lucide-react';

import { getProjects, getChats, getTemporalCards, Project, Chat } from '@/lib/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

// Extended card data with pin support
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

const typeConfig: Record<CardType, { icon: typeof CheckCircle; color: string; bg: string; border: string; glow: string; label: string }> = {
  decision: { icon: CheckCircle, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', glow: '192 91% 55%', label: 'Decision' },
  insight: { icon: Lightbulb, color: 'text-neon-violet', bg: 'bg-neon-violet/10', border: 'border-neon-violet/30', glow: '270 60% 60%', label: 'Insight' },
  action: { icon: FileText, color: 'text-neon-peach', bg: 'bg-neon-peach/10', border: 'border-neon-peach/30', glow: '25 95% 70%', label: 'Action' },
  reference: { icon: Code, color: 'text-neon-mint', bg: 'bg-neon-mint/10', border: 'border-neon-mint/30', glow: '160 60% 55%', label: 'Architecture' },
  risk: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', glow: '0 72% 51%', label: 'Risk' },
  unknown: { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-muted/30', glow: '215 20% 55%', label: 'Unknown' },
};

const confidenceColors: Record<string, string> = {
  high: 'text-neon-mint',
  medium: 'text-neon-peach',
  low: 'text-destructive',
};

// Map TemporalCard labels to UI CardTypes
function mapLabelToCardType(label: string): CardType {
  switch (label) {
    case 'risk': return 'risk';
    case 'decision': return 'decision';
    case 'architecture': return 'reference';
    case 'progress': return 'action';
    case 'conflict': return 'unknown';
    case 'general': default: return 'insight';
  }
}

// Generate deterministic random colors for projects based on their ID length
const GLOW_COLORS = ['192 91% 55%', '270 60% 60%', '160 60% 55%', '25 95% 70%', '0 72% 51%'];
function getProjectColor(projectId: string): string {
  const sum = projectId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return GLOW_COLORS[sum % GLOW_COLORS.length];
}

// Helper to format date range for timeline
function getTimelineText(cards: ExtendedCardData[]): string {
  if (cards.length === 0) return '';
  const dates = cards.map(c => new Date(c.created_at).getTime());
  const earliest = new Date(Math.min(...dates));
  const latest = new Date(Math.max(...dates));
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (earliest.getTime() === latest.getTime()) {
    return `${cards.length} card${cards.length > 1 ? 's' : ''} created ${formatDate(earliest)}`;
  }
  return `${cards.length} cards created between ${formatDate(earliest)}–${formatDate(latest)}`;
}

// Sort cards with pinned first
function sortCardsWithPinned(cards: ExtendedCardData[]): ExtendedCardData[] {
  return [...cards].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });
}

export default function CardsPage() {
  const [projects, setProjects] = useState<ProjectWithGlow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [currentChatIndex, setCurrentChatIndex] = useState(0);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [selectedCard, setSelectedCard] = useState<KnowledgeCardData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatCardPositions, setChatCardPositions] = useState<Record<string, number>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [chatsWithCards, setChatsWithCards] = useState<ChatWithCards[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

  // Fetch projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const fetched = await getProjects();
        setProjects(fetched.map(p => ({
          id: p.id,
          name: p.name,
          context: p.purpose || 'No context provided',
          glowColor: getProjectColor(p.id)
        })));
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        setLoadingProjects(false);
      }
    }
    loadProjects();
  }, []);

  // Fetch chats and cards when project selected
  useEffect(() => {
    if (!selectedProjectId) return;

    async function loadCardsData() {
      setLoadingCards(true);
      try {
        const [chats, cards] = await Promise.all([
          getChats(selectedProjectId as string),
          getTemporalCards(selectedProjectId as string)
        ]);

        const chatMap = new Map<string, ChatWithCards>();

        // Create a virtual chat for project-level cards
        chatMap.set('project-context', {
          id: 'project-context',
          title: 'Project Context',
          phase: 'Global',
          owner: 'System',
          project_id: selectedProjectId as string,
          cards: []
        });

        // Initialize real chats
        chats.forEach(chat => {
          chatMap.set(chat.id, {
            id: chat.id,
            title: chat.title || 'Untitled Chat',
            phase: chat.phase || 'General',
            owner: chat.owner || 'Unknown',
            project_id: chat.project_id,
            cards: []
          });
        });

        // Distribute cards to their respective chats
        cards.forEach((card: any) => {
          const uiCard: ExtendedCardData = {
            id: card._id,
            chat_id: card.sourceChatIds?.[0] || 'project-context',
            chat_title: '', // Set below
            project_id: card.projectId,
            type: mapLabelToCardType(card.label),
            title: card.title,
            summary: card.summary,
            tags: card.keyChanges || [card.label],
            confidence: 'high',
            version: `v${card.version}.0`,
            created_at: card.createdAt,
            updated_at: card.createdAt,
            isPinned: false
          };

          const targetChatId = uiCard.chat_id;
          if (chatMap.has(targetChatId)) {
            uiCard.chat_title = chatMap.get(targetChatId)!.title;
            chatMap.get(targetChatId)!.cards.push(uiCard);
          } else {
            // Fallback to project context if chat deleted but card remains
            uiCard.chat_title = 'Project Context';
            uiCard.chat_id = 'project-context';
            chatMap.get('project-context')!.cards.push(uiCard);
          }
        });

        // Filter out chats with no cards, ensuring Project Context is first if it has cards
        const populatedChats = Array.from(chatMap.values()).filter(c => c.cards.length > 0);
        
        // Sort so Project Context is first
        populatedChats.sort((a, b) => {
          if (a.id === 'project-context') return -1;
          if (b.id === 'project-context') return 1;
          return a.title.localeCompare(b.title);
        });

        setChatsWithCards(populatedChats);
      } catch (err) {
        console.error("Failed to load cards for project", err);
      } finally {
        setLoadingCards(false);
      }
    }

    loadCardsData();
  }, [selectedProjectId]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const currentChat = chatsWithCards[currentChatIndex];
  const sortedCards = currentChat ? sortCardsWithPinned(currentChat.cards) : [];
  const currentCard = sortedCards[currentCardIndex];

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setCurrentChatIndex(0);
    setCurrentCardIndex(0);
    setChatCardPositions({});
  };

  const handleUpdateGlowColor = (projectId: string, color: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, glowColor: color } : p
    ));
  };

  const handleBackToProjects = () => {
    setSelectedProjectId(null);
  };

  useEffect(() => {
    if (currentChat) {
      const savedPosition = chatCardPositions[currentChat.id];
      if (savedPosition !== undefined && savedPosition < sortedCards.length) {
        setCurrentCardIndex(savedPosition);
      } else {
        setCurrentCardIndex(0);
      }
    }
  }, [currentChatIndex]);

  useEffect(() => {
    if (currentChat) {
      setChatCardPositions(prev => ({
        ...prev,
        [currentChat.id]: currentCardIndex
      }));
    }
  }, [currentCardIndex, currentChat?.id]);

  const navigateChat = useCallback((direction: 'prev' | 'next') => {
    setIsTransitioning(true);
    setTimeout(() => setIsTransitioning(false), 300);
    
    if (direction === 'prev' && currentChatIndex > 0) {
      setCurrentChatIndex(currentChatIndex - 1);
    } else if (direction === 'next' && currentChatIndex < chatsWithCards.length - 1) {
      setCurrentChatIndex(currentChatIndex + 1);
    }
  }, [currentChatIndex, chatsWithCards.length]);

  const navigateCard = useCallback((direction: 'prev' | 'next') => {
    if (!currentChat) return;
    if (direction === 'prev' && currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
    } else if (direction === 'next' && currentCardIndex < sortedCards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
    }
  }, [currentChat, currentCardIndex, sortedCards.length]);

  useEffect(() => {
    if (!selectedProjectId || chatsWithCards.length === 0) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (drawerOpen) {
        if (e.key === 'Escape') setDrawerOpen(false);
        return;
      }
      if (e.key === 'ArrowLeft') navigateChat('prev');
      if (e.key === 'ArrowRight') navigateChat('next');
      if (e.key === 'ArrowUp') { e.preventDefault(); navigateCard('prev'); }
      if (e.key === 'ArrowDown') { e.preventDefault(); navigateCard('next'); }
      if (e.key === 'Enter' && currentCard) {
        setSelectedCard(currentCard);
        setDrawerOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateChat, navigateCard, currentCard, drawerOpen, selectedProjectId, chatsWithCards.length]);

  const handleCardClick = () => {
    if (currentCard) {
      setSelectedCard(currentCard);
      setDrawerOpen(true);
    }
  };

  const togglePin = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatsWithCards(prev => prev.map(chat => ({
      ...chat,
      cards: chat.cards.map(card => card.id === cardId ? { ...card, isPinned: !card.isPinned } : card)
    })));
  };

  if (loadingProjects) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner text="Loading Projects..." />
        </div>
      </MainLayout>
    );
  }

  // Project Selection Page
  if (!selectedProjectId) {
    return (
      <MainLayout>
        <ProjectSelectionPage
          projects={projects}
          onSelectProject={handleSelectProject}
          onUpdateGlowColor={handleUpdateGlowColor}
        />
      </MainLayout>
    );
  }

  if (loadingCards) {
    return (
      <MainLayout>
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToProjects} className="mb-4 -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> All Projects
            </Button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner text="Loading Cards..." />
          </div>
        </div>
      </MainLayout>
    );
  }

  // Empty state
  if (!currentChat || !currentCard) {
    return (
      <MainLayout>
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <Button variant="ghost" size="sm" onClick={handleBackToProjects} className="mb-4 -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> All Projects
            </Button>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${selectedProject?.glowColor} / 0.3), hsl(${selectedProject?.glowColor} / 0.1))` }}>
                <Layers className="w-5 h-5" style={{ color: `hsl(${selectedProject?.glowColor})` }} />
              </div>
              <h1 className="text-3xl font-bold gradient-text">{selectedProject?.name}</h1>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div className="text-center glass-panel p-8 max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Layers className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No knowledge cards yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Chat with your AI assistant or navigate to Temporal Cards to generate some insights!
              </p>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  const config = typeConfig[currentCard.type];
  const Icon = config.icon;

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Header with back button and project glow */}
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={handleBackToProjects} className="mb-3 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" /> All Projects
          </Button>
          <div className="flex items-center gap-3 mb-2 relative">
            <div className="absolute -inset-4 rounded-2xl opacity-20 blur-xl pointer-events-none" style={{ background: `radial-gradient(circle at 0% 50%, hsl(${selectedProject?.glowColor} / 0.4), transparent 50%)` }} />
            <div className="w-10 h-10 rounded-xl flex items-center justify-center relative" style={{ background: `linear-gradient(135deg, hsl(${selectedProject?.glowColor} / 0.3), hsl(${selectedProject?.glowColor} / 0.1))` }}>
              <Layers className="w-5 h-5" style={{ color: `hsl(${selectedProject?.glowColor})` }} />
            </div>
            <h1 className="text-3xl font-bold gradient-text relative">{selectedProject?.name}</h1>
          </div>
        </div>

        {/* Beta Banner */}
        <div className="mb-4 glass-panel p-3 border-neon-violet/30">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-neon-violet" />
            <p className="text-xs text-muted-foreground">
              <span className="text-neon-violet font-medium">Cards Preview</span> — Arrow keys navigate. ← → chats, ↑ ↓ cards, Enter open, Esc close.
            </p>
          </div>
        </div>

        {/* Main Card Navigator */}
        <div className="flex-1 flex items-center justify-center relative min-h-0">
          
          <button onClick={() => navigateChat('prev')} disabled={currentChatIndex === 0} className={cn("absolute left-0 z-20 p-3 rounded-xl glass-panel transition-all", currentChatIndex === 0 ? "opacity-30 cursor-not-allowed" : "hover:border-primary/50 hover:scale-105")}>
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button onClick={() => navigateChat('next')} disabled={currentChatIndex >= chatsWithCards.length - 1} className={cn("absolute right-0 z-20 p-3 rounded-xl glass-panel transition-all", currentChatIndex >= chatsWithCards.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:border-primary/50 hover:scale-105")}>
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Card Container */}
          <div className="flex flex-col items-center gap-4 w-full max-w-2xl mx-12">
            
            <button onClick={() => navigateCard('prev')} disabled={currentCardIndex === 0} className={cn("p-2 rounded-xl glass-panel transition-all", currentCardIndex === 0 ? "opacity-30 cursor-not-allowed" : "hover:border-primary/50 hover:scale-105")}>
              <ChevronUp className="w-5 h-5" />
            </button>

            {/* Context Stack Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded-full glass-panel" style={{ borderColor: `hsl(${selectedProject?.glowColor} / 0.3)` }}>{selectedProject?.name}</span>
              <span className="opacity-50">→</span>
              <span className="px-2 py-1 rounded-full glass-panel">{currentChat.title}</span>
              <span className="opacity-50">→</span>
              <span className={cn("px-2 py-1 rounded-full", config.bg, config.border, "border")}>{config.label}</span>
              <span className="opacity-50">→</span>
              <span className="px-2 py-1 rounded-full bg-muted/30 font-mono">{currentCard.version}</span>
            </div>

            {/* Chat Title Header with Timeline */}
            <div className="glass-panel px-4 py-3 w-full">
              <div className="flex items-center gap-3 mb-1">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">{currentChat.title}</span>
                <span className="text-xs text-muted-foreground">— {currentChat.phase}</span>
                <span className="ml-auto text-xs text-muted-foreground">Chat {currentChatIndex + 1} of {chatsWithCards.length}</span>
              </div>
              <p className="text-xs text-muted-foreground/70 ml-7">{getTimelineText(sortedCards)}</p>
            </div>

            {/* Large Card with Glow Halo */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentChat.id}-${currentCard.id}`}
                initial={{ opacity: 0, y: isTransitioning ? 0 : 10, x: isTransitioning ? 20 : 0 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, y: isTransitioning ? 0 : -10, x: isTransitioning ? -20 : 0 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="w-full relative"
              >
                <div className="absolute -inset-3 rounded-2xl opacity-30 blur-xl pointer-events-none" style={{ background: `radial-gradient(circle at 50% 50%, hsl(${config.glow} / 0.4), transparent 70%)` }} />

                <div onClick={handleCardClick} className="glass-panel-hover p-8 w-full cursor-pointer group relative" style={{ boxShadow: `0 0 40px hsl(${config.glow} / 0.1)` }}>
                  <button onClick={(e) => togglePin(currentCard.id, e)} className={cn("absolute top-4 left-4 w-8 h-8 rounded-lg flex items-center justify-center transition-all", currentCard.isPinned ? "bg-neon-peach/20 text-neon-peach" : "bg-muted/50 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted")}>
                    <Star className={cn("w-4 h-4", currentCard.isPinned && "fill-current")} />
                  </button>

                  <div className="flex items-center gap-3 mb-4 pl-10">
                    <span className={cn("inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border font-medium", config.bg, config.border, config.color)}>
                      <Icon className="w-4 h-4" /> {config.label}
                    </span>
                    <span className="text-sm text-muted-foreground">from {currentCard.chat_title}</span>
                  </div>

                  <h2 className="text-2xl font-bold text-foreground mb-4">{currentCard.title}</h2>
                  <p className="text-muted-foreground leading-relaxed mb-6 text-base">{currentCard.summary}</p>

                  <div className="flex gap-2 flex-wrap mb-6">
                    {currentCard.tags.map((tag) => (
                      <span key={tag} className="text-sm px-3 py-1 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors">#{tag}</span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-glass">
                    <span className={cn("font-medium", confidenceColors[currentCard.confidence])}>Confidence: {currentCard.confidence.charAt(0).toUpperCase() + currentCard.confidence.slice(1)}</span>
                    <span className="text-muted-foreground font-mono text-sm">{currentCard.version}</span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center gap-2">
              {sortedCards.map((card, idx) => (
                <button key={card.id} onClick={() => setCurrentCardIndex(idx)} className={cn("h-2 rounded-full transition-all relative", idx === currentCardIndex ? "w-6" : "w-2 hover:bg-muted-foreground", card.isPinned && idx !== currentCardIndex && "bg-neon-peach/50")} style={{ backgroundColor: idx === currentCardIndex ? `hsl(${typeConfig[card.type].glow})` : card.isPinned ? undefined : 'hsl(var(--muted))' }} />
              ))}
            </div>

            <button onClick={() => navigateCard('next')} disabled={currentCardIndex >= sortedCards.length - 1} className={cn("p-2 rounded-xl glass-panel transition-all", currentCardIndex >= sortedCards.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:border-primary/50 hover:scale-105")}>
              <ChevronDown className="w-5 h-5" />
            </button>

            <p className="text-xs text-muted-foreground">Card {currentCardIndex + 1} of {sortedCards.length}</p>
          </div>
        </div>

        <CardDetailDrawer card={selectedCard} open={drawerOpen} onOpenChange={setDrawerOpen} />
      </div>
    </MainLayout>
  );
}
