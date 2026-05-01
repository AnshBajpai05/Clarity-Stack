import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_#1a1333,_#0b0f2a)] text-white">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl">

        <h1 className="text-3xl font-bold mb-2">Create Account</h1>

        <form onSubmit={handleSubmit} className="space-y-5">

          <input
            type="email"
            name="email"
            placeholder="Email"
            onChange={handleChange}
            className="w-full p-3 bg-white/10 rounded"
          />
          {errors.email && <p className="text-red-400">{errors.email}</p>}

          <input
            type="password"
            name="password"
            placeholder="Password"
            onChange={handleChange}
            className="w-full p-3 bg-white/10 rounded"
          />
          {errors.password && <p className="text-red-400">{errors.password}</p>}

          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm Password"
            onChange={handleChange}
            className="w-full p-3 bg-white/10 rounded"
          />
          {errors.confirmPassword && (
            <p className="text-red-400">{errors.confirmPassword}</p>
          )}

          <button className="w-full py-3 bg-purple-600 rounded">
            Register
          </button>
        </form>

        <p className="mt-4 text-sm">
          Already have an account?{" "}
          <span
            onClick={() => navigate("/login")}
            className="text-purple-400 cursor-pointer"
          >
            Login
          </span>
        </p>
      </div>
    </div>
  );
}

export default Register;