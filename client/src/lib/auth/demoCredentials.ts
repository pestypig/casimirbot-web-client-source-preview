import type { SessionUser } from "./session";

export const DEMO_USERNAME = "admin";
export const DEMO_PASSWORD = "password";

export const DEMO_SESSION_USER: SessionUser = {
  username: DEMO_USERNAME,
  name: "Admin Operator",
  initials: "AO"
};

export const validateDemoCredentials = (
  username: string,
  password: string
): SessionUser | null => {
  if (username === DEMO_USERNAME && password === DEMO_PASSWORD) {
    return DEMO_SESSION_USER;
  }
  return null;
};
