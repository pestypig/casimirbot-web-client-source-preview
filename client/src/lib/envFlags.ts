const TRUTHY = new Set(["1", "true", "yes", "on"]);

const getEnvValue = (key: string): string | undefined => {
  const env = (import.meta as any)?.env ?? {};
  return env[key] ?? env[`VITE_${key}`];
};

export const isFlagEnabled = (key: string, defaultValue = false): boolean => {
  const raw = getEnvValue(key);
  if (typeof raw !== "string") {
    return defaultValue;
  }
  return TRUTHY.has(raw.toLowerCase());
};
