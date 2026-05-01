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

        <Route
          path="/projects/:projectId/chats"
          element={<ChatsPage />}
        />

        <Route
          path="/projects/:projectId/chats/:chatId"
          element={<MessagesPage />}
        />

        <Route path="/cards" element={<CardsPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
