export type SessionUser = {
  username: string;
  name: string;
  initials?: string;
};

const SESSION_STORAGE_KEY = "helix:demo-user";
export const SESSION_EVENT = "helix:user-changed";

type SessionWindow = Window & { __HELIX_USER?: SessionUser | null };

const getSessionWindow = (): SessionWindow | null => {
  if (typeof window === "undefined") return null;
  return window as SessionWindow;
};

const parseStoredUser = (raw: string | null): SessionUser | null => {
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as SessionUser;
    if (candidate && typeof candidate.username === "string" && typeof candidate.name === "string") {
      return candidate;
    }
  } catch {
    // ignore parse errors
  }
  return null;
};

export const readSessionUser = (): SessionUser | null => {
  const win = getSessionWindow();
  if (!win) return null;
  if (win.__HELIX_USER !== undefined) {
    return win.__HELIX_USER ?? null;
  }
  const stored = parseStoredUser(win.localStorage?.getItem(SESSION_STORAGE_KEY) ?? null);
  win.__HELIX_USER = stored;
  return stored;
};

export const setSessionUser = (user: SessionUser | null): void => {
  const win = getSessionWindow();
  if (!win) return;
  win.__HELIX_USER = user;
  try {
    if (user) {
      win.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } else {
      win.localStorage?.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors (e.g., quota, private mode)
  }
  win.dispatchEvent(new CustomEvent(SESSION_EVENT));
};

export const clearSessionUser = (): void => {
  setSessionUser(null);
};

export { SESSION_STORAGE_KEY };
