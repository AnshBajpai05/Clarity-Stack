import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

type FormData = {
  email?: string;
  password?: string;
};

type Errors = {
  email?: string;
  password?: string;
  general?: string;
};

function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<Errors>({});
  // true when the backend reports the email has no account (404) — show a Register CTA.
  const [noAccount, setNoAccount] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setNoAccount(false);
    setErrors((prev) => ({ ...prev, general: undefined }));
  };

  const validate = () => {
    const newErrors: Errors = {};
    if (!formData.email) newErrors.email = "Email required";
    if (!formData.password) newErrors.password = "Password required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setNoAccount(false);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // §5.4: Backend will set httpOnly cookies
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      if (res.ok) {
        // Backend returns { access_token, token_type } as JSON — it does not set
        // any auth cookie (no httpOnly session, no /api/auth/me). The Bearer token
        // is the only credential; lib/http.ts's api() reads it from localStorage.
        const data = await res.json();
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("cs_email", formData.email || "");
        navigate("/projects");
        return;
      }

      if (res.status === 404) {
        // No account for this email — guide the user to register instead of dead-ending.
        setNoAccount(true);
        setErrors({ general: "No account found for this email." });
        return;
      }

      setErrors({ general: "Invalid credentials" });
    } catch (err) {
      setErrors({ general: "Couldn't reach the server. Please try again." });
    }
  };

  return (
    <div
      className="h-screen w-full flex items-center justify-center p-4"
      style={{
        /* Map the user's palette into local vars for this page */
        "--cs-lightest":  "#e1e4e8",
        "--cs-mid":       "#939ca3",
        "--cs-dark":      "#646f77",
        "--cs-soft":      "#b5bdc4",
        "--cs-warm":      "#aeb4ac",
      } as React.CSSProperties}
    >
      {/* ── Card shell ── */}
      <div className="relative w-full max-w-5xl h-[600px] rounded-2xl overflow-hidden shadow-floating flex animate-scale-in"
           style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--glass-border) / 0.4)" }}>

        {/* ─── LEFT — interactive form panel ─── */}
        <LeftPanel
          formData={formData}
          errors={errors}
          noAccount={noAccount}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onForgot={() => {}}
          onRegister={() => navigate("/register")}
          onRegisterWithEmail={() => navigate("/register", { state: { email: formData.email } })}
        />

        {/* ─── RIGHT — image panel (hidden on small screens) ─── */}
        <div className="hidden lg:block relative w-1/2 h-full overflow-hidden">
          <img
            src="/login_bg.png"
            alt="ClarityStack visual"
            className="w-full h-full object-cover opacity-40"
          />
          {/* Overlay branding */}
          <div className="absolute inset-0 flex flex-col justify-end p-10"
               style={{ background: "linear-gradient(to top, hsl(var(--card)) 0%, transparent 60%)" }}>
            <p className="text-xs tracking-[0.3em] uppercase mb-2"
               style={{ color: "var(--cs-mid)" }}>
              Knowledge Intelligence
            </p>
            <h2 className="text-3xl font-display font-bold leading-tight"
                style={{ color: "var(--cs-lightest)" }}>
              Turn conversations<br />into decisions.
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   LeftPanel — form + spotlight effect
   ════════════════════════════════════════════════════════════ */

interface LeftPanelProps {
  formData: FormData;
  errors: Errors;
  noAccount: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onForgot: () => void;
  onRegister: () => void;
  onRegisterWithEmail: () => void;
}

function LeftPanel({ formData, errors, noAccount, onChange, onSubmit, onForgot, onRegister, onRegisterWithEmail }: LeftPanelProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const socialIcons = [
    {
      label: "Instagram",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4zm9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8A1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5a5 5 0 0 1-5 5a5 5 0 0 1-5-5a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3"/></svg>
      ),
    },
    {
      label: "LinkedIn",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M6.94 5a2 2 0 1 1-4-.002a2 2 0 0 1 4 .002M7 8.48H3V21h4zm6.32 0H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91z"/></svg>
      ),
    },
    {
      label: "Facebook",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 0 1 1-1h3v-4h-3a5 5 0 0 0-5 5v2.01h-2l-.396 3.98h2.396z"/></svg>
      ),
    },
  ];

  return (
    <div
      className="relative w-full lg:w-1/2 h-full overflow-hidden flex flex-col justify-center px-8 md:px-14"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Spotlight orb */}
      <div
        className="pointer-events-none absolute w-[420px] h-[420px] rounded-full blur-3xl transition-opacity duration-300"
        style={{
          background: "radial-gradient(circle, hsl(var(--neon-violet) / 0.15) 0%, hsl(var(--neon-cyan) / 0.08) 60%, transparent 100%)",
          opacity: hovering ? 1 : 0,
          transform: `translate(${mouse.x - 210}px, ${mouse.y - 210}px)`,
          transition: "transform 0.12s ease-out, opacity 0.3s ease",
        }}
      />

      <form onSubmit={onSubmit} className="relative z-10 flex flex-col gap-5">

        {/* Branding */}
        <div className="mb-2">
          <p className="text-xs tracking-[0.3em] uppercase mb-1" style={{ color: "var(--cs-mid)" }}>
            ClarityStack
          </p>
          <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight"
              style={{ color: "var(--cs-lightest)" }}>
            Sign in
          </h1>
        </div>

        {/* Social icons */}
        <div className="flex gap-3">
          {socialIcons.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-label={`Continue with ${s.label}`}
              className="relative group w-11 h-11 rounded-full flex items-center justify-center overflow-hidden border transition-all duration-300 hover:scale-105"
              style={{
                background: "hsl(var(--muted) / 0.5)",
                borderColor: "hsl(var(--glass-border) / 0.5)",
                color: "var(--cs-soft)",
              }}
            >
              {/* liquid fill */}
              <span className="absolute inset-0 scale-y-0 origin-bottom transition-transform duration-500 ease-in-out group-hover:scale-y-100"
                    style={{ background: "hsl(var(--primary) / 0.15)" }} />
              <span className="relative z-10 transition-colors duration-300 group-hover:text-primary">{s.icon}</span>
            </button>
          ))}
        </div>

        <p className="text-xs" style={{ color: "var(--cs-dark)" }}>or use your email</p>

        {/* Inputs */}
        <AppInput
          placeholder="Email"
          type="email"
          name="email"
          value={formData.email ?? ""}
          onChange={onChange}
          id="login-email"
        />
        {errors.email && <p className="text-destructive text-xs -mt-3">{errors.email}</p>}

        <AppInput
          placeholder="Password"
          type="password"
          name="password"
          value={formData.password ?? ""}
          onChange={onChange}
          id="login-password"
        />
        {errors.password && <p className="text-destructive text-xs -mt-3">{errors.password}</p>}

        {errors.general && <p className="text-destructive text-sm text-center">{errors.general}</p>}

        {/* Forgot */}
        <button
          type="button"
          onClick={onForgot}
          className="text-xs text-left transition-colors duration-150 hover:text-primary"
          style={{ color: "var(--cs-dark)" }}
        >
          Forgot your password?
        </button>

        {/* Register CTA when no account */}
        {noAccount && (
          <button
            type="button"
            onClick={onRegisterWithEmail}
            className="w-full py-2.5 rounded-xl text-sm font-medium border border-primary/50 text-primary hover:bg-primary/10 transition-colors duration-normal"
          >
            Create an account for {formData.email} →
          </button>
        )}

        {/* Submit */}
        <button
          id="login-submit"
          type="submit"
          className="group relative inline-flex items-center justify-center overflow-hidden w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: "hsl(var(--primary))",
            color: "hsl(var(--primary-foreground))",
          }}
        >
          <span className="relative z-10">Sign In</span>
          {/* shimmer sweep */}
          <div className="absolute inset-0 flex justify-center [transform:skew(-13deg)_translateX(-100%)] group-hover:duration-700 group-hover:[transform:skew(-13deg)_translateX(100%)]">
            <div className="relative h-full w-8 bg-white/20" />
          </div>
        </button>

        {/* Register link */}
        <p className="text-xs text-center" style={{ color: "var(--cs-dark)" }}>
          No account?{" "}
          <button
            type="button"
            onClick={onRegister}
            className="font-semibold transition-colors duration-150 hover:text-primary"
            style={{ color: "var(--cs-mid)" }}
          >
            Register
          </button>
        </p>
      </form>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   AppInput — radial-gradient border-trace on hover
   ════════════════════════════════════════════════════════════ */

interface AppInputProps {
  placeholder?: string;
  type?: string;
  name?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  id?: string;
  [key: string]: unknown;
}

function AppInput({ placeholder, type = "text", ...rest }: AppInputProps) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  const handleMove = (e: React.MouseEvent<HTMLInputElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div className="relative w-full">
      <input
        type={type}
        placeholder={placeholder}
        className="peer relative z-10 w-full h-12 rounded-xl px-4 text-sm font-light outline-none transition-all duration-200"
        style={{
          background: "hsl(var(--input) / 0.6)",
          border: "1px solid hsl(var(--glass-border) / 0.5)",
          color: "var(--cs-lightest)",
        }}
        onMouseMove={handleMove}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        {...rest}
      />
      {/* top edge trace */}
      {hovering && (
        <>
          <div
            className="pointer-events-none absolute top-0 left-0 right-0 h-[1px] z-20 rounded-t-xl"
            style={{
              background: `radial-gradient(40px circle at ${mouse.x}px 0px, hsl(var(--primary) / 0.9) 0%, transparent 70%)`,
            }}
          />
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-[1px] z-20 rounded-b-xl"
            style={{
              background: `radial-gradient(40px circle at ${mouse.x}px 1px, hsl(var(--primary) / 0.6) 0%, transparent 70%)`,
            }}
          />
        </>
      )}
    </div>
  );
}

export default Login;
