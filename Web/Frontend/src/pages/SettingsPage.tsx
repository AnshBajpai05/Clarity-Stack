import { useState, useEffect } from 'react';
import { Settings, Server, Palette, Bell, Shield, Database, Save, Check, Plus } from 'lucide-react';
import { applyAccentColor } from '@/lib/utils';
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
  { id: 'profile', title: 'Profile', description: 'Manage your identity and nickname', icon: Shield, color: 'text-neon-mint' },
  { id: 'api', title: 'API Configuration', description: 'Backend connection settings', icon: Server, color: 'text-neon-cyan' },
  { id: 'appearance', title: 'Appearance', description: 'Customize the look and feel', icon: Palette, color: 'text-neon-violet' },
  { id: 'notifications', title: 'Notifications', description: 'Alert and notification preferences', icon: Bell, color: 'text-neon-peach' },
  { id: 'privacy', title: 'Privacy & Security', description: 'Data handling and security', icon: Shield, color: 'text-neon-mint' },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile');
  const [fullName, setFullName] = useState('');
  const [placeholderName, setPlaceholderName] = useState('User');
  const [apiUrl, setApiUrl] = useState('http://127.0.0.1:8000');
  const [autoSync, setAutoSync] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [compactView, setCompactView] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [accentColor, setAccentColor] = useState('neon-cyan');
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Load persisted settings
    const savedApiUrl = localStorage.getItem('cs_api_url');
    if (savedApiUrl) setApiUrl(savedApiUrl);
    
    const savedAutoSync = localStorage.getItem('cs_auto_sync');
    if (savedAutoSync !== null) setAutoSync(savedAutoSync === 'true');
    
    const savedDarkMode = localStorage.getItem('cs_dark_mode');
    if (savedDarkMode !== null) setDarkMode(savedDarkMode === 'true');
    
    const savedCompactView = localStorage.getItem('cs_compact_view');
    if (savedCompactView !== null) setCompactView(savedCompactView === 'true');

    const savedAccentColor = localStorage.getItem('cs_accent_color');
    if (savedAccentColor) setAccentColor(savedAccentColor);

    const savedNickname = localStorage.getItem('cs_nickname');
    if (savedNickname) setFullName(savedNickname);

    async function loadUser() {
      try {
        const { supabase } = await import('@/pages/editor/supabaseClient');
        if (!supabase) {
          console.warn('Supabase client not initialized (Local/Demo mode)');
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        
        // If we have a local nickname, prefer it, otherwise use cloud metadata
        if (!savedNickname) {
          if (user?.user_metadata?.full_name) {
            setFullName(user.user_metadata.full_name);
          } else if (user?.user_metadata?.name) {
            setFullName(user.user_metadata.name);
          }
        }
        
        const emailPrefix = user?.email?.split('@')[0] || '';
        if (emailPrefix) {
          setPlaceholderName(emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1));
        }
      } catch (err) {
        console.error('Failed to load user metadata:', err);
      }
    }
    loadUser();
  }, []);

  // Apply accent color preview instantly
  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  const handleSave = async () => {
    try {
      if (activeSection === 'profile') {
        // Always save to local storage for quick access
        localStorage.setItem('cs_nickname', fullName);

        const { supabase } = await import('@/pages/editor/supabaseClient');
        if (supabase) {
          const { error } = await supabase.auth.updateUser({
            data: { full_name: fullName }
          });
          if (error) throw error;
        }
        // If no supabase, we just continue (local save already happened)
      }

      if (activeSection === 'api') {
        localStorage.setItem('cs_api_url', apiUrl);
        localStorage.setItem('cs_auto_sync', String(autoSync));
      }

      if (activeSection === 'appearance') {
        localStorage.setItem('cs_dark_mode', String(darkMode));
        localStorage.setItem('cs_compact_view', String(compactView));
        localStorage.setItem('cs_accent_color', accentColor);
        // Apply dark mode to document
        if (darkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        // Apply accent color using utility
        applyAccentColor(accentColor);
      }

      setSaved(true);
      toast({
        title: 'Settings saved',
        description: `Your ${activeSection} preferences have been updated.`,
      });
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast({
        title: 'Update failed',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="nickname">Display Name / Nickname</Label>
              <Input
                id="nickname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={`e.g. ${placeholderName}`}
                className="bg-muted/50 border-glass focus:border-primary"
              />
              <p className="text-xs text-muted-foreground">
                This name will be used in greetings and shared workspaces.
              </p>
            </div>

            <div className="p-4 glass-panel rounded-xl border-neon-mint/20">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-neon-mint mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Identity Verification</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your nickname is stored in your secure account metadata.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

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
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  localStorage.getItem('token') ? "bg-neon-mint" : "bg-neon-peach"
                )} />
                <span className={cn(
                  "text-sm",
                  localStorage.getItem('token') ? "text-neon-mint" : "text-neon-peach"
                )}>
                  {localStorage.getItem('token') ? "Connected" : "Local / Demo Mode"}
                </span>
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
              <div className="flex flex-wrap gap-3">
                {['neon-cyan', 'neon-violet', 'neon-peach', 'neon-mint'].map((color) => (
                  <button
                    key={color}
                    onClick={() => setAccentColor(color)}
                    className={cn(
                      "w-10 h-10 rounded-xl border-2 transition-all",
                      color === 'neon-cyan' && "bg-neon-cyan",
                      color === 'neon-violet' && "bg-neon-violet",
                      color === 'neon-peach' && "bg-neon-peach",
                      color === 'neon-mint' && "bg-neon-mint",
                      accentColor === color 
                        ? `border-white ring-2 ring-white/20 scale-110` 
                        : "border-transparent hover:border-white/30"
                    )}
                  />
                ))}

                {/* Custom Color Circle (if one is selected) */}
                {accentColor.startsWith('#') && (
                  <button
                    onClick={() => document.getElementById('custom-color-picker')?.click()}
                    className="w-10 h-10 rounded-xl border-2 border-white ring-2 ring-white/20 scale-110 transition-all"
                    style={{ backgroundColor: accentColor }}
                  />
                )}

                {/* The "Plus" Button */}
                <button
                  onClick={() => document.getElementById('custom-color-picker')?.click()}
                  className="w-10 h-10 rounded-xl border-2 border-dashed border-muted-foreground/50 hover:border-white/50 hover:bg-muted/30 transition-all flex items-center justify-center group"
                  title="Choose custom color"
                >
                  <Plus className="w-5 h-5 text-muted-foreground group-hover:text-white transition-colors" />
                </button>

                <input
                  id="custom-color-picker"
                  type="color"
                  className="sr-only"
                  value={accentColor.startsWith('#') ? accentColor : '#00f2ff'}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Presets + Custom Palette</p>
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

            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                const data = {
                  settings: {
                    apiUrl, autoSync, darkMode, compactView, notifications, soundEnabled, analyticsEnabled
                  },
                  exportedAt: new Date().toISOString()
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `claritystack-settings-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
              }}
            >
              Export Settings Data
            </Button>

            <Button 
              variant="outline" 
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => {
                if (window.confirm("Are you sure? This will clear all local settings and preferences.")) {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }
              }}
            >
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
      <div className="mb-8 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-peach to-neon-violet flex items-center justify-center shadow-glow-sm">
            <Settings className="w-5 h-5 text-background" />
          </div>
          <h1 className="text-3xl font-display font-bold gradient-text tracking-tight">Settings</h1>
        </div>
        <p className="text-muted-foreground leading-relaxed">
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
                    ? "glass-panel shadow-floating"
                    : "hover:bg-muted/30"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? section.color : "text-muted-foreground")} />
                <div>
                  <p className={cn("font-display font-medium tracking-tight", isActive ? "text-foreground" : "text-muted-foreground")}>
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
        <div className="lg:col-span-3 animate-fade-in-up stagger-1">
          <div className="glass-panel p-6">
            <div className="mb-6">
              <h2 className="text-xl font-display font-semibold text-foreground tracking-tight">
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
