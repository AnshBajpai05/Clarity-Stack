import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./Dashboard";
import Workspace from "./Workspace";
import Snapshot from "./Snapshot";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workspace/:id" element={<Workspace />} />
        <Route path="/snapshot/:id" element={<Snapshot />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
