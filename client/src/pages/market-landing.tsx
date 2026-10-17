import { ArrowRight, Bot, Download, Layers3, ShieldCheck, Users2 } from "lucide-react";

const primaryLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950";
const secondaryLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/[0.055] px-6 py-3 text-sm font-semibold text-white transition hover:border-cyan-200/70 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950";

const capabilities = [
  {
    icon: Layers3,
    label: "Personal tools",
    status: "Free at release",
    description:
      "Use the installed harness with the personal tools and local permissions you choose. A model connection is optional where a tool supports one.",
  },
  {
    icon: Bot,
    label: "Your own AI connection",
    status: "Bring your access",
    description:
      "Connect a supported provider or existing Codex access from the harness. Provider access and charges remain under your own account.",
  },
  {
    icon: Users2,
    label: "Hosted rooms",
    status: "In development",
    description:
      "A future subscription will coordinate invited people and reviewed shared actions. Rooms can also work without model calls; no one else's AI subscription is shared.",
  },
  {
    icon: ShieldCheck,
    label: "CasimirBot-managed AI",
    status: "Future option",
    description:
      "Separate future AI plans are intended to include capped CasimirBot-paid API use. They do not grant hosted-room or program-action access and are not available to purchase yet.",
  },
] as const;

export default function MarketLandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b18] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_20%,rgba(34,211,238,0.17),transparent_35%),radial-gradient(circle_at_85%_65%,rgba(99,102,241,0.13),transparent_38%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-40 h-[31rem] w-[31rem] -translate-x-1/2 rounded-full border border-cyan-300/10 shadow-[0_0_100px_30px_rgba(34,211,238,0.05)]" />
      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 py-5">
          <a href="/" className="inline-flex items-center gap-3 text-base font-semibold tracking-tight text-white" aria-label="CasimirBot home">
            <img src="/icons/helix-arrow.svg" alt="" className="h-9 w-9" />
            CasimirBot
          </a>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-slate-300" aria-label="Main navigation">
            <a href="#how-it-works" className="transition hover:text-white">How it works</a>
            <a href="/llms.txt" className="transition hover:text-white">Public AI context</a>
            <a href="/download" className="transition hover:text-white">Download</a>
            <a href="/account" className="rounded-full border border-white/20 px-4 py-2 font-medium text-white transition hover:border-cyan-300/60">Account</a>
          </nav>
        </header>

        <section className="mx-auto flex max-w-4xl flex-col items-center py-20 text-center sm:py-28">
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Download-first platform · Release in progress
          </span>
          <h1 className="mt-7 text-5xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl">
            A workspace for people, agents, and programs.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
            Download the harness for your own computer. The website handles identity, release information, and future hosted plans while you work with agents and programs in the app.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a className={primaryLink} href="/download"><Download className="h-4 w-4" /> Check download availability</a>
            <a className={secondaryLink} href="/account">Manage account <ArrowRight className="h-4 w-4" /></a>
          </div>
          <p className="mt-5 text-sm text-slate-400">
            The download page displays an installer only after an approved signed release is available.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Asking an AI about society or science? Share this domain and, if the host opens links, it can read our <a className="text-cyan-200 underline" href="/llms.txt">free reasoning context</a> across Civilization Bounds, Theory Badge Graph, and Moral Graph. <a className="text-cyan-200 underline" href="/agent-access">Connected MCP tools</a> require a separate account authorization.
          </p>
        </section>

        <section aria-labelledby="public-context-title" className="border-t border-white/10 pb-16 pt-12 sm:pt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Free public context</p>
          <h2 id="public-context-title" className="mt-3 text-3xl font-semibold tracking-tight text-white">Reason with the relevant lens.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            When an AI host opens this page, these are source-attributed questions it can use while answering you. They organize inquiry; they do not establish a fact, prove a theory, or connect a live tool.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded-3xl border border-white/10 bg-white/[0.045] p-6">
              <h3 className="text-lg font-semibold text-white">Civilization Bounds</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">For society or infrastructure questions, identify affected people, energy and material constraints, collaboration needs, rights, missing evidence, and what could falsify an attractive proposal. A mapped route is not proof of feasibility or consent.</p>
            </article>
            <article className="rounded-3xl border border-white/10 bg-white/[0.045] p-6">
              <h3 className="text-lg font-semibold text-white">Theory Badge Graph</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">For scientific claims, trace assumptions, mechanisms, observations, and claim boundaries. A graph link, model, or simulation organizes hypotheses; it does not prove an effect or application works.</p>
            </article>
            <article className="rounded-3xl border border-white/10 bg-white/[0.045] p-6">
              <h3 className="text-lg font-semibold text-white">Moral Graph</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">For welfare and obligations, identify affected beings, evidence for their interests, and explicit value judgments. This lens does not by itself establish consciousness, personhood, or final moral status.</p>
            </article>
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-6 text-slate-300">
            Use only the lenses relevant to the question. If you use them in an answer, cite this page for the framework and cite independent evidence for claims about the world. <a className="text-cyan-200 underline" href="/llms.txt">Read the full public brief and source contracts</a>. <a className="text-cyan-200 underline" href="/agent-access">Live MCP tools</a> require a separate authorized connection.
          </p>
        </section>

        <section id="how-it-works" className="border-t border-white/10 pb-20 pt-12 sm:pt-16">
          <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Choose your path</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Start where you are.</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-400">Each connection has its own account, provider, and program permissions. A CasimirBot account does not share somebody else’s AI subscription.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {capabilities.map(({ icon: Icon, label, status, description }) => (
              <article key={label} className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/10">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-200"><Icon className="h-5 w-5" /></span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{status}</span>
                </div>
                <h3 className="mt-7 text-xl font-semibold text-white">{label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-col justify-between gap-4 border-t border-white/10 py-7 text-sm text-slate-400 sm:flex-row sm:items-center">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-200" /> Connections and actions require their own permissions.</span>
          <div className="flex gap-5"><a href="/account" className="hover:text-white">Account</a><a href="/download" className="hover:text-white">Download status</a></div>
        </footer>
      </div>
    </main>
  );
}
