import React, { createContext, useContext, useState } from "react";

// ─────────────────────────────────────────────────────────────
//  Hardcoded demo credentials.
//  For a real deployment (hospitals/care centres), replace this
//  with a proper auth provider (Supabase Auth, Firebase Auth, etc.)
//  This is intentionally simple for a final-year project demo.
// ─────────────────────────────────────────────────────────────
const VALID_USERNAME = "admin";
const VALID_PASSWORD = "AegisCare@2026";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem("aegiscare_auth") === "true"
  );

  function login(username, password) {
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      sessionStorage.setItem("aegiscare_auth", "true");
      setIsAuthenticated(true);
      return { success: true };
    }
    return { success: false, error: "Incorrect username or password." };
  }

  function logout() {
    sessionStorage.removeItem("aegiscare_auth");
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
