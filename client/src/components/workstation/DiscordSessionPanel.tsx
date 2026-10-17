import React from "react";

type DiscordParticipantView = {
  discord_user_id: string;
  display_name: string;
  role: string;
  authority: string;
};

type DiscordSessionView = {
  session_id: string;
  guild_id: string;
  voice_channel_id: string;
  status: string;
  linked_profile_id?: string | null;
  commander_discord_user_id?: string | null;
  thread_id?: string | null;
  live_environment_ids: string[];
  participants: DiscordParticipantView[];
  updated_at: string;
};

type DiscordPolicyView = {
  companion_mode?: string;
  commentary_mode?: string;
  voice_output_enabled?: boolean;
};

type DiscordDiagnosticView = {
  last_source_event?: { event_type?: string; text?: string | null; ts?: string } | null;
  last_output_receipt?: { channel?: string; reason?: string; delivered?: boolean; ts?: string } | null;
  raw_audio_included?: false;
  raw_transcript_included?: false;
};

type DiscordInteractionEndpointView = {
  path?: string;
  public_key_configured?: boolean;
  application_id?: string | null;
  command_registration_script?: string;
  latest_interaction?: {
    interaction_id?: string | null;
    command?: string | null;
    subcommand?: string | null;
    terminal_answer_source?: string | null;
    terminal_hash?: string | null;
    poison_audit_ok?: boolean | null;
    deferred?: boolean;
    answer_created?: boolean;
    created_at?: string;
  } | null;
};

export function DiscordSessionPanel() {
  const [sessions, setSessions] = React.useState<DiscordSessionView[]>([]);
  const [policies, setPolicies] = React.useState<Record<string, DiscordPolicyView>>({});
  const [diagnostics, setDiagnostics] = React.useState<Record<string, DiscordDiagnosticView>>({});
  const [interactionEndpoint, setInteractionEndpoint] = React.useState<DiscordInteractionEndpointView | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch("/api/discord/sessions");
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = await response.json();
      setSessions(Array.isArray(body.sessions) ? body.sessions : []);
      setPolicies(body.policies && typeof body.policies === "object" ? body.policies : {});
      setDiagnostics(body.diagnostics && typeof body.diagnostics === "object" ? body.diagnostics : {});
      setInteractionEndpoint(
        body.interaction_endpoint && typeof body.interaction_endpoint === "object"
          ? body.interaction_endpoint
          : null,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Discord sessions.");
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">Discord Session</p>
          <p className="mt-1 text-xs text-slate-400">
            Linked voice/text sessions route into Helix as observations and explicit direct-address turn requests.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
        >
          Refresh
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      {interactionEndpoint ? (
        <div className="mt-3 grid gap-2 rounded border border-cyan-500/15 bg-cyan-500/5 p-2 text-xs text-slate-300 md:grid-cols-3">
          <span className="rounded bg-black/20 px-2 py-1">
            endpoint {interactionEndpoint.path ?? "/api/discord/interactions"}
          </span>
          <span className="rounded bg-black/20 px-2 py-1">
            public key {interactionEndpoint.public_key_configured ? "configured" : "missing"}
          </span>
          <span className="rounded bg-black/20 px-2 py-1">
            latest {interactionEndpoint.latest_interaction?.command ?? "none"}
            {interactionEndpoint.latest_interaction?.terminal_answer_source
              ? ` / ${interactionEndpoint.latest_interaction.terminal_answer_source}`
              : ""}
          </span>
          <span className="rounded bg-black/20 px-2 py-1 md:col-span-2">
            command script {interactionEndpoint.command_registration_script ?? "not configured"}
          </span>
          <span className="rounded bg-black/20 px-2 py-1">
            poison {String(interactionEndpoint.latest_interaction?.poison_audit_ok ?? "n/a")}
          </span>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {sessions.length === 0 ? (
          <p className="rounded border border-dashed border-white/15 px-3 py-4 text-center text-xs text-slate-500">
            No Discord sessions yet. Use the bot scaffold or /api/discord/session/start.
          </p>
        ) : (
          sessions.map((session) => {
            const commander = session.participants.find(
              (participant) => participant.discord_user_id === session.commander_discord_user_id,
            );
            const policy = policies[session.session_id] ?? {};
            const diagnostic = diagnostics[session.session_id] ?? {};
            return (
              <div key={session.session_id} className="rounded border border-white/10 bg-slate-950/70 p-3 text-xs">
                <div className="grid gap-2 md:grid-cols-[1fr_120px_160px]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{session.session_id}</p>
                    <p className="mt-1 truncate text-slate-400">
                      guild {session.guild_id} / voice {session.voice_channel_id}
                    </p>
                  </div>
                  <span className="rounded bg-white/5 px-2 py-1 text-center text-slate-200">{session.status}</span>
                  <span className="rounded bg-white/5 px-2 py-1 text-center text-slate-200">
                    envs {session.live_environment_ids.length}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    thread {session.thread_id ?? "unbound"}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    profile {session.linked_profile_id ?? "unlinked"}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    commander {commander?.display_name ?? "none"}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    companion {policy.companion_mode ?? "unknown"}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    commentary {policy.commentary_mode ?? "unknown"}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
                    voice output {String(policy.voice_output_enabled ?? false)}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-400">
                    last event {diagnostic.last_source_event?.event_type ?? "none"}
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 text-slate-400">
                    last output {diagnostic.last_output_receipt?.reason ?? "none"}
                  </span>
                </div>
                {session.participants.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {session.participants.map((participant) => (
                      <span key={participant.discord_user_id} className="rounded bg-cyan-500/10 px-2 py-1 text-cyan-100">
                        {participant.display_name} / {participant.role} / {participant.authority}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
