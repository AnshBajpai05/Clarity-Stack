import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { checkApiStatus } from "@/lib/api";

interface ApiStatusContextType {
  online: boolean;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
}

const ApiStatusContext = createContext<ApiStatusContextType>({ online: false, demoMode: false, setDemoMode: () => {} });

export const useApiStatus = () => useContext(ApiStatusContext);

export const ApiStatusProvider = ({ children }: { children: ReactNode }) => {
  const [online, setOnline] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const check = useCallback(async () => {
    const isOnline = await checkApiStatus();
    setOnline(isOnline);
    if (!isOnline) setDemoMode(true);
    else setDemoMode(false);  // Auto-exit demo mode when backend reconnects
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [check]);

  return (
    <ApiStatusContext.Provider value={{ online, demoMode, setDemoMode }}>
      {children}
    </ApiStatusContext.Provider>
  );
};
