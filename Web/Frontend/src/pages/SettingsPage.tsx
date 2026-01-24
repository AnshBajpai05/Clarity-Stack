import { useState } from 'react';
import { Settings, Server, Palette, Bell, Shield, Database, Save, Check } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SettingSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const sections: SettingSection[] = [
  { id: 'api', title: 'API Configuration', description: 'Backend connection settings', icon: Server, color: 'text-neon-cyan' },
  { id: 'appearance', title: 'Appearance', description: 'Customize the look and feel', icon: Palette, color: 'text-neon-violet' },
  { id: 'notifications', title: 'Notifications', description: 'Alert and notification preferences', icon: Bell, color: 'text-neon-peach' },
  { id: 'privacy', title: 'Privacy & Security', description: 'Data handling and security', icon: Shield, color: 'text-neon-mint' },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('api');
  const [apiUrl, setApiUrl] = useState('http://127.0.0.1:8000');
  const [autoSync, setAutoSync] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [compactView, setCompactView] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  const handleSave = () => {
    setSaved(true);
    toast({
      title: 'Settings saved',
      description: 'Your preferences have been updated.',
    });
    setTimeout(() => setSaved(false), 2000);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'api':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="api-url">Backend API URL</Label>
              <Input
                id="api-url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000"
                className="bg-muted/50 border-glass focus:border-primary"
              />
              <p className="text-xs text-muted-foreground">
                The base URL for your ClarityStack backend API.
              </p>
            </div>

            <div className="flex items-center justify-between p-4 glass-panel rounded-xl">
              <div>
                <p className="font-medium text-foreground">Auto-sync</p>
                <p className="text-sm text-muted-foreground">
                  Automatically refresh data from the backend
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            <div className="flex items-center justify-between p-4 glass-panel rounded-xl">
              <div>
                <p className="font-medium text-foreground">Connection Status</p>
                <p className="text-sm text-muted-foreground">
                  Backend server connection
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-neon-peach animate-pulse" />
                <span className="text-sm text-neon-peach">Demo Mode</span>
              </div>
            </div>

            <div className="p-4 glass-panel rounded-xl border-neon-cyan/20">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-neon-cyan mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Database</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Using in-memory demo storage. Connect your backend for persistent data.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 glass-panel rounded-xl">
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">
                  Use dark theme throughout the app
                </p>
              </div>
              <Switch checked={darkMode} onCheckedChange={setDarkMode} />
            </div>

            <div className="flex items-center justify-between p-4 glass-panel rounded-xl">
              <div>
                <p className="font-medium text-foreground">Compact View</p>
                <p className="text-sm text-muted-foreground">
                  Reduce spacing for more content density
                </p>
              </div>
              <Switch checked={compactView} onCheckedChange={setCompactView} />
            </div>

            <div className="space-y-2">
              <Label>Accent Color</Label>
              <div className="flex gap-3">
                {['neon-cyan', 'neon-violet', 'neon-peach', 'neon-mint'].map((color) => (
                  <button
                    key={color}
                    className={cn(
                      "w-10 h-10 rounded-xl border-2 transition-all",
                      color === 'neon-cyan' && "bg-neon-cyan border-neon-cyan ring-2 ring-neon-cyan/50",
                      color === 'neon-violet' && "bg-neon-violet border-transparent hover:border-neon-violet",
                      color === 'neon-peach' && "bg-neon-peach border-transparent hover:border-neon-peach",
                      color === 'neon-mint' && "bg-neon-mint border-transparent hover:border-neon-mint",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 glass-panel rounded-xl">
              <div>
                <p className="font-medium text-foreground">Enable Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Show in-app notifications for updates
                </p>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>

            <div className="flex items-center justify-between p-4 glass-panel rounded-xl">
              <div>
                <p className="font-medium text-foreground">Sound Effects</p>
                <p className="text-sm text-muted-foreground">
                  Play sounds for notifications
                </p>
              </div>
              <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
            </div>

            <div className="p-4 glass-panel rounded-xl opacity-60">
              <p className="font-medium text-foreground mb-2">Email Notifications</p>
              <p className="text-sm text-muted-foreground">
                Email notifications require backend integration. Coming soon.
              </p>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 glass-panel rounded-xl">
              <div>
                <p className="font-medium text-foreground">Usage Analytics</p>
                <p className="text-sm text-muted-foreground">
                  Help improve ClarityStack with anonymous usage data
                </p>
              </div>
              <Switch checked={analyticsEnabled} onCheckedChange={setAnalyticsEnabled} />
            </div>

            <div className="p-4 glass-panel rounded-xl border-neon-mint/20">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-neon-mint mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Data Privacy</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    All chat data is stored locally or on your own backend. ClarityStack never sends your conversations to external servers.
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full">
              Export All Data
            </Button>

            <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10">
              Clear Local Data
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-peach to-neon-violet flex items-center justify-center">
            <Settings className="w-5 h-5 text-background" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">Settings</h1>
        </div>
        <p className="text-muted-foreground">
          Configure your ClarityStack preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all",
                  isActive
                    ? "glass-panel border-primary/30 shadow-lg shadow-primary/10"
                    : "hover:bg-muted/50"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? section.color : "text-muted-foreground")} />
                <div>
                  <p className={cn("font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
                    {section.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {section.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <div className="glass-panel p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {sections.find((s) => s.id === activeSection)?.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {sections.find((s) => s.id === activeSection)?.description}
              </p>
            </div>

            {renderContent()}

            <div className="mt-8 pt-6 border-t border-glass flex justify-end">
              <Button variant="neon" onClick={handleSave}>
                {saved ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
