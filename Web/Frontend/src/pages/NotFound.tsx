import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { GlareCard } from "@/components/ui/glare-card";
import { DottedSurface } from "@/components/ui/dotted-surface";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
      <DottedSurface />
      <GlareCard containerClassName="relative z-10" className="flex flex-col items-center justify-center text-center p-8 bg-card/80">
        <h1 className="mb-4 text-6xl font-display font-bold text-foreground">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </GlareCard>
    </div>
  );
};

export default NotFound;
