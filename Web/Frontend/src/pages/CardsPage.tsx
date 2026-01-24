import { useState, useCallback, useEffect, useRef } from 'react';
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

// Extended card data with pin support
interface ExtendedCardData extends KnowledgeCardData {
  isPinned?: boolean;
}

// Mock data with glow colors
const mockProjects: ProjectWithGlow[] = [
  { id: 'proj-1', name: 'ClarityStack', context: 'Knowledge management and synthesis platform', glowColor: '192 91% 55%' },
  { id: 'proj-2', name: 'Mobile App', context: 'iOS and Android companion application', glowColor: '270 60% 60%' },
  { id: 'proj-3', name: 'API Gateway', context: 'Centralized API management service', glowColor: '160 60% 55%' },
];

interface ChatWithCards {
  id: string;
  title: string;
  phase: string;
  owner: string;
  project_id: string;
  cards: ExtendedCardData[];
}

const mockChatsWithCards: ChatWithCards[] = [
  {
    id: 'chat-1',
    title: 'Architecture Discussion',
    phase: 'Planning',
    owner: 'Alex',
    project_id: 'proj-1',
    cards: [
      {
        id: '1',
        chat_id: 'chat-1',
        chat_title: 'Architecture Discussion',
        project_id: 'proj-1',
        type: 'decision',
        title: 'Microservices Architecture',
        summary: 'Use event-driven microservices with PostgreSQL for persistence and Redis for caching. This architecture enables horizontal scaling, fault isolation, and independent deployment of services. The event-driven approach ensures loose coupling between services while maintaining data consistency through eventual consistency patterns.',
        tags: ['architecture', 'backend', 'database', 'microservices', 'postgresql'],
        confidence: 'high',
        version: 'v1.2',
        created_at: new Date('2026-01-02').toISOString(),
        updated_at: new Date('2026-01-05').toISOString(),
        isPinned: true,
      },
      {
        id: '2',
        chat_id: 'chat-1',
        chat_title: 'Architecture Discussion',
        project_id: 'proj-1',
        type: 'insight',
        title: 'Scaling Considerations',
        summary: 'Horizontal scaling will be critical for the message queue layer. Based on projected load of 10,000 concurrent users, we need to implement auto-scaling policies that trigger at 70% CPU utilization. Consider using Kubernetes HPA for container orchestration.',
        tags: ['scaling', 'infrastructure', 'kubernetes'],
        confidence: 'medium',
        version: 'v1.0',
        created_at: new Date('2026-01-03').toISOString(),
        updated_at: new Date('2026-01-03').toISOString(),
      },
      {
        id: '3',
        chat_id: 'chat-1',
        chat_title: 'Architecture Discussion',
        project_id: 'proj-1',
        type: 'reference',
        title: 'API Integration Patterns',
        summary: 'Standard patterns for REST API integration with error handling and retry logic. Implement exponential backoff with jitter for failed requests. Use circuit breaker pattern to prevent cascade failures. Document all endpoints using OpenAPI 3.0 specification.',
        tags: ['api', 'patterns', 'documentation', 'rest'],
        confidence: 'high',
        version: 'v2.0',
        created_at: new Date('2026-01-04').toISOString(),
        updated_at: new Date('2026-01-06').toISOString(),
      },
    ],
  },
  {
    id: 'chat-2',
    title: 'Feature Prioritization',
    phase: 'Discovery',
    owner: 'Sam',
    project_id: 'proj-1',
    cards: [
      {
        id: '4',
        chat_id: 'chat-2',
        chat_title: 'Feature Prioritization',
        project_id: 'proj-1',
        type: 'insight',
        title: 'Q1 Feature Priorities',
        summary: 'Priority order: 1) API improvements, 2) Dashboard v2, 3) Mobile app based on user impact analysis. User research indicated that API performance is the #1 blocker for enterprise customers. Dashboard improvements will reduce support tickets by an estimated 40%.',
        tags: ['roadmap', 'planning', 'product', 'strategy'],
        confidence: 'high',
        version: 'v1.1',
        created_at: new Date('2026-01-02').toISOString(),
        updated_at: new Date('2026-01-04').toISOString(),
        isPinned: true,
      },
      {
        id: '5',
        chat_id: 'chat-2',
        chat_title: 'Feature Prioritization',
        project_id: 'proj-1',
        type: 'action',
        title: 'User Research Sessions',
        summary: 'Schedule 5 user research sessions to validate dashboard redesign assumptions. Target enterprise customers with 100+ active users. Focus areas: navigation patterns, data visualization preferences, and mobile responsiveness requirements.',
        tags: ['research', 'users', 'ux'],
        confidence: 'medium',
        version: 'v1.0',
        created_at: new Date('2026-01-03').toISOString(),
        updated_at: new Date('2026-01-03').toISOString(),
      },
      {
        id: '6',
        chat_id: 'chat-2',
        chat_title: 'Feature Prioritization',
        project_id: 'proj-1',
        type: 'risk',
        title: 'Resource Constraints',
        summary: 'Team capacity may be insufficient for Q1 goals without additional hiring. Current velocity indicates 60% completion probability. Mitigation options: 1) Reduce scope, 2) Hire 2 senior engineers, 3) Delay mobile app to Q2.',
        tags: ['risk', 'team', 'resources', 'hiring'],
        confidence: 'medium',
        version: 'v1.0',
        created_at: new Date('2026-01-02').toISOString(),
        updated_at: new Date('2026-01-02').toISOString(),
      },
    ],
  },
  {
    id: 'chat-3',
    title: 'Team Standup Notes',
    phase: 'Execution',
    owner: 'Jordan',
    project_id: 'proj-1',
    cards: [
      {
        id: '7',
        chat_id: 'chat-3',
        chat_title: 'Team Standup Notes',
        project_id: 'proj-1',
        type: 'action',
        title: 'Dashboard Redesign Sync',
        summary: 'Team sync scheduled for Friday to align on the new dashboard design direction. Attendees: Design, Frontend, Product. Agenda: Review wireframes, discuss component library updates, and finalize timeline for beta release.',
        tags: ['meeting', 'design', 'team', 'dashboard'],
        confidence: 'high',
        version: 'v1.0',
        created_at: new Date('2026-01-05').toISOString(),
        updated_at: new Date('2026-01-05').toISOString(),
      },
    ],
  },
  {
    id: 'chat-4',
    title: 'Security Review',
    phase: 'Review',
    owner: 'Chris',
    project_id: 'proj-2',
    cards: [
      {
        id: '9',
        chat_id: 'chat-4',
        chat_title: 'Security Review',
        project_id: 'proj-2',
        type: 'decision',
        title: 'Authentication Strategy',
        summary: 'Implement OAuth 2.0 with JWT tokens for mobile app authentication. Use refresh token rotation with 15-minute access token expiry. Store tokens in secure keychain (iOS) / encrypted shared preferences (Android). Implement biometric authentication as optional second factor.',
        tags: ['security', 'auth', 'mobile', 'oauth'],
        confidence: 'high',
        version: 'v1.0',
        created_at: new Date('2026-01-01').toISOString(),
        updated_at: new Date('2026-01-03').toISOString(),
      },
      {
        id: '10',
        chat_id: 'chat-4',
        chat_title: 'Security Review',
        project_id: 'proj-2',
        type: 'risk',
        title: 'Token Storage Vulnerability',
        summary: 'Storing tokens in local storage poses XSS risk. Consider secure alternatives like HttpOnly cookies or native secure storage. Implement Content Security Policy headers and sanitize all user inputs to mitigate XSS attack vectors.',
        tags: ['security', 'vulnerability', 'xss'],
        confidence: 'high',
        version: 'v1.1',
        created_at: new Date('2026-01-02').toISOString(),
        updated_at: new Date('2026-01-04').toISOString(),
      },
    ],
  },
];

const typeConfig: Record<CardType, { icon: typeof CheckCircle; color: string; bg: string; border: string; glow: string; label: string }> = {
  decision: { icon: CheckCircle, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', glow: '192 91% 55%', label: 'Decision' },
  insight: { icon: Lightbulb, color: 'text-neon-violet', bg: 'bg-neon-violet/10', border: 'border-neon-violet/30', glow: '270 60% 60%', label: 'Insight' },
  action: { icon: FileText, color: 'text-neon-peach', bg: 'bg-neon-peach/10', border: 'border-neon-peach/30', glow: '25 95% 70%', label: 'Action' },
  reference: { icon: Code, color: 'text-neon-mint', bg: 'bg-neon-mint/10', border: 'border-neon-mint/30', glow: '160 60% 55%', label: 'Reference' },
  risk: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', glow: '0 72% 51%', label: 'Risk' },
  unknown: { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-muted/30', glow: '215 20% 55%', label: 'Unknown' },
};

const confidenceColors: Record<string, string> = {
  high: 'text-neon-mint',
  medium: 'text-neon-peach',
  low: 'text-destructive',
};

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
  const [projects, setProjects] = useState<ProjectWithGlow[]>(mockProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [currentChatIndex, setCurrentChatIndex] = useState(0);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [selectedCard, setSelectedCard] = useState<KnowledgeCardData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatCardPositions, setChatCardPositions] = useState<Record<string, number>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Filter chats by project
  const filteredChats = mockChatsWithCards.filter((chat) => {
    if (selectedProjectId && chat.project_id !== selectedProjectId) return false;
    return true;
  });

  const currentChat = filteredChats[currentChatIndex];
  const sortedCards = currentChat ? sortCardsWithPinned(currentChat.cards) : [];
  const currentCard = sortedCards[currentCardIndex];

  // Handle project selection
  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setCurrentChatIndex(0);
    setCurrentCardIndex(0);
    setChatCardPositions({});
  };

  // Handle glow color update
  const handleUpdateGlowColor = (projectId: string, color: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, glowColor: color } : p
    ));
  };

  // Back to project selection
  const handleBackToProjects = () => {
    setSelectedProjectId(null);
  };

  // Preserve scroll position per chat
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

  // Save card position when it changes
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
    } else if (direction === 'next' && currentChatIndex < filteredChats.length - 1) {
      setCurrentChatIndex(currentChatIndex + 1);
    }
  }, [currentChatIndex, filteredChats.length]);

  const navigateCard = useCallback((direction: 'prev' | 'next') => {
    if (!currentChat) return;
    if (direction === 'prev' && currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
    } else if (direction === 'next' && currentCardIndex < sortedCards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
    }
  }, [currentChat, currentCardIndex, sortedCards.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!selectedProjectId) return;
    
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
  }, [navigateChat, navigateCard, currentCard, drawerOpen, selectedProjectId]);

  const handleCardClick = () => {
    if (currentCard) {
      setSelectedCard(currentCard);
      setDrawerOpen(true);
    }
  };

  // Toggle pin status
  const togglePin = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // In a real app, this would update the backend
    // For now, just show a toast or visual feedback
  };

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

  // Empty state
  if (!currentChat || !currentCard) {
    return (
      <MainLayout>
        <div className="flex flex-col h-full">
          {/* Header with back button */}
          <div className="mb-6">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBackToProjects}
              className="mb-4 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              All Projects
            </Button>
            <div className="flex items-center gap-3 mb-2">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, hsl(${selectedProject?.glowColor} / 0.3), hsl(${selectedProject?.glowColor} / 0.1))`
                }}
              >
                <Layers className="w-5 h-5" style={{ color: `hsl(${selectedProject?.glowColor})` }} />
              </div>
              <h1 className="text-3xl font-bold gradient-text">{selectedProject?.name}</h1>
            </div>
          </div>

          {/* Empty State */}
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center glass-panel p-8 max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Layers className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No knowledge cards yet
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Cards are created once insights are extracted from your conversations.
              </p>
              <Button variant="neon">
                <Plus className="w-4 h-4" />
                Extract Cards
              </Button>
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
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleBackToProjects}
            className="mb-3 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            All Projects
          </Button>
          <div className="flex items-center gap-3 mb-2 relative">
            {/* Project glow accent */}
            <div 
              className="absolute -inset-4 rounded-2xl opacity-20 blur-xl pointer-events-none"
              style={{
                background: `radial-gradient(circle at 0% 50%, hsl(${selectedProject?.glowColor} / 0.4), transparent 50%)`
              }}
            />
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center relative"
              style={{
                background: `linear-gradient(135deg, hsl(${selectedProject?.glowColor} / 0.3), hsl(${selectedProject?.glowColor} / 0.1))`
              }}
            >
              <Layers className="w-5 h-5" style={{ color: `hsl(${selectedProject?.glowColor})` }} />
            </div>
            <h1 className="text-3xl font-bold gradient-text relative">{selectedProject?.name}</h1>
          </div>
        </div>

        {/* Extract Button */}
        <div className="flex items-center justify-end gap-4 mb-4">
          <Button variant="neon" size="sm">
            <Plus className="w-4 h-4" />
            Extract Cards
          </Button>
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
          
          {/* Left Arrow - Previous Chat */}
          <button
            onClick={() => navigateChat('prev')}
            disabled={currentChatIndex === 0}
            className={cn(
              "absolute left-0 z-20 p-3 rounded-xl glass-panel transition-all",
              currentChatIndex === 0 
                ? "opacity-30 cursor-not-allowed" 
                : "hover:border-primary/50 hover:scale-105"
            )}
            aria-label="Previous chat"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Right Arrow - Next Chat */}
          <button
            onClick={() => navigateChat('next')}
            disabled={currentChatIndex >= filteredChats.length - 1}
            className={cn(
              "absolute right-0 z-20 p-3 rounded-xl glass-panel transition-all",
              currentChatIndex >= filteredChats.length - 1
                ? "opacity-30 cursor-not-allowed" 
                : "hover:border-primary/50 hover:scale-105"
            )}
            aria-label="Next chat"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Card Container */}
          <div className="flex flex-col items-center gap-4 w-full max-w-2xl mx-12">
            
            {/* Up Arrow - Previous Card */}
            <button
              onClick={() => navigateCard('prev')}
              disabled={currentCardIndex === 0}
              className={cn(
                "p-2 rounded-xl glass-panel transition-all",
                currentCardIndex === 0 
                  ? "opacity-30 cursor-not-allowed" 
                  : "hover:border-primary/50 hover:scale-105"
              )}
              aria-label="Previous card"
            >
              <ChevronUp className="w-5 h-5" />
            </button>

            {/* Context Stack Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span 
                className="px-2 py-1 rounded-full glass-panel"
                style={{ borderColor: `hsl(${selectedProject?.glowColor} / 0.3)` }}
              >
                {selectedProject?.name}
              </span>
              <span className="opacity-50">→</span>
              <span className="px-2 py-1 rounded-full glass-panel">
                {currentChat.title}
              </span>
              <span className="opacity-50">→</span>
              <span className={cn("px-2 py-1 rounded-full", config.bg, config.border, "border")}>
                {config.label}
              </span>
              <span className="opacity-50">→</span>
              <span className="px-2 py-1 rounded-full bg-muted/30 font-mono">
                {currentCard.version}
              </span>
            </div>

            {/* Chat Title Header with Timeline */}
            <div className="glass-panel px-4 py-3 w-full">
              <div className="flex items-center gap-3 mb-1">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">{currentChat.title}</span>
                <span className="text-xs text-muted-foreground">— {currentChat.phase}</span>
                <span className="text-xs text-muted-foreground">— {currentChat.owner}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Chat {currentChatIndex + 1} of {filteredChats.length}
                </span>
              </div>
              {/* Knowledge Timeline Hint */}
              <p className="text-xs text-muted-foreground/70 ml-7">
                {getTimelineText(sortedCards)}
              </p>
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
                {/* Card Glow Halo */}
                <div 
                  className="absolute -inset-3 rounded-2xl opacity-30 blur-xl pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, hsl(${config.glow} / 0.4), transparent 70%)`
                  }}
                />

                <div 
                  onClick={handleCardClick}
                  className="glass-panel-hover p-8 w-full cursor-pointer group relative"
                  style={{
                    boxShadow: `0 0 40px hsl(${config.glow} / 0.1)`
                  }}
                >
                  {/* Pin Button */}
                  <button
                    onClick={(e) => togglePin(currentCard.id, e)}
                    className={cn(
                      "absolute top-4 left-4 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                      currentCard.isPinned 
                        ? "bg-neon-peach/20 text-neon-peach" 
                        : "bg-muted/50 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted"
                    )}
                    title={currentCard.isPinned ? "Pinned card" : "Pin this card"}
                  >
                    <Star className={cn("w-4 h-4", currentCard.isPinned && "fill-current")} />
                  </button>

                  {/* Edit Button */}
                  <button
                    className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                    onClick={(e) => { e.stopPropagation(); }}
                  >
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {/* Type Badge + Source */}
                  <div className="flex items-center gap-3 mb-4 pl-10">
                    <span className={cn(
                      "inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border font-medium",
                      config.bg,
                      config.border,
                      config.color
                    )}>
                      <Icon className="w-4 h-4" />
                      {config.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      from {currentCard.chat_title}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="text-2xl font-bold text-foreground mb-4">
                    {currentCard.title}
                  </h2>

                  {/* Summary */}
                  <p className="text-muted-foreground leading-relaxed mb-6 text-base">
                    {currentCard.summary}
                  </p>

                  {/* Tags */}
                  <div className="flex gap-2 flex-wrap mb-6">
                    {currentCard.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-sm px-3 py-1 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-glass">
                    <span className={cn("font-medium", confidenceColors[currentCard.confidence])}>
                      Confidence: {currentCard.confidence.charAt(0).toUpperCase() + currentCard.confidence.slice(1)}
                    </span>
                    <span className="text-muted-foreground font-mono text-sm">
                      {currentCard.version}
                    </span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Card Position Indicator */}
            <div className="flex items-center gap-2">
              {sortedCards.map((card, idx) => (
                <button
                  key={card.id}
                  onClick={() => setCurrentCardIndex(idx)}
                  className={cn(
                    "h-2 rounded-full transition-all relative",
                    idx === currentCardIndex 
                      ? "w-6" 
                      : "w-2 hover:bg-muted-foreground",
                    card.isPinned && idx !== currentCardIndex && "bg-neon-peach/50"
                  )}
                  style={{
                    backgroundColor: idx === currentCardIndex 
                      ? `hsl(${typeConfig[card.type].glow})` 
                      : card.isPinned ? undefined : 'hsl(var(--muted))'
                  }}
                  title={card.isPinned ? "⭐ Pinned" : undefined}
                />
              ))}
            </div>

            {/* Down Arrow - Next Card */}
            <button
              onClick={() => navigateCard('next')}
              disabled={currentCardIndex >= sortedCards.length - 1}
              className={cn(
                "p-2 rounded-xl glass-panel transition-all",
                currentCardIndex >= sortedCards.length - 1
                  ? "opacity-30 cursor-not-allowed" 
                  : "hover:border-primary/50 hover:scale-105"
              )}
              aria-label="Next card"
            >
              <ChevronDown className="w-5 h-5" />
            </button>

            {/* Card Counter */}
            <p className="text-xs text-muted-foreground">
              Card {currentCardIndex + 1} of {sortedCards.length}
            </p>
          </div>
        </div>

        {/* Card Detail Drawer */}
        <CardDetailDrawer
          card={selectedCard}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      </div>
    </MainLayout>
  );
}
