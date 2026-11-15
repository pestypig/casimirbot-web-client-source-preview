import React from "react";
import type { DiscordTaskConfiguration } from "@shared/discord-task-configuration";

export function DiscordTaskConfigurationView({ configuration: c, native = false }: {
  configuration: DiscordTaskConfiguration; native?: boolean;
}) {
  const href = (path: string) => `${native ? c.website_origin : ""}${path}`;
  const linkProps = native ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const unavailable = <p className="text-amber-200">This source could not be read. Refresh to try again.</p>;
  return <div className="space-y-4 text-sm">
    <p className="break-all text-slate-400">CasimirBot account: {c.owner_profile_ref}</p>
    {c.state === "partial" ? <p role="status" className="text-amber-200">Some saved setup is unavailable.</p> : null}
    <div>
      <h3 className="font-medium">Linked Discord identities</h3>
      {c.remembered_links.state === "unavailable" ? unavailable : c.remembered_links.items.length ?
        <ul className="mt-2 space-y-2">{c.remembered_links.items.map(identity => <li key={identity.epoch} className="break-all rounded border border-white/10 p-2">
          Discord user {identity.discord_user_id} · {identity.status === "active" ? "Remembered for task proposals" : "Forgotten"}
          <p className="text-xs text-slate-400">Server {identity.source_guild_id} · saved {new Date(identity.consented_at).toLocaleString()}</p>
        </li>)}</ul> : <p className="text-slate-400">No remembered Discord identities in this result.</p>}
      {c.remembered_links.truncated ? <p className="text-slate-400">More identity records exist than this view can show.</p> : null}
    </div>
    <div>
      <h3 className="font-medium">Subscriber bot destinations</h3>
      {c.relay_destinations.state === "unavailable" ? unavailable : c.relay_destinations.items.length ?
        <ul className="mt-2 space-y-2">{c.relay_destinations.items.map(relay => <li key={relay.relay_ref} className="break-all rounded border border-white/10 p-2">
          Bot {relay.application_id} · server {relay.guild_id} · channel {relay.channel_id}
          <p className="text-xs text-slate-400">Credential stays on your relay host. Bot access still needs a current check.</p>
        </li>)}</ul> : <p className="text-slate-400">No active subscriber bot destinations in this result.</p>}
      {c.relay_destinations.truncated ? <p className="text-slate-400">More destinations exist than this view can show.</p> : null}
    </div>
    <p className="text-slate-400">Each task still needs review of its server permissions, sources, audience, executor and any reasoning budget. Voice processing needs participant consent.</p>
    <div className="flex flex-wrap gap-4 text-cyan-200">
      <a href={href(c.management_paths.onboarding)} {...linkProps}>Set up Captain Keyes</a>
      <a href={href(c.management_paths.remembered_links)} {...linkProps}>Manage remembered links</a>
      <a href={href(c.management_paths.relays)} {...linkProps}>Manage subscriber relay</a>
    </div>
    <details className="break-all text-xs text-slate-400">
      <summary className="cursor-pointer">Configuration details for task proposals</summary>
      <p className="mt-2">Observed {new Date(c.observed_at).toLocaleString()} · official application {c.official_bot.application_id} · {c.official_bot.configured ? "configured" : "not configured"}.</p>
      <p>Saved configuration does not verify a server installation or current Discord permissions.</p>
      {c.identity_sources.state === "unavailable" ? unavailable : <ul className="mt-2 space-y-1">{c.identity_sources.items.map(identity =>
        <li key={`${identity.session_ref}:${identity.account_link_epoch ?? "session"}`}>{identity.session_ref} · Discord user {identity.discord_user_id} · server {identity.source_guild_id} · {identity.provenance === "remembered_account_link" ? `remembered revision ${identity.account_link_epoch}` : "consumed session link"}</li>)}</ul>}
      {c.identity_sources.truncated ? <p>Identity search was capped; other eligible references may exist.</p> : null}
      <p className="mt-2">Public source {c.public_hek.source_ref}; event freshness is checked when a task admits the catalog.</p>
      <p>Deployment settings enabled: {Object.entries(c.deployment_admission).filter(([, enabled]) => enabled).map(([key]) => key.replaceAll("_", " ")).join(", ") || "none"}. Readiness and authorization are checked separately.</p>
    </details>
  </div>;
}
