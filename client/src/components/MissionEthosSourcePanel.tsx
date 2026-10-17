import { useEffect, useState } from "react";

export function MissionEthosSourcePanel() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/docs/ethos/why.md");
        if (!res.ok) {
          throw new Error(`Failed to load source (${res.status})`);
        }
        const text = await res.text();
        if (!canceled) {
          setContent(text);
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Unable to load Mission Ethos source.");
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      canceled = true;
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Mission Ethos</p>
        <h1 className="text-2xl font-semibold">Source Essay</h1>
        <p className="text-sm text-slate-400">
          Live view of <code className="text-slate-200">docs/ethos/why.md</code>
        </p>
      </header>
      <main className="flex-1 overflow-auto px-5 py-4">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {error && (
          <p className="text-sm text-rose-300">
            {error}
          </p>
        )}
        {!loading && !error && content && (
          <article className="prose prose-invert max-w-none">
            {content.split("\n").map((line, index) => (
              <p key={index} className="text-sm leading-relaxed whitespace-pre-wrap">
                {line || "\u00A0"}
              </p>
            ))}
          </article>
        )}
      </main>
    </div>
  );
}
