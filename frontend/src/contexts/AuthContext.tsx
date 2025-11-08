// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, ReactNode } from "react";
import axios from "axios";

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  register: (
    username: string,
    email: string,
    password: string,
    role: string
  ) => Promise<void>;
  login: (identifier: string, password: string) => Promise<User>; // Returns User now
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  // Helper function to get cookie value - MUST be defined before interceptor
  function getCookie(name: string) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
    return null;
  }

  const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
  withCredentials: true,
  headers: { 
    "X-Requested-With": "XMLHttpRequest"
  },
});

  // Add an interceptor to include CSRF token from cookie in all requests
  axiosInstance.interceptors.request.use((config) => {
    const csrfToken = getCookie('csrftoken');
    console.log("🔐 Interceptor - CSRF token from cookie:", csrfToken);
    if (csrfToken) {
      config.headers = config.headers || {};
      config.headers['X-CSRFToken'] = csrfToken;
      console.log("✅ Interceptor - Added X-CSRFToken header");
    } else {
      console.warn("⚠️ Interceptor - No CSRF token found in cookies");
    }
    return config;
  });

  const getCsrfToken = async () => {
    try {
      console.log("🔐 Attempting to get CSRF token...");
      console.log("🌐 Base URL:", axiosInstance.defaults.baseURL);
      const response = await axiosInstance.get("/auth/csrf/");
      console.log("✅ CSRF token response:", response.data);
      console.log("🍪 Cookies after CSRF call:", document.cookie);
      const csrfToken = getCookie('csrftoken');
      console.log("🔑 CSRF token from cookie:", csrfToken);
      // The cookie is now set, no need to return anything
    } catch (error) {
      console.error("❌ Failed to get CSRF token:", error);
      console.error("🌐 URL attempted:", "/auth/csrf/");
      console.error("🌐 Base URL:", axiosInstance.defaults.baseURL);
    }
  };

  const register = async (
    username: string,
    email: string,
    password: string,
    role: string
  ) => {
    try {
      // CSRF désactivé temporairement pour les tests ngrok
      // await getCsrfToken();
      const response = await axiosInstance.post<{ id: string; username: string; email: string }>(
        "/auth/register/",
        { username, email, password, role }
      );
      setUser({
        id: response.data.id,
        email: response.data.email,
        name: response.data.username
      });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      console.error(error.response?.data || error.message);
      throw new Error(error.response?.data?.error || "Registration failed");
    }
  };

  const login = async (identifier: string, password: string) => {
  try {
    // CSRF désactivé temporairement pour les tests ngrok
    // await getCsrfToken();
    const response = await axiosInstance.post<{
      success: boolean;
      user: {
        id: string;
        username: string;
        email: string;
        role: string;
      }
    }>(
      "/auth/login/",
      {
        username: identifier,
        password: password
      }
    );

    console.log("Login response from backend:", response.data);

    const userData = {
      id: response.data.user.id,
      email: response.data.user.email || identifier,
      name: response.data.user.username,
      role: response.data.user.role
    };

    console.log("Setting user data:", userData);

    setUser(userData);

    // Store in localStorage too for persistence
    localStorage.setItem('user', JSON.stringify(userData));

    return userData; // Return the user data
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } }; message?: string };
    console.error("Login error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.error || "Login failed");
  }
};

  const logout = async () => {
    await axiosInstance.post("/auth/logout/");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
