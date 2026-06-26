import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Sparkles, ArrowRight, ArrowLeft, X } from "lucide-react";
import { walkthroughTours, WalkthroughStep } from "./walkthroughSteps";
import { Button } from "@/components/ui/button";

export function WalkthroughEngine() {
  const location = useLocation();
  const [activeTour, setActiveTour] = useState<WalkthroughStep[] | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(-1);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isTourActive, setIsTourActive] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // 1. Detect matching tour for the current route
  const findMatchingTour = useCallback((pathname: string): WalkthroughStep[] | null => {
    // Skip tours on login and register/signup
    if (pathname.includes("/login") || pathname.includes("/register")) {
      return null;
    }
    const match = walkthroughTours.find((tour) => tour.pattern.test(pathname));
    return match ? match.steps : null;
  }, []);

  // 2. Restart or load tour when location changes
  useEffect(() => {
    const tour = findMatchingTour(location.pathname);
    setActiveTour(tour);
    
    if (tour) {
      const tourCompleted = localStorage.getItem(`cs_tour_${location.pathname}`);
      if (!tourCompleted) {
        // Auto-start for first-time visitors
        setCurrentStepIdx(0);
        setIsTourActive(true);
      } else {
        setIsTourActive(false);
        setCurrentStepIdx(-1);
      }
    } else {
      setIsTourActive(false);
      setCurrentStepIdx(-1);
    }
  }, [location.pathname, findMatchingTour]);

  const activeStep = activeTour && currentStepIdx >= 0 ? activeTour[currentStepIdx] : null;

  // 3. Highlight and track the bounding rect of the target element
  const updateTargetBounds = useCallback(() => {
    if (!activeStep) {
      setTargetRect(null);
      return;
    }

    if (activeStep.target === "body" || activeStep.placement === "center") {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(activeStep.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
      
      // Auto scroll target into view if offscreen
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      // Element not rendered yet or missing; fall back to center layout
      setTargetRect(null);
    }
  }, [activeStep]);

  // Update bounds on step change, resize, or scroll
  useEffect(() => {
    updateTargetBounds();

    // Poll for the target element if it hasn't loaded yet (handles lazy API/data loading)
    const interval = setInterval(() => {
      if (activeStep && activeStep.target !== "body" && activeStep.placement !== "center") {
        const element = document.querySelector(activeStep.target);
        if (element) {
          updateTargetBounds();
        }
      }
    }, 250);

    window.addEventListener("resize", updateTargetBounds);
    window.addEventListener("scroll", updateTargetBounds);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", updateTargetBounds);
      window.removeEventListener("scroll", updateTargetBounds);
    };
  }, [currentStepIdx, activeStep, updateTargetBounds]);

  // 4. Calculate dynamic card positioning and boundary clamp
  useEffect(() => {
    if (!activeStep) return;

    // Default centered coords
    if (activeStep.placement === "center" || !targetRect) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cardWidth = 580;
      const cardHeight = 360;
      setPopoverCoords({
        top: Math.round(h / 2 - cardHeight / 2),
        left: Math.round(w / 2 - cardWidth / 2),
      });
      return;
    }

    const cardWidth = popoverRef.current ? popoverRef.current.offsetWidth : 580;
    const cardHeight = popoverRef.current ? popoverRef.current.offsetHeight : 300;
    const gap = 24;

    let { top, left, width, height } = targetRect;
    let cardTop = 0;
    let cardLeft = 0;

    switch (activeStep.placement) {
      case "top":
        cardTop = top - cardHeight - gap;
        cardLeft = left + width / 2 - cardWidth / 2;
        break;
      case "bottom":
        cardTop = top + height + gap;
        cardLeft = left + width / 2 - cardWidth / 2;
        break;
      case "left":
        cardTop = top + height / 2 - cardHeight / 2;
        cardLeft = left - cardWidth - gap;
        break;
      case "right":
        cardTop = top + height / 2 - cardHeight / 2;
        cardLeft = left + width + gap;
        break;
      default:
        cardTop = top + height + gap;
        cardLeft = left + width / 2 - cardWidth / 2;
    }

    // Viewport boundary clamping to prevent cards overflow
    cardTop = Math.max(16, Math.min(cardTop, window.innerHeight - cardHeight - 16));
    cardLeft = Math.max(16, Math.min(cardLeft, window.innerWidth - cardWidth - 16));

    setPopoverCoords({
      top: Math.round(cardTop),
      left: Math.round(cardLeft),
    });
  }, [targetRect, activeStep]);

  // 5. Handle Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTourActive) return;
      if (e.key === "ArrowRight" || e.key === "Enter") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handleBack();
      } else if (e.key === "Escape") {
        handleSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTourActive, currentStepIdx, activeTour]);

  // 6. Navigation Actions
  const handleNext = () => {
    if (!activeTour) return;
    if (currentStepIdx < activeTour.length - 1) {
      setCurrentStepIdx((prev) => prev + 1);
    } else {
      completeTour();
    }
  };

  const handleBack = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const completeTour = () => {
    localStorage.setItem(`cs_tour_${location.pathname}`, "true");
    setIsTourActive(false);
    setCurrentStepIdx(-1);
    setTargetRect(null);
  };

  const restartTour = () => {
    setCurrentStepIdx(0);
    setIsTourActive(true);
  };

  if (!activeTour) return null;

  return (
    <>
      {/* Floating Sparkles tour trigger bubble (Lower Right) */}
      {!isTourActive && (
        <button
          onClick={restartTour}
          className="fixed bottom-8 right-8 z-[9999] w-14 h-14 bg-gradient-to-br from-neon-cyan to-neon-violet rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] hover:scale-110 active:scale-95 transition-all duration-300 group"
          title="Explore Page Tutorial"
        >
          <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-20" />
          <Sparkles className="w-6 h-6 text-white group-hover:animate-spin-slow" />
          {/* Subtle label hover pill */}
          <span className="absolute right-16 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 bg-slate-900/95 backdrop-blur-md text-white text-sm font-bold px-4 py-2 rounded-xl border border-white/10 whitespace-nowrap transition-all duration-300 shadow-xl">
            Quick Guide
          </span>
        </button>
      )}

      {/* Walkthrough spotlight overlay portal */}
      {isTourActive && activeStep && (
        <div className="fixed inset-0 z-[99998] overflow-hidden pointer-events-none">
          {/* Spotlight panels — visual only, clicks pass through */}
          {targetRect ? (
            <>
              {/* Top mask */}
              <div
                className="absolute bg-black/60 backdrop-blur-[2px] transition-all duration-300 pointer-events-none"
                style={{
                  top: 0,
                  left: 0,
                  width: "100vw",
                  height: `${Math.max(0, targetRect.top)}px`,
                }}
              />
              {/* Bottom mask */}
              <div
                className="absolute bg-black/60 backdrop-blur-[2px] transition-all duration-300 pointer-events-none"
                style={{
                  top: `${targetRect.bottom}px`,
                  left: 0,
                  width: "100vw",
                  height: `${Math.max(0, window.innerHeight - targetRect.bottom)}px`,
                }}
              />
              {/* Left mask */}
              <div
                className="absolute bg-black/60 backdrop-blur-[2px] transition-all duration-300 pointer-events-none"
                style={{
                  top: `${targetRect.top}px`,
                  left: 0,
                  width: `${Math.max(0, targetRect.left)}px`,
                  height: `${targetRect.height}px`,
                }}
              />
              {/* Right mask */}
              <div
                className="absolute bg-black/60 backdrop-blur-[2px] transition-all duration-300 pointer-events-none"
                style={{
                  top: `${targetRect.top}px`,
                  left: `${targetRect.right}px`,
                  width: `${Math.max(0, window.innerWidth - targetRect.right)}px`,
                  height: `${targetRect.height}px`,
                }}
              />
              {/* Spotlight Outline Halo */}
              <div
                className="absolute border-[2px] border-neon-cyan rounded-lg pointer-events-none transition-all duration-300"
                style={{
                  top: `${targetRect.top - 4}px`,
                  left: `${targetRect.left - 4}px`,
                  width: `${targetRect.width + 8}px`,
                  height: `${targetRect.height + 8}px`,
                  boxShadow: "0 0 25px rgba(6, 182, 212, 0.4), inset 0 0 10px rgba(6, 182, 212, 0.2)",
                }}
              />
            </>
          ) : (
            /* Full screen dark blur cover for centered modal steps */
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-none" />
          )}

          {/* Premium Glassmorphic Tutorial Card */}
          <div
            ref={popoverRef}
            className="absolute z-[99999] w-[440px] p-8 rounded-[28px] border border-white/20 bg-slate-900/85 backdrop-blur-2xl shadow-2xl text-white pointer-events-auto transition-all duration-500 ease-out animate-in fade-in zoom-in-95 relative overflow-hidden"
            style={{
              top: `${popoverCoords.top}px`,
              left: `${popoverCoords.left}px`,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 30px 60px -15px rgba(0, 0, 0, 0.9), 0 0 50px rgba(139, 92, 246, 0.25)",
            }}
          >
            {/* Ambient Background Glow */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-neon-cyan/20 to-neon-violet/20 blur-3xl -z-10" />

            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <h4 className="text-2xl font-extrabold bg-gradient-to-r from-neon-cyan to-neon-violet bg-clip-text text-transparent flex items-center gap-3 tracking-tight">
                <Sparkles className="w-7 h-7 text-neon-cyan shrink-0 animate-pulse" />
                {activeStep.title}
              </h4>
              <button
                onClick={handleSkip}
                className="relative z-50 pointer-events-auto cursor-pointer text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all duration-200 shrink-0 hover:scale-105 active:scale-95"
                title="Skip Tour"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Description */}
            <p className="text-lg text-slate-300 leading-relaxed mb-8 font-medium whitespace-pre-wrap">
              {activeStep.body}
            </p>

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800/60 rounded-full mb-6 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-neon-cyan to-neon-violet transition-all duration-500 ease-out"
                style={{ width: `${((currentStepIdx + 1) / activeTour.length) * 100}%` }}
              />
            </div>

            {/* Actions Footer */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-slate-400 font-bold uppercase tracking-widest">
                Step {currentStepIdx + 1} <span className="opacity-50">/ {activeTour.length}</span>
              </span>

              <div className="flex gap-3">
                {currentStepIdx > 0 && (
                  <Button
                    onClick={handleBack}
                    variant="ghost"
                    size="sm"
                    className="h-12 text-base text-slate-300 hover:text-white px-5 rounded-xl hover:bg-white/5 transition-all duration-200"
                  >
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Back
                  </Button>
                )}

                <Button
                  onClick={handleNext}
                  size="sm"
                  className="h-12 text-base bg-gradient-to-r from-neon-cyan to-neon-violet hover:from-cyan-400 hover:to-violet-500 text-white px-7 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(139,92,246,0.6)] font-bold transition-all duration-300 hover:scale-[1.02] active:scale-95 border-none"
                >
                  {currentStepIdx === activeTour.length - 1 ? (
                    "Got it!"
                  ) : (
                    <>
                      Next
                      <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
