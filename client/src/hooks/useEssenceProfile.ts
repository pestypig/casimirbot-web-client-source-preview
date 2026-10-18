import { useCallback, useEffect, useRef, useState } from "react";
import type { EssenceProfile, EssenceProfileUpdate } from "@shared/inferenceProfile";
import { fetchEssenceProfile, resetEssenceProfile, updateEssenceProfile } from "@/lib/agi/api";

export function useEssenceProfile(essenceId: string | null, stateless: boolean) {
  const [profile, setProfile] = useState<EssenceProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!essenceId) return;
    let canceled = false;
    setLoading(true);
    setError(null);
    fetchEssenceProfile(essenceId, { stateless })
      .then((p) => {
        if (canceled) return;
        setProfile(p);
      })
      .catch((err) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : String(err));
        setProfile(null);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [essenceId, stateless]);

  useEffect(() => {
    lastUpdateRef.current = 0;
  }, [essenceId, stateless]);

  const update = useCallback(
    async (update: EssenceProfileUpdate) => {
      if (!essenceId) return null;
      const now = Date.now();
      if (now - lastUpdateRef.current < 1000) {
        return profile;
      }
      lastUpdateRef.current = now;
      setSaving(true);
      try {
        const next = await updateEssenceProfile(essenceId, update, { stateless });
        setProfile(next);
        return next;
      } finally {
        setSaving(false);
      }
    },
    [essenceId, stateless, profile],
  );

  const reset = useCallback(async () => {
    if (!essenceId) return;
    setSaving(true);
    try {
      await resetEssenceProfile(essenceId, { stateless });
      setProfile(null);
    } finally {
      setSaving(false);
    }
  }, [essenceId, stateless]);

  return { profile, loading, error, update, reset, saving };
}
