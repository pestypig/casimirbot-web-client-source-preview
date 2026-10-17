import { useCallback, useEffect, useState } from "react";
import {
  clearSessionUser,
  readSessionUser,
  SESSION_EVENT,
  SESSION_STORAGE_KEY,
  type SessionUser,
  setSessionUser,
} from "@/lib/auth/session";

export function useLocalSession() {
  const [user, setUser] = useState<SessionUser | null>(() => readSessionUser());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setUser(readSessionUser());
    window.addEventListener(SESSION_EVENT, sync as EventListener);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SESSION_STORAGE_KEY) {
        sync();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const signOut = useCallback(() => {
    clearSessionUser();
  }, []);

  const signIn = useCallback(
    (session: SessionUser) => {
      setSessionUser(session);
    },
    [],
  );

  return { user, signOut, signIn };
}

export type { SessionUser };
