import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

type FormData = {
  email: string;
  password: string;
  confirmPassword: string;
};

type Errors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState<Errors>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name as keyof Errors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validate = () => {
    const newErrors: Errors = {};

    if (!formData.email) newErrors.email = "Email is required";
    if (formData.password.length < 6)
      newErrors.password = "Minimum 6 characters required";
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      await axios.post("http://127.0.0.1:8000/api/auth/register", {
        email: formData.email,
        password: formData.password,
      });

      alert("Registered successfully");
      navigate("/login");
    } catch (err) {
      setErrors({ email: "User already exists" });
    }
  };

  const inputClasses =
    "w-full p-3 bg-input/60 rounded-xl border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-[color,background-color,border-color,box-shadow] duration-normal ease-smooth";

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

        <h1 className="text-2xl font-display font-bold mb-6 text-center tracking-tight">Create Account</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              name="email"
              placeholder="Email"
              onChange={handleChange}
              className={inputClasses}
            />
            {errors.email && <p className="text-destructive text-sm mt-1.5 ml-1">{errors.email}</p>}
          </div>

          <div>
            <input
              type="password"
              name="password"
              placeholder="Password"
              onChange={handleChange}
              className={inputClasses}
            />
            {errors.password && <p className="text-destructive text-sm mt-1.5 ml-1">{errors.password}</p>}
          </div>

          <div>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              onChange={handleChange}
              className={inputClasses}
            />
            {errors.confirmPassword && (
              <p className="text-destructive text-sm mt-1.5 ml-1">{errors.confirmPassword}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-medium shadow-elevated hover:shadow-glow transition-[color,background-color,box-shadow,transform] duration-normal ease-smooth active:scale-[0.98]"
          >
            Register
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          Already have an account?{" "}
          <span
            onClick={() => navigate("/login")}
            className="text-primary hover:text-primary/80 cursor-pointer font-medium transition-[color] duration-fast"
          >
            Login
          </span>
        </p>
      </div>
    </div>
  );
}

export default Register;