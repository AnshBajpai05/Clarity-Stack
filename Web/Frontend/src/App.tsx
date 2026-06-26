import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectSearch from "./pages/ProjectSearch";
import ChatsPage from "./pages/ChatsPage";
import CardsPage from "./pages/CardsPage";
import SettingsPage from "./pages/SettingsPage";
import MessagesPage from "./pages/MessagesPage";
import NotFound from "./pages/NotFound";

import KnowledgeGraphPage from "./pages/KnowledgeGraphPage";
import DeltaTimelinePage from "./pages/DeltaTimelinePage";
import TemporalCardsPage from "./pages/TemporalCardsPage";
import DiscoveryPage from "./pages/DiscoveryPage";

// SRS-Clarity Pages
import SRSDashboard from "./pages/srs/Dashboard";
import { WorkspacePage as SRSWorkspace } from "./pages/srs/WorkspacePage";

// Collaborative Editor Pages
import EditorDashboard from "./pages/editor/Dashboard";
import EditorWorkspace from "./pages/editor/Workspace";
import EditorSnapshot from "./pages/editor/Snapshot";

// UML-Clarity Pages
import UMLDashboard from "./pages/uml/Dashboard";

import { WalkthroughEngine } from "@/components/walkthrough/WalkthroughEngine";
import { useEffect } from "react";
import { applyAccentColor } from "@/lib/utils";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Apply dark mode
    const darkMode = localStorage.getItem('cs_dark_mode') !== 'false'; // default true
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Apply accent color
    const accentColor = localStorage.getItem('cs_accent_color') || 'neon-cyan';
    applyAccentColor(accentColor);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <WalkthroughEngine />
          <Routes>
            <Route path="/" element={<Index />} />
          <Route path="/login"  element={<Login />} />
          <Route path="/register" element={<Register />} />
  
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/search" element={<ProjectSearch />} />
          <Route path="/project-search" element={<ProjectSearch />} />
          
          {/* Discovery Feed */}
          <Route path="/discovery" element={<DiscoveryPage />} />
  
          <Route
            path="/projects/:projectId/chats"
            element={<ChatsPage />}
          />
  
          <Route
            path="/projects/:projectId/chats/:chatId"
            element={<MessagesPage />}
          />
  
          {/* Satellite Features per project */}
          <Route path="/projects/:projectId/kg" element={<KnowledgeGraphPage />} />
          <Route path="/projects/:projectId/delta" element={<DeltaTimelinePage />} />
          <Route path="/projects/:projectId/cards" element={<TemporalCardsPage />} />
  
          {/* SRS-Clarity Feature */}
          <Route path="/srs/dashboard" element={<SRSDashboard />} />
          <Route path="/srs/issues" element={<SRSWorkspace />} />
  
          {/* Collaborative Editor Feature */}
          <Route path="/editor/dashboard" element={<EditorDashboard />} />
          <Route path="/editor/workspace/:id" element={<EditorWorkspace />} />
          <Route path="/editor/snapshot/:id" element={<EditorSnapshot />} />

          {/* UML-Clarity Feature */}
          <Route path="/uml/dashboard" element={<UMLDashboard />} />
  
          {/* Legacy global cards */}
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
  
          <Route path="*" element={<NotFound />} />
        </Routes>
  
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
