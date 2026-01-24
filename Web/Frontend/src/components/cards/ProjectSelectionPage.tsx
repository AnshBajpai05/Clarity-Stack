import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layers, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

export interface ProjectWithGlow {
  id: string;
  name: string;
  context?: string;
  glowColor: string;
}

// 50+ predefined glow colors organized by category
const GLOW_COLORS = [
  // Neons
  { name: 'Cyan', hsl: '192 91% 55%' },
  { name: 'Violet', hsl: '270 60% 60%' },
  { name: 'Peach', hsl: '25 95% 70%' },
  { name: 'Mint', hsl: '160 60% 55%' },
  { name: 'Electric Blue', hsl: '210 100% 56%' },
  { name: 'Hot Pink', hsl: '330 100% 60%' },
  { name: 'Lime', hsl: '85 80% 50%' },
  { name: 'Orange', hsl: '30 100% 55%' },
  // Warm tones
  { name: 'Rose', hsl: '350 80% 60%' },
  { name: 'Amber', hsl: '38 92% 50%' },
  { name: 'Coral', hsl: '16 85% 65%' },
  { name: 'Salmon', hsl: '6 75% 70%' },
  { name: 'Gold', hsl: '45 100% 50%' },
  { name: 'Tangerine', hsl: '22 95% 55%' },
  { name: 'Crimson', hsl: '348 80% 50%' },
  { name: 'Ruby', hsl: '355 75% 45%' },
  // Cool tones
  { name: 'Sky', hsl: '200 90% 60%' },
  { name: 'Purple', hsl: '280 70% 55%' },
  { name: 'Teal', hsl: '175 70% 45%' },
  { name: 'Indigo', hsl: '240 65% 55%' },
  { name: 'Azure', hsl: '215 85% 55%' },
  { name: 'Lavender', hsl: '260 55% 65%' },
  { name: 'Periwinkle', hsl: '230 60% 70%' },
  { name: 'Cobalt', hsl: '220 80% 50%' },
  // Greens
  { name: 'Emerald', hsl: '155 70% 45%' },
  { name: 'Forest', hsl: '140 60% 35%' },
  { name: 'Spring', hsl: '130 65% 55%' },
  { name: 'Jade', hsl: '158 55% 50%' },
  { name: 'Sage', hsl: '135 35% 55%' },
  { name: 'Seafoam', hsl: '165 55% 60%' },
  { name: 'Pistachio', hsl: '95 45% 60%' },
  { name: 'Chartreuse', hsl: '80 70% 50%' },
  // Pastels
  { name: 'Baby Blue', hsl: '200 65% 75%' },
  { name: 'Blush', hsl: '350 60% 80%' },
  { name: 'Butter', hsl: '50 70% 75%' },
  { name: 'Lilac', hsl: '280 50% 75%' },
  { name: 'Peach Cream', hsl: '20 80% 80%' },
  { name: 'Mint Cream', hsl: '150 50% 80%' },
  { name: 'Lavender Mist', hsl: '240 45% 85%' },
  { name: 'Rose Quartz', hsl: '340 40% 75%' },
  // Bold & Cyber
  { name: 'Neon Green', hsl: '120 100% 50%' },
  { name: 'Magenta', hsl: '300 100% 55%' },
  { name: 'Electric Purple', hsl: '275 100% 60%' },
  { name: 'Cyber Yellow', hsl: '55 100% 55%' },
  { name: 'Plasma Blue', hsl: '195 100% 50%' },
  { name: 'Fuchsia', hsl: '315 90% 55%' },
  { name: 'Toxic Green', hsl: '100 90% 45%' },
  { name: 'Laser Red', hsl: '0 95% 55%' },
  // Neutrals with glow
  { name: 'Silver', hsl: '220 15% 65%' },
  { name: 'Platinum', hsl: '210 10% 75%' },
  { name: 'Champagne', hsl: '40 40% 70%' },
  { name: 'Moonlight', hsl: '220 25% 80%' },
];

// Floating animation configuration
const FLOAT_CONFIG = {
  amplitude: { x: 15, y: 12 }, // ~1.5cm at typical screen density
  duration: { min: 4, max: 6 }, // seconds for one complete cycle
};

interface ProjectSelectionPageProps {
  projects: ProjectWithGlow[];
  onSelectProject: (projectId: string) => void;
  onUpdateGlowColor?: (projectId: string, color: string) => void;
}

export function ProjectSelectionPage({ 
  projects, 
  onSelectProject,
  onUpdateGlowColor 
}: ProjectSelectionPageProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState('#00d4ff');

  // Generate unique float animation values for each project
  const floatAnimations = useMemo(() => {
    return projects.reduce((acc, project, index) => {
      acc[project.id] = {
        duration: FLOAT_CONFIG.duration.min + (Math.random() * (FLOAT_CONFIG.duration.max - FLOAT_CONFIG.duration.min)),
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        amplitudeX: FLOAT_CONFIG.amplitude.x * (0.8 + Math.random() * 0.4),
        amplitudeY: FLOAT_CONFIG.amplitude.y * (0.8 + Math.random() * 0.4),
      };
      return acc;
    }, {} as Record<string, { duration: number; phaseX: number; phaseY: number; amplitudeX: number; amplitudeY: number }>);
  }, [projects]);

  const hexToHsl = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-violet to-neon-mint flex items-center justify-center">
            <Layers className="w-5 h-5 text-background" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">Knowledge Cards</h1>
        </div>
        <p className="text-muted-foreground">
          Select a project to explore your synthesized knowledge.
        </p>
      </div>

      {/* Floating Project Blocks Grid */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 auto-rows-min">
        {projects.map((project, index) => {
          const floatAnim = floatAnimations[project.id];
          
          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                x: [
                  0,
                  floatAnim.amplitudeX,
                  0,
                  -floatAnim.amplitudeX,
                  0
                ],
              }}
              transition={{ 
                opacity: { duration: 0.5, delay: index * 0.1 },
                y: { duration: 0.5, delay: index * 0.1, ease: [0.23, 1, 0.32, 1] },
                x: {
                  duration: floatAnim.duration,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: floatAnim.phaseX,
                },
              }}
              onHoverStart={() => setHoveredId(project.id)}
              onHoverEnd={() => setHoveredId(null)}
              className="relative group"
            >
              {/* Continuous Y-axis floating - separate motion div */}
              <motion.div
                animate={{
                  y: [
                    0,
                    -floatAnim.amplitudeY,
                    0,
                    floatAnim.amplitudeY,
                    0
                  ],
                }}
                transition={{
                  duration: floatAnim.duration * 0.9,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: floatAnim.phaseY,
                }}
              >
                {/* Glow Effect Background */}
                <motion.div
                  className="absolute -inset-4 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, hsl(${project.glowColor} / 0.4), transparent 70%)`
                  }}
                  animate={{
                    scale: hoveredId === project.id ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.4 }}
                />

                {/* Subtle Ambient Glow (always visible) */}
                <div 
                  className="absolute -inset-2 rounded-2xl opacity-30 blur-lg"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, hsl(${project.glowColor} / 0.25), transparent 70%)`
                  }}
                />

                {/* Main Card */}
                <motion.div
                  onClick={() => onSelectProject(project.id)}
                  className={cn(
                    "relative glass-panel p-6 cursor-pointer overflow-hidden",
                    "border transition-colors duration-300"
                  )}
                  style={{
                    borderColor: hoveredId === project.id 
                      ? `hsl(${project.glowColor} / 0.5)` 
                      : undefined
                  }}
                  whileHover={{ 
                    scale: 1.02,
                    y: -4,
                  }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 400, 
                    damping: 25 
                  }}
                >
                  {/* Inner Glow Accent */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-1 rounded-t-xl opacity-60"
                    style={{
                      background: `linear-gradient(90deg, transparent, hsl(${project.glowColor}), transparent)`
                    }}
                  />

                  {/* Color Picker Button */}
                  {onUpdateGlowColor && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-muted z-10"
                        >
                          <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-72 p-3" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-xs text-muted-foreground mb-2 font-medium">Glow Color</p>
                        
                        {/* Color grid - 50+ colors */}
                        <div className="grid grid-cols-8 gap-1.5 mb-3 max-h-40 overflow-y-auto pr-1">
                          {GLOW_COLORS.map((color) => (
                            <button
                              key={color.hsl}
                              onClick={() => onUpdateGlowColor(project.id, color.hsl)}
                              className={cn(
                                "w-6 h-6 rounded-full transition-transform hover:scale-110 border border-white/10",
                                project.glowColor === color.hsl && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                              )}
                              style={{ backgroundColor: `hsl(${color.hsl})` }}
                              title={color.name}
                            />
                          ))}
                        </div>

                        {/* Custom color picker */}
                        <div className="border-t border-border pt-3">
                          <p className="text-xs text-muted-foreground mb-2 font-medium">Custom Color</p>
                          <div className="flex gap-2 items-center">
                            <Input
                              type="color"
                              value={customColor}
                              onChange={(e) => setCustomColor(e.target.value)}
                              className="w-10 h-8 p-0.5 cursor-pointer rounded border-0"
                            />
                            <Input
                              type="text"
                              value={customColor}
                              onChange={(e) => setCustomColor(e.target.value)}
                              className="flex-1 h-8 text-xs font-mono"
                              placeholder="#00d4ff"
                            />
                            <button
                              onClick={() => onUpdateGlowColor(project.id, hexToHsl(customColor))}
                              className="px-3 h-8 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}

                  {/* Project Icon */}
                  <div 
                    className="w-12 h-12 rounded-xl mb-4 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, hsl(${project.glowColor} / 0.3), hsl(${project.glowColor} / 0.1))`
                    }}
                  >
                    <Layers 
                      className="w-6 h-6" 
                      style={{ color: `hsl(${project.glowColor})` }}
                    />
                  </div>

                  {/* Project Name */}
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {project.name}
                  </h3>

                  {/* Project Context */}
                  {project.context && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.context}
                    </p>
                  )}

                  {/* Floating particles effect on hover */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: hoveredId === project.id ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {[...Array(3)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-1 h-1 rounded-full"
                        style={{
                          background: `hsl(${project.glowColor})`,
                          left: `${20 + i * 30}%`,
                          bottom: '20%',
                        }}
                        animate={{
                          y: [-5, -15, -5],
                          opacity: [0.3, 0.7, 0.3],
                        }}
                        transition={{
                          duration: 2,
                          delay: i * 0.3,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center glass-panel p-8 max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No projects yet
            </h3>
            <p className="text-sm text-muted-foreground">
              Create a project to start organizing your knowledge cards.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
