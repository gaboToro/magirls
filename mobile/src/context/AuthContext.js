import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("auth_session");
        if (raw) {
          const parsed = JSON.parse(raw);
          setToken(parsed.token);
          setUser(parsed.user);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = async (sessionToken, sessionUser) => {
    setToken(sessionToken);
    setUser(sessionUser);
    await AsyncStorage.setItem(
      "auth_session",
      JSON.stringify({ token: sessionToken, user: sessionUser })
    );
  };

  const signOut = async () => {
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem("auth_session");
  };

  const value = useMemo(
    () => ({ token, user, isLoading, signIn, signOut, isAuthenticated: !!token }),
    [token, user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
