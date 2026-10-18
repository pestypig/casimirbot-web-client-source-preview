import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { setSessionUser } from "@/lib/auth/session";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  prompt: () => void;
  disableAutoSelect?: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

export function readGoogleCsrfCookie(): string {
  if (typeof document === "undefined") return "";
  const prefix = "g_csrf_token=";
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

export function initialsForDisplayName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });
}

export function GoogleSignInButton({
  redirectTarget = "/desktop",
  clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID,
  onSignedIn,
  promptOnLoad = true,
}: {
  redirectTarget?: string | null;
  clientId?: string;
  onSignedIn?: () => void | Promise<void>;
  promptOnLoad?: boolean;
}) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled || !buttonRef.current) return;

        if (!clientId) {
          setError("Google sign-in is not configured.");
          return;
        }

        window.google?.accounts?.id?.initialize({
          client_id: clientId,
          auto_select: promptOnLoad,
          use_fedcm_for_prompt: true,
          use_fedcm_for_button: true,
          button_auto_select: promptOnLoad,
          callback: async (response: GoogleCredentialResponse) => {
            setError(null);
            if (!response.credential) {
              setError("Google did not return a credential.");
              return;
            }

            const authResponse = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                credential: response.credential,
                g_csrf_token: readGoogleCsrfCookie(),
              }),
            });
            const receipt = await authResponse.json();
            if (!authResponse.ok || !receipt?.ok || !receipt?.session?.profile) {
              setError(receipt?.message ?? "Google sign-in failed.");
              return;
            }

            const profile = receipt.session.profile;
            cacheAccountCapabilityPolicy(
              receipt.session.account_policy ?? receipt.account_policy ?? null,
              profile.profile_id,
            );
            setSessionUser({
              username: profile.profile_id,
              name: profile.display_name,
              initials: initialsForDisplayName(profile.display_name),
            });
            toast({
              title: "Signed in with Google",
              description: `Welcome, ${profile.display_name}.`,
            });
            await onSignedIn?.();
            if (redirectTarget) {
              setLocation(redirectTarget);
            }
          },
        });

        window.google?.accounts?.id?.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 320,
        });
        if (promptOnLoad) window.google?.accounts?.id?.prompt();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed.");
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
  }, [clientId, onSignedIn, promptOnLoad, redirectTarget, setLocation, toast]);

  return (
    <div className="space-y-3">
      <div ref={buttonRef} />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
