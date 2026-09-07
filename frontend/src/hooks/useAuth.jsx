import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getToken, setToken as persistToken } from "../services/api";

// Decodes the payload of a JWT without verifying its signature. Verification
// happens server-side on every request; this is only used client-side to
// read the role/username for UI purposes (nav links, greetings).
function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      const decoded = decodeJwtPayload(token);
      if (decoded && decoded.exp * 1000 > Date.now()) {
        setSession({ token, id: decoded.id, role: decoded.role, username: decoded.username });
      } else {
        persistToken(null);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((token) => {
    persistToken(token);
    const decoded = decodeJwtPayload(token);
    setSession({ token, id: decoded.id, role: decoded.role, username: decoded.username });
  }, []);

  const logout = useCallback(() => {
    persistToken(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider.");
  return ctx;
}
