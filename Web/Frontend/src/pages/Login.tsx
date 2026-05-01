import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

type FormData = {
  email?: string;
  password?: string;
  project_id?: string;
};

type Errors = {
  email?: string;
  password?: string;
  project_id?: string;
  general?: string;
};

function Login() {
  const navigate = useNavigate();
  const [loginType, setLoginType] = useState<"user" | "client">("user");

  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    project_id: "",
  });

  const [errors, setErrors] = useState<Errors>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validate = () => {
    const newErrors: Errors = {};
    if (loginType === "user") {
      if (!formData.email) newErrors.email = "Email required";
      if (!formData.password) newErrors.password = "Password required";
    } else {
      if (!formData.project_id) newErrors.project_id = "Project ID required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      let res;
      if (loginType === "user") {
        res = await axios.post("http://127.0.0.1:8000/api/auth/login", {
          email: formData.email,
          password: formData.password,
        });
      } else {
        res = await axios.post("http://127.0.0.1:8000/api/auth/client-login", {
          project_id: formData.project_id,
        });
      }

      const token = res.data.access_token;
      localStorage.setItem("token", token);
      
      if (loginType === "client") {
        navigate(`/projects/${formData.project_id}/chats`); // Or generated cards
      } else {
        navigate("/projects");
      }
    } catch (err) {
      setErrors({ general: "Invalid credentials or Project ID" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_#1a1333,_#0b0f2a)] text-white">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl">
        <h1 className="text-3xl font-bold mb-6 text-center">Login</h1>
        
        <div className="flex bg-white/5 p-1 rounded-lg mb-6">
          <button 
            className={`flex-1 py-2 text-sm rounded-md transition-colors ${loginType === "user" ? "bg-purple-600 shadow-md" : "hover:bg-white/10"}`}
            onClick={() => setLoginType("user")}
          >
            Normal User
          </button>
          <button 
            className={`flex-1 py-2 text-sm rounded-md transition-colors ${loginType === "client" ? "bg-purple-600 shadow-md" : "hover:bg-white/10"}`}
            onClick={() => setLoginType("client")}
          >
            Client Access
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {loginType === "user" ? (
            <>
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleChange}
                className="w-full p-3 bg-white/10 rounded border border-white/10 focus:outline-none focus:border-purple-500 transition-colors"
              />
              {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email}</p>}

              <input
                type="password"
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                className="w-full p-3 bg-white/10 rounded border border-white/10 focus:outline-none focus:border-purple-500 transition-colors"
              />
              {errors.password && <p className="text-red-400 text-sm mt-1">{errors.password}</p>}
            </>
          ) : (
            <>
              <input
                type="text"
                name="project_id"
                placeholder="Enter Project ID"
                value={formData.project_id}
                onChange={handleChange}
                className="w-full p-3 bg-white/10 rounded border border-white/10 focus:outline-none focus:border-purple-500 transition-colors"
              />
              {errors.project_id && <p className="text-red-400 text-sm mt-1">{errors.project_id}</p>}
            </>
          )}

          {errors.general && <p className="text-red-400 text-sm text-center">{errors.general}</p>}

          <button className="w-full py-3 bg-purple-600 hover:bg-purple-700 transition-colors rounded font-medium shadow-lg shadow-purple-600/20">
            {loginType === "user" ? "Login" : "Access Project"}
          </button>
        </form>

        {loginType === "user" && (
          <p className="mt-6 text-sm text-center text-white/60">
            No account?{" "}
            <span
              onClick={() => navigate("/register")}
              className="text-purple-400 hover:text-purple-300 cursor-pointer transition-colors"
            >
              Register
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

export default Login;