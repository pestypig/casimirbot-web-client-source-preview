import { useEffect, useMemo, useState } from "react";
import type { ChatSession } from "@shared/agi-chat";
import { MessageBubble } from "@/components/agi/MessageBubble";
import { exportNodeToImage, type PillExportFormat } from "@/lib/ideology/pill-export";

type ExportOptions = {
  pixelRatio?: number;
};

declare global {
  interface Window {
    __essenceExportReady?: boolean;
    __essenceExport?: (format: PillExportFormat, options?: ExportOptions) => Promise<string>;
    __essenceExportPayload?: { session?: ChatSession; hash?: string | null };
  }
}

const getQueryParam = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(key);
  return value && value.trim() ? value.trim() : null;
};

export default function EssenceRenderPage() {
  const payload = typeof window !== "undefined" ? window.__essenceExportPayload : undefined;
  const [session, setSession] = useState<ChatSession | null>(payload?.session ?? null);
  const [hash, setHash] = useState<string | null>(payload?.hash ?? getQueryParam("hash"));
  const sessionId = useMemo(() => getQueryParam("session"), []);
  const title = session?.title ?? "Essence Console Transcript";

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.backgroundColor = "transparent";
      document.body.style.backgroundColor = "transparent";
    }
  }, []);

  useEffect(() => {
    if (session || !sessionId) return;
    let cancelled = false;
    fetch(`/api/agi/chat/sessions/${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((payload) => {
        if (cancelled) return;
        const remote = payload?.session as ChatSession | undefined;
        if (remote) {
          setSession(remote);
          setHash(remote.messagesHash ?? hash);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hash, session, sessionId]);

  useEffect(() => {
    if (!session) return;
    const target = document.querySelector("[data-export-root]") as HTMLElement | null;
    if (!target) return;
    window.__essenceExport = async (format, options) =>
      exportNodeToImage(target, format, { pixelRatio: options?.pixelRatio });
    window.__essenceExportReady = true;
    return () => {
      delete window.__essenceExport;
      delete window.__essenceExportReady;
    };
  }, [session]);

  if (!session) {
    return (
      <div className="min-h-screen bg-transparent p-6 text-sm text-slate-400">
        Loading transcript...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-6">
      <div
        className="mx-auto w-full max-w-[880px] rounded-2xl border border-white/10 bg-slate-950/80 p-6 text-slate-100 shadow-xl"
        data-export-root
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Essence Console Transcript
            </div>
            <div className="text-lg font-semibold">{title}</div>
            <div className="text-xs text-slate-400">Session {session.id}</div>
          </div>
          <div className="text-[11px] text-slate-400 space-y-1 text-right">
            <div>Persona {session.personaId}</div>
            <div>Created {new Date(session.createdAt).toLocaleString()}</div>
            <div>Updated {new Date(session.updatedAt).toLocaleString()}</div>
            <div>Messages {session.messageCount ?? session.messages.length}</div>
            <div>Hash {hash ?? session.messagesHash ?? "unknown"}</div>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {session.messages.length === 0 ? (
            <div className="text-sm text-slate-400">No messages captured.</div>
          ) : (
            session.messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
        </div>
      </div>
    </div>
  );
}
