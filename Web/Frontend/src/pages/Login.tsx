import React, { useState } from "react";
import axios from "axios";
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
      const res = await fetch("http://127.0.0.1:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // §5.4: Backend will set httpOnly cookies
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      if (res.ok) {
        // We no longer store the JWT in localStorage
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
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground relative overflow-hidden">
      {/* Background effects */}
      <div className="glow-orb w-[32rem] h-[32rem] bg-neon-violet top-0 right-0 opacity-[0.10]" />
      <div className="glow-orb w-[28rem] h-[28rem] bg-neon-cyan bottom-0 left-0 opacity-[0.08]" />

      <div className="relative w-full max-w-md p-8 rounded-2xl glass-panel shadow-floating animate-scale-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <span className="font-display font-bold text-xl tracking-tight">ClarityStack</span>
        </div>

        <h1 className="text-2xl font-display font-bold mb-6 text-center tracking-tight">Welcome back</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="w-full p-3 bg-input/60 rounded-xl border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-[color,background-color,border-color,box-shadow] duration-normal ease-smooth"
            />
            {errors.email && <p className="text-destructive text-sm mt-1.5 ml-1">{errors.email}</p>}
          </div>

          <div>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full p-3 bg-input/60 rounded-xl border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-[color,background-color,border-color,box-shadow] duration-normal ease-smooth"
            />
            {errors.password && <p className="text-destructive text-sm mt-1.5 ml-1">{errors.password}</p>}
          </div>

          {errors.general && <p className="text-destructive text-sm text-center">{errors.general}</p>}

          {noAccount && (
            <button
              type="button"
              onClick={() => navigate("/register", { state: { email: formData.email } })}
              className="w-full py-3 rounded-xl font-medium border border-primary/50 text-primary hover:bg-primary/10 transition-[color,background-color] duration-normal ease-smooth"
            >
              Create an account for {formData.email} →
            </button>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-medium shadow-elevated hover:shadow-glow transition-[color,background-color,box-shadow,transform] duration-normal ease-smooth active:scale-[0.98]"
          >
            Login
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          No account?{" "}
          <span
            onClick={() => navigate("/register")}
            className="text-primary hover:text-primary/80 cursor-pointer font-medium transition-[color] duration-fast"
          >
            Register
          </span>
        </p>
      </div>
    </div>
  );
}

export default Login;
