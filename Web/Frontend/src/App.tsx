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
import SRSIssuesPage from "./pages/srs/IssuesPage";
import { WorkspacePage as SRSWorkspace } from "./pages/srs/WorkspacePage";

// Collaborative Editor Pages
import EditorDashboard from "./pages/editor/Dashboard";
import EditorWorkspace from "./pages/editor/Workspace";
import EditorSnapshot from "./pages/editor/Snapshot";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/login"  element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/search" element={<ProjectSearch />} />
        
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
        <Route path="/srs/issues" element={<SRSIssuesPage />} />
        <Route path="/srs/workspace" element={<SRSWorkspace />} />

        {/* Collaborative Editor Feature */}
        <Route path="/editor/dashboard" element={<EditorDashboard />} />
        <Route path="/editor/workspace/:id" element={<EditorWorkspace />} />
        <Route path="/editor/snapshot/:id" element={<EditorSnapshot />} />

        {/* Legacy global cards */}
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
