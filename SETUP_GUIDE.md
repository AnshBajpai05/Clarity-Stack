# ClarityStack v1.0 — Deployment & Architecture Guide

ClarityStack is a distributed intelligence architecture comprising 8 microservices. This guide ensures a stable, hardened deployment.

## 🚀 Stability Hardening (New in v1.0)
We have implemented several "Bulletproof" features to ensure system reliability:
- **Global Error Trap:** A top-level window listener captures boot-time crashes and displays actionable stack traces.
- **Render Guards:** All dashboard components are wrapped in defensive `try-catch` blocks to prevent malformed data from blanking the screen.
- **API Resilience:** `localStorage` interactions are safely wrapped to handle restricted browser environments (Brave/Private modes).
- **Sequential Port Mapping:** All services have been standardized to a predictable port range (8000-8007) to eliminate cross-service communication failures.

---

## 1. Port Architecture Standard
| Service | Port | Directory | Protocol |
|---------|------|-----------|----------|
| **Core Backend** | `8000` | `/Backend` | FastAPI / WebSocket |
| **SRS Intelligence** | `8001` | `/SRS_Service` | FastAPI / Transformers |
| **ThreatLens AI** | `8002` | `/ThreatLens_Service` | FastAPI / ML |
| **Knowledge Satellite** | `8003` | `/Satellite` | Node.js / MongoDB |
| **Collaborative Editor** | `8004` | `/Editor_Service` | Node.js / Socket.io |
| **UML Generation API** | `8005` | `/UML_Clarity_Service/backend` | FastAPI / GraphViz |
| **Main Dashboard (UI)** | `8006` | `/Web/Frontend` | Vite / React |
| **UML Visualizer (UI)** | `8007` | `/UML_Clarity_Service` | Vite / React |

---

## 2. One-Click Orchestration
To simplify local deployment, use the provided batch scripts:
- **`start_project.bat`**: Launches all 8 services in a multi-tab Windows Terminal window.
- **`kill_services.bat`**: Gracefully terminates all background processes on the 8000-8007 range.

---

## 3. Manual Installation

### 🐍 Python Backend Services (Ports: 8000, 8001, 8002, 8005)
Each Python service requires a local virtual environment (`venv`) and its specific requirements file.

1.  **Core Backend (8000)**
    - **Directory:** `/Backend`
    - **Install:** `pip install -r requirements_backend.txt`
2.  **SRS Intelligence (8001)**
    - **Directory:** `/SRS_Service`
    - **Install:** `pip install -r requirements_srs.txt`
3.  **ThreatLens AI (8002)**
    - **Directory:** `/ThreatLens_Service`
    - **Install:** `pip install -r requirements_threatlens.txt`
4.  **UML Generation API (8005)**
    - **Directory:** `/UML_Clarity_Service/backend`
    - **Install:** `pip install -r requirements_uml_backend.txt`

**Standard Python Workflow:**
```powershell
cd <service_directory>
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements_xxx.txt
```

### 📦 Node.js & Frontend Services (Ports: 8003, 8004, 8006, 8007)
These services require `Node.js` and `npm`. Run `npm install` in each directory.

1.  **Knowledge Satellite (8003)**
    - **Directory:** `/Satellite`
    - **Deps List:** `requirements_satellite.txt`
2.  **Collaborative Editor (8004)**
    - **Directory:** `/Editor_Service`
    - **Deps List:** `requirements_editor.txt`
3.  **Main Dashboard (8006) [_frontend]**
    - **Directory:** `/Web/Frontend`
    - **Deps List:** `requirements_frontend.txt`
4.  **UML Visualizer (8007) [_uml_ui]**
    - **Directory:** `/UML_Clarity_Service`
    - **Deps List:** `requirements_uml_ui.txt`

**Standard Node Workflow:**
```powershell
cd <service_directory>
npm install
```

---

## 4. Environment Configuration
Ensure `.env` files are present in all service roots with the following keys:

### 🐍 Python Services

**1. Core Backend (`/Backend/.env`)**
- `JWT_SECRET`: Signing secret for JWTs. **Must be identical across Backend, Satellite, and Editor** (shared, stateless auth). Generate with `python -c "import secrets; print(secrets.token_hex(32))"`. Services fail-closed (refuse to boot) if unset.
- `ALGORITHM`: `HS256`
- `DATABASE_URL`: `sqlite:///./claritystack.db` (Postgres: `postgresql+psycopg2://user:pass@host:5432/claritystack`)
- `RUN_MIGRATIONS_ON_STARTUP`: `1` (default). Schema is owned by **Alembic** (§2.3) — on boot the Core runs `alembic upgrade head` (a pre-existing `create_all` DB is auto-adopted via `alembic stamp head`). For **multi-worker prod**, set `0` and run `alembic upgrade head` once in your deploy step so workers don't race on DDL.
- `GROQ_API_KEY`: Required for Mixtral/Llama inference.
- `NVIDIA_API_KEY`: Required for NVIDIA NIM microservices.
- `HF_ACCESS_TOKEN`: Required for HuggingFace model access.

**2. SRS Intelligence (`/SRS_Service/.env`)**
- `HF_TOKEN`: HuggingFace token for sentence-transformers.
- `MODEL_PATH`: `sentence-transformers/all-MiniLM-L6-v2`
- `NVIDIA_API_KEY`: Required for advanced SRS validation.
- `PORT`: `8001`

**3. ThreatLens AI (`/ThreatLens_Service/.env`)**
- `GOOGLE_SAFE_BROWSING_API_KEY`: For real-time URL reputation checks.
- `PORT`: `8002`

**4. UML Generation API (`/UML_Clarity_Service/.env`)**
- `NVIDIA_API_KEY`: Powers the UML-to-Code and Code-to-UML logic.
- `VITE_API_URL`: `http://localhost:8005`
- `PORT`: `8005`

### 📦 Node.js & Frontend Services

**5. Knowledge Satellite (`/Satellite/.env`)**
- `MONGO_URI`: MongoDB Atlas connection string.
- `JWT_SECRET`: Must match the Backend's secret key.
- `GROQ_API_KEY` / `NVIDIA_API_KEY` / `HF_TOKEN`: API credentials for satellite inference.
- `SUPABASE_URL` / `SUPABASE_KEY`: For real-time collaborative storage.
- `SMTP_USER` / `SMTP_PASS`: For email notifications (e.g., via Gmail).
- `PORT`: `8003`

**6. Collaborative Editor (`/Editor_Service/.env`)**
- `SUPABASE_URL` / `SUPABASE_KEY`: Required for document synchronization.
- `JWT_SECRET`: Must match the Backend's secret key (verifies user tokens). Previously named `SECRET_KEY` — the mismatch silently disabled Editor auth.
- `PORT`: `8004`

**7. Main Dashboard [_frontend] (`/Web/Frontend/.env`)**
- `VITE_API_BASE_URL`: `http://localhost:8000`
- `VITE_SRS_API_URL`: `http://localhost:8001`
- `VITE_THREATLENS_URL`: `http://localhost:8002`
- `VITE_SATELLITE_URL`: `http://localhost:8003`
- `VITE_EDITOR_BACKEND_URL`: `http://localhost:8004`
- `VITE_UML_API_URL`: `http://localhost:8005`

**8. UML Visualizer [_uml_ui] (`/UML_Clarity_Service/.env`)**
- `VITE_NVIDIA_API_KEY`: Same as UML API.
- `VITE_API_URL`: `http://localhost:8005`
- `PORT`: `8007`

---

## 5. Troubleshooting the "Blank Screen"
If you encounter a blank dashboard:
1. **Check the Red Box:** A red error overlay will appear if a boot crash occurs.
2. **Satellite Check:** Ensure MongoDB is connected; the Satellite logs `✅ MongoDB Atlas connected` on boot.
3. **Port Check:** Use `kill_services.bat` and restart to clear any zombie processes.
