import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./Dashboard";
import Workspace from "./Workspace";
import Snapshot from "./Snapshot";
import Login from "./Login";
import { supabase } from "./supabaseClient";

export const AuthContext = React.createContext(null);

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ color: 'white', padding: '20px' }}>Loading...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <AuthContext.Provider value={session}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workspace/:id" element={<Workspace />} />
          <Route path="/snapshot/:id" element={<Snapshot />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;
