import { useEffect, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Download, ExternalLink, ShieldCheck } from "lucide-react";

const minecraftPilotRelease = "https://github.com/pestypig/casimirbot-minecraft-releases/releases/tag/minecraft-1.21.8-pilot.1";
const minecraftPilotDownload = "https://github.com/pestypig/casimirbot-minecraft-releases/releases/download/minecraft-1.21.8-pilot.1";

const minecraftPilotMods = [
  {
    filename: "HelixFabricSensor-0.4.19.jar",
    sha256: "756f6fb4e380b87ce179e40e4e807931fb6a8b7c954cf2c4ca60f5b1ca1a846d",
  },
  {
    filename: "HelixFabricCompanionSpike-0.1.0-feasibility.jar",
    sha256: "018dc49434b8f896d31e7d2b05c97b6e848caff72c41ffb6722987a8a1fe585e",
  },
] as const;

const prompt = `Hey Codex, set up a contract for my CasimirBot. Use this exact task and the Helix chat I select. Inspect my personal MCP connection and current setup first. Request 24 hours and select every available purpose. Give exact scopes only where the target, owner authority, and any cost budget are verified; show the other selections as plans. Open one review in CasimirBot and wait for my approval. After I approve, complete only the covered setup steps and report what is active versus planned. Do not take an environment action, post to Discord, or make a paid model request just to test setup.`;

const purposes = [
  {
    title: "Use local Codex Full Harness",
    detail: "Lets your approved Codex connection reach the personal MCP tools in the installed app. Individual tools still check their own permissions.",
  },
  {
    title: "Pair this Codex task with one Helix chat",
    detail: "Connects the exact Codex task and selected Helix chat for Message Codex pickup and reports. Additional tasks need an explicit reviewed limit.",
  },
  {
    title: "Connect the selected room",
    detail: "Prepares membership for one named local or hosted room. It does not share every room or automatically release its messages and calls to AI.",
  },
  {
    title: "Review separate room AI consent",
    detail: "Records the plan to use room messages or voice with AI. Each exact source keeps its own participant and owner consent checks.",
  },
  {
    title: "Share approved read-only activity to Discord",
    detail: "Uses a named linked Discord destination and approved read-only Codex sources for a limited time. Selecting it alone does not start a stream.",
  },
  {
    title: "Invite Captain Keyes to a Discord voice channel",
    detail: "Names one linked Discord session, server, text and voice channel, owner-present room, and short join duration. An audio-off join and a GPT Live arm are distinct scopes. Each participant must consent before their voice can reach GPT Live.",
  },
  {
    title: "Prepare bounded Minecraft player control",
    detail: "Names the room, environment, player, actions, control mode, and duration. Game and environment authority must be verified before play.",
  },
  {
    title: "Prepare a bounded Responses API session",
    detail: "Names the provider, who pays, time limit, and maximum provider cost. It needs approved provider access and a bound native budget before calls.",
  },
] as const;

const shots = {
  account: "/images/getting-started/account.png",
  accountSignedIn: "/images/getting-started/account-signed-in.png",
  download: "/images/getting-started/download.png",
  desktop: "/images/getting-started/desktop-account.jpg",
  approvedDevice: "/images/getting-started/account-device-approved.png",
  contractPurposes: "/images/getting-started/contract-purposes.png",
  contractApproval: "/images/getting-started/contract-approval.png",
  codexTheoryRead: "/images/getting-started/codex-theory-read.png",
  floatTwoChats: "/images/getting-started/float-two-chats.png",
  openAiKeyEntry: "/images/getting-started/openai-key-entry.png",
  openAiKeyForm: "/images/getting-started/openai-key-form.png",
} as const;

function Screenshot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return <figure className="overflow-hidden rounded-2xl border border-white/15 bg-slate-900">
    <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`Open full-size screenshot: ${alt}`}>
      <img src={src} alt={alt} className="h-auto w-full" loading="lazy" />
    </a>
    <figcaption className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-slate-400">{caption}</figcaption>
  </figure>;
}

function Step({ number, title, children, image }: {
  number: number; title: string; children: ReactNode; image?: ReactNode;
}) {
  return <section id={`step-${number}`} className="scroll-mt-8 border-t border-white/10 py-10 sm:py-14">
    <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Step {number}</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
        <div className="mt-5 space-y-4 text-sm leading-7 text-slate-300">{children}</div>
      </div>
      {image ? <div>{image}</div> : null}
    </div>
  </section>;
}

export default function GettingStartedPage() {
  useEffect(() => {
    // The standalone site mounts after the browser's initial fragment lookup.
    let sectionId: string;
    try {
      sectionId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ block: "start" });
  }, []);

  return <main className="min-h-screen bg-[#050b18] text-slate-100">
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 py-5">
        <a href="/" className="inline-flex items-center gap-3 font-semibold text-white"><img src="/icons/helix-arrow.svg" alt="" className="h-9 w-9" />CasimirBot</a>
        <nav aria-label="Guide navigation" className="flex flex-wrap gap-5 text-sm text-slate-300">
          <a href="#friends-and-shared-chats" className="hover:text-white">Friends</a>
          <a href="#minecraft-companion-with-friends" className="hover:text-white">Minecraft Companion</a>
          <a href="/download" className="hover:text-white">Download</a>
          <a href="https://github.com/pestypig/casimirbot-platform-overview#open-source-and-the-private-platform-repository" className="hover:text-white">Open source</a>
          <a href="/account" className="hover:text-white">Account</a>
          <a href="/agent-access" className="hover:text-white">Agent access</a>
        </nav>
      </header>

      <div className="max-w-4xl py-14 sm:py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100"><ShieldCheck className="h-4 w-4" /> Windows alpha guide</span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">How to get started with CasimirBot</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">Create your account, install the signed Windows app, connect your own Codex, then review one setup contract for the tools you want it to use.</p>
        <p className="mt-4 text-sm leading-7 text-slate-400">This is the personal harness path. Your Codex access and any API keys you choose to add are billed by their providers. CasimirBot AI subscriptions, when publicly offered, are a separate bounded no-key option; they do not grant agent or program permissions.</p>
        <p className="mt-2 text-xs leading-6 text-slate-500">Screenshots use a test account. Private details and browser debugging banners are obscured; confirm current release details on the live download page.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/account" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200">Create account <ArrowRight className="h-4 w-4" /></a>
          <a href="/download" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white hover:border-cyan-200"><Download className="h-4 w-4" /> Get the app</a>
        </div>
      </div>

      <Step number={1} title="Create and verify your account" image={
        <div className="space-y-4">
          <Screenshot
            src={shots.account}
            alt="CasimirBot account page in Chrome with the browser address bar and Create account button visible"
            caption="Start at casimirbot.com/account. The browser address bar is included so you can recognize the page."
          />
          <Screenshot
            src={shots.accountSignedIn}
            alt="CasimirBot account page after sign-in, showing an ordinary User account; the email is obscured"
            caption="After sign-in, confirm the site shows your account as signed in. The example email is obscured."
          />
        </div>
      }>
        <p>Open <a className="text-cyan-200 underline" href="/account">CasimirBot Account</a> and choose <strong className="text-white">Create account</strong>. Use email or a supported sign-in option, then complete the password and email-verification prompts yourself. Check spam if the verification email does not appear in your inbox. The installed app should show your email as verified before you request computer approval; if it still shows the earlier status after you verified, sign out and sign in again to refresh it. Keep codes and recovery details private.</p>
        <p>For local Codex access, the account may ask you to enroll a CasimirBot authenticator. Scan the current setup QR code into a new authenticator entry, save its recovery codes, and finish setup. The enrollment request expires after 10 minutes. If it expires, restart setup and scan the new QR; a code from an older Auth0 or CasimirBot entry will not confirm it.</p>
        <p>If the Auth0 sign-in page keeps loading, wait for a clear result before retrying. A slow return alone does not mean your new password is wrong. Use a fresh sign-in page if the browser session expires, and reset the password only when Auth0 explicitly rejects it or you no longer know it.</p>
      </Step>

      <Step number={2} title="Download and open the signed app" image={<Screenshot src={shots.download} alt="CasimirBot signed download page in Chrome showing the release version, publisher, and download control" caption="Check the live download page for the current approved installer, publisher, and SHA-256." />}>
        <p>Use the <a className="text-cyan-200 underline" href="/download">download page</a> to get the approved Windows x64 installer. Check that it shows a release and signed publisher before installing. Run the installer and open CasimirBot.</p>
        <p>The download page is the public source for the current installer. Later signed updates appear in the app’s Desktop Updates panel.</p>
      </Step>

      <Step number={3} title="Sign in and approve this computer" image={<div className="space-y-4">
        <Screenshot src={shots.desktop} alt="Installed CasimirBot Account and Sessions panel showing website connection and Sign in with Auth0" caption="Start in the installed app’s Account & Sessions panel. This capture uses a separate test profile; sign in with your own website account." />
        <Screenshot src={shots.approvedDevice} alt="CasimirBot account page in Chrome showing an active authenticator and a connected installation with its fingerprint obscured" caption="The website lists the connected installation after approval. Managed text permission was optional in this test; it does not create a funded AI allowance." />
      </div>}>
        <p>In the installed app, open <strong className="text-white">Account &amp; Sessions</strong> and sign in with the same CasimirBot account. Choose <strong className="text-white">Connect in browser</strong>, check the account and computer shown, and approve the installation yourself. If that short-lived request expires, start a new one in the app.</p>
        <p>Enroll your authenticator on the website if it is not active, then choose <strong className="text-white">Approve this computer</strong> in the app. Review the browser request, enter a fresh CasimirBot authenticator code yourself, and return to the app to check approval.</p>
        <p>Choose <strong className="text-white">Connect Codex locally</strong>. Review the displayed scopes in the browser and approve them with a fresh code. The app should say Codex local access is configured. This connection is free to set up; Codex and any provider account still have their own costs.</p>
      </Step>

      <Step number={4} title="Ask Codex to prepare one setup contract" image={<div className="space-y-4">
        <Screenshot src={shots.contractPurposes} alt="Installed CasimirBot contract showing selected purposes, with plans and exact scopes distinguished" caption="This early review shows the selected purposes. Room, Discord, Minecraft, and Responses entries need verified targets or budgets before they receive exact scope." />
        <Screenshot src={shots.contractApproval} alt="Bottom of the CasimirBot contract explaining the scope boundary and showing the Approve exact scopes and save plan button" caption="Read the exact scope and consent explanation at the bottom, then approve the review in the installed app yourself." />
      </div>}>
        <p>The easiest starting point is to ask Codex: <strong className="text-white">“Hey Codex, set up a contract for my CasimirBot.”</strong> Open the task you want to use and tell it which Helix chat to pair. The task must have the CasimirBot personal MCP tools available. If this chat has a stale tool list, reconnect local Codex access in the app. If Codex needs a restart to reload its tools, return to this same chat afterward and ask it to recover the existing pairing before preparing another approval.</p>
        <p>For one 24-hour review with every available box selected, copy this fuller request:</p>
        <pre className="whitespace-pre-wrap rounded-2xl border border-cyan-300/20 bg-slate-950 p-4 text-xs leading-6 text-slate-200">{prompt}</pre>
        <p>In CasimirBot <strong className="text-white">Agent Access</strong>, inspect the prepared contract. The setup eligibility can last up to 24 hours; device, pairing, room, Discord, and provider grants have their own checks and expiry times. Selecting every box is a convenient way to save your intended setup, but a purpose without a verified target, authority, or cost budget remains a plan. A Discord voice invitation needs the exact linked server, channels, and room before its checkbox can authorize a join. Approve only the exact scopes you want.</p>
      </Step>

      <section className="border-t border-white/10 py-10 sm:py-14" aria-labelledby="contract-purposes-heading">
        <h2 id="contract-purposes-heading" className="text-2xl font-semibold text-white">What the contract boxes mean</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">CasimirBot shows the exact account, installation, Codex task, Helix chat, duration, and bound scopes before you approve. A checked purpose can be a plan; only its listed exact scope and separate current grants permit use.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {purposes.map(purpose => <article key={purpose.title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <h3 className="font-semibold text-white">{purpose.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{purpose.detail}</p>
          </article>)}
        </div>
      </section>

      <Step number={5} title="Use the approved abilities" image={<div className="space-y-4">
        <Screenshot src={shots.codexTheoryRead} alt="Codex chat showing a real read-only CasimirBot theory-directory result about exponential decay" caption="A concrete Full Harness example: Codex reads a theory entry through CasimirBot Personal and explains what it found. This call did not run a calculation or spend a managed-AI allowance." />
        <Screenshot src={shots.floatTwoChats} alt="CasimirBot Message Codex beside Chrome with Float Activity over the browser, showing two separately labeled fictional Codex chats" caption="Two approved guide chats appear together in Float Activity over Chrome. The installed app keeps the selected chat’s dialogue and controls in Message Codex. This screenshot uses fictional conversation and a test profile." />
      </div>}>
        <p>After approval, ask the same Codex task to report which connection and pairing steps are active. You can ask it to inspect personal tools or a theory reflection directory with a read-only call. Pairing to a Helix chat needs that exact chat and task; sending to Discord needs a linked destination and an explicit sharing source.</p>
        <p>In CasimirBot, <strong className="text-white">Message Codex</strong> shows the selected task’s visible conversation and delivery reports when its pairing and local reader are current. <strong className="text-white">Float Message Codex reports</strong> keeps that view over your workspace. <strong className="text-white">Float activity</strong> can combine your Cloud Agent DM, owner-readable saved Codex chats, and verified Adapter AI runs. It labels each source so activity from two chats is not presented as one dialogue. Add each extra chat as an approved read source before expecting it in the float; the 24-hour contract does not make every Codex chat readable.</p>
        <p>For a side-by-side view, resize the CasimirBot window and keep <strong className="text-white">Float activity</strong> over your browser or another app. Set its source to <strong className="text-white">All</strong> to see separately labeled activity from the chats you have authorized. In CasimirBot, use the <strong className="text-white">Saved Codex chats</strong> selector to read one conversation and choose where Message Codex queues a new request. The float is a cross-window activity view; the selected conversation remains the place to inspect its full dialogue and controls.</p>
        <p>Try one of these requests after the task reports an active binding:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>“List the CasimirBot tools this task can use and show one read-only result.”</li>
          <li>“Inspect the theory reflection directory and explain one available comparison.”</li>
          <li>“Show me the linked Discord destinations and prepare a synthetic sharing test for my review.”</li>
        </ul>
        <p>Room participation, audio release, Minecraft controls, environment actions, and Responses calls each retain their own owner, participant, provider, and budget checks. A contract helps complete setup; it does not replace those checks.</p>
        <p>Stop sharing or revoke a setup intent in the app when you are done. A later signed update may preserve a still-valid reviewed setup, but reconnect if the app reports a closed connection.</p>
      </Step>

      <section id="friends-and-shared-chats" className="scroll-mt-8 border-t border-white/10 py-12">
        <h2 className="text-2xl font-semibold text-white">Friends and shared chats</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300"><strong>Alpha workflow:</strong> use desktop 0.1.0-alpha.85 or later and check your account’s available controls. Friend messages, emoji, quantum stickers, and paired Codex stream sharing have passed two-profile checks. Hosted Agent API continuation remains a separate access and model-funding path; following a friend does not start it.</p>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-300">
          <li>Open <strong>Friends &amp; Voice Parties</strong> in CasimirBot. Choose a handle, search for your friend’s exact handle, and send a friend request. Your friend accepts it in <strong>Received requests</strong>.</li>
          <li>Check the signed-in handle, then choose your friend in <strong>Friends chat board</strong>. Type a message, including ordinary emoji if you like, and choose <strong>Send message</strong>. Reopen that conversation to find its saved messages.</li>
          <li>For a quantum sticker, keep the Physics Glyph workspace connected while your chat completes a composition. In builds with <strong>Prepare Friends sticker</strong>, use that action before leaving the workspace. After preparation succeeds, return to your friend conversation, open <strong>Emoji &amp; artifacts</strong>, select the result, then send it. Preparation alone sends no message. Verification checks the saved artifact; the scientific details still identify any unknowns or unsupported claims.</li>
          <li>Either friend can reveal the next step of a sent sticker; its slide position is shared. Choose <strong>Open independent workspace copy</strong> to explore separately. <strong>Send context to my paired chat</strong> explicitly imports that copy’s context into your own paired chat. The copy and context carry no sender credentials or game permissions.</li>
          <li>In <strong>Shared chats</strong>, choose a source and an audience. You can share with all accepted friends, selected friends, or members of one hosted room. With <strong>Selected friends</strong>, select at least one accepted friend before applying the share. Check the active sharing status to confirm the applied audience. For a Codex source, open the exact chat in Codex Desktop and approve exact-chat read in CasimirBot. Start sharing, or use <strong>Share selected text</strong> to send one specific update.</li>
          <li>To receive updates as context, open your paired Helix chat and select <strong>Use current paired Codex chat</strong>. On the sender’s card, select <strong>Add to my chat</strong> for one update or <strong>Follow in this chat</strong> for future updates. Ask that same Codex chat to read the latest friend update. Following does not start a reply.</li>
          <li>Have the receiving chat confirm the sender and a unique marker from a harmless test update, then acknowledge that exact update. A follow badge alone does not show that the receiving chat has read it. Publishing and receiving are separate choices on each account; repeat those choices on the other account to test the opposite direction.</li>
          <li>For an existing Agent API run owned by your account, enter its run ID and choose <strong>Select API run</strong> as the receive destination. Context is available to an explicitly authorized continuation or context import. Hosted run creation and continuation currently require developer access; they are not enabled for ordinary accounts. Use your paired Codex chat for the ordinary-account path. Following does not start or fund an API run.</li>
          <li>Choose <strong>Stop sharing</strong> when finished. If the sender starts sharing again or applies a changed audience with <strong>Switch shared chat</strong>, the recipient must choose <strong>Follow in this chat</strong> again to resume delivery into their selected chat. Seeing a new preview does not mean the old follow still receives it. Source access, pairing, friendship and room membership must remain valid for delivery. Stopping delivery does not erase context or messages that your friend already saved.</li>
          <li>In pilot versions that offer participant withdrawal, open the selected hosted room in your browser, choose <strong>Leave room</strong>, and review <strong>Confirm leave room</strong>. This ends your room membership and room-scoped updates. Rejoining requires a fresh owner invite; a follow removed after withdrawal must be selected again. Previously imported messages remain in their destination chats. This participant control does not close the owner’s room.</li>
        </ol>
        <details className="mt-5 max-w-3xl text-sm leading-7 text-slate-300"><summary className="cursor-pointer font-semibold text-white">If an update does not arrive</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li><strong>Friends connection:</strong> if the panel says your account is signed in but Friends needs to connect, choose <strong>Connect Friends &amp; Parties</strong> and complete browser authorization with the same account. Return to the installed panel and confirm its signed-in handle and connected Friends status before retrying pickup in the existing paired chat. A browser completion page alone does not confirm which installation received the sign-in. If authorization times out, start a fresh connection from the intended app window; do not reuse the expired browser page. This service connection is separate from chat pairing. If a retained conversation only shows the connection error, reopen the Friends panel to reach its reconnect control.</li>
            <li><strong>Source access:</strong> open the exact Codex source chat, review its read grant in CasimirBot, then start sharing again.</li>
            <li><strong>Room audience:</strong> the owner checks the hosted room roster and sends its invitation if needed. Accepting a friend request does not join a room.</li>
            <li><strong>Receive destination:</strong> open the intended Helix chat, recover its existing pairing through the same Codex chat, then select the paired destination again. Review a new finite approval only if the app reports that the old approval is no longer valid.</li>
            <li><strong>Publishing session:</strong> if the panel says the session is no longer current, check the source and audience and choose <strong>Start sharing</strong> again.</li>
            <li><strong>Sticker preparation:</strong> reconnect the Physics Glyph workspace, complete a fresh composition if it changed, and prepare the sticker there before opening Friends.</li>
          </ul>
        </details>
      </section>

      <section id="minecraft-companion-with-friends" className="scroll-mt-8 border-t border-white/10 py-12">
        <h2 className="text-2xl font-semibold text-white">Minecraft Companion with friends</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">The hosted Discord and Minecraft Companion workflow remains a pilot. The sensor and Companion mods below have passed clean dedicated-server startup and restart together. Live game actions and delivery into GPT Live still need an attended check; these downloads do not claim a finished Companion workflow.</p>
        <div className="mt-5 max-w-3xl rounded-2xl border border-white/15 bg-slate-900 p-4 sm:p-5">
          <h3 className="font-semibold text-white">Download the pilot mods</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">Download the individual JARs below, or get the <a className="text-cyan-200 underline" href={`${minecraftPilotDownload}/CasimirBot-Minecraft-1.21.8-pilot.1.zip`}>complete pilot bundle</a> with installation instructions, checksums, license and notices. Read the <a className="text-cyan-200 underline" href={minecraftPilotRelease}>release notes and compatibility limits</a> before installing. Keep the license and notices with your download.</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Minecraft Java <strong>1.21.8</strong>, Java <strong>21</strong>, Fabric Loader <strong>0.18.4 or newer</strong> (tested: 0.18.4), and Fabric API <strong>0.136.1+1.21.8</strong>. Download Fabric and Fabric API separately using the official links below.</p>
          <dl className="mt-4 space-y-4">
            {minecraftPilotMods.map((mod) => <div key={mod.filename}>
              <dt className="break-all font-mono text-sm text-cyan-200"><a className="underline" href={`${minecraftPilotDownload}/${mod.filename}`}>{mod.filename}</a></dt>
              <dd className="mt-1 text-xs text-slate-300"><span className="font-medium">SHA-256: </span><code className="break-all select-all">{mod.sha256}</code></dd>
            </div>)}
          </dl>
        </div>
        <details className="mt-5 max-w-3xl rounded-2xl border border-white/15 bg-slate-900 p-4 sm:p-5">
          <summary className="cursor-pointer font-semibold text-white">Optional pilot: host an existing world with Essential</summary>
          <p className="mt-3 text-sm leading-7 text-slate-300">This route uses the host player's single-player world in place of the dedicated-server startup below. A private rehearsal verified two clients joining one world and fresh local sensor observations with an existing mod pack. That check does not qualify the downloadable bundle or delivery into GPT Live. Back up the world before changing its mods, and keep the host's working installation.</p>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-300">
            <li>Prepare both clients for the same Minecraft and Fabric versions with matching compatible mods, including Essential. Follow Essential's <a className="text-cyan-200 underline" href="https://essential.gg/wiki/start-hosting">official hosting guide</a>. Use each installation's own <code>mods</code> folder.</li>
            <li>For two clients on one computer, give the guest installation a separate game directory. Copy only the required mod JARs; sign in separately and leave the host's saves, account files, and CasimirBot pairing credentials in the host installation. Check each client's Java player name before inviting. A launcher account label alone does not verify that name.</li>
            <li>Check memory before starting either client and again before starting the second. Allow room for both games, the host's integrated server, Discord, and CasimirBot. If the computer cannot sustain both clients, use another computer for the guest. A maximum Java heap setting is not a measurement of available memory.</li>
            <li>Load the host's selected world from <strong>Singleplayer</strong> first. In the world, open the pause menu and use Essential's <strong>Invite</strong> control. Select only the intended friend and check for any previously selected invitees. The guest opens <strong>Social</strong>, selects the host and chooses <strong>Join Game</strong>, or accepts the invitation. See the <a className="text-cyan-200 underline" href="https://essential.gg/wiki/play-together">official join instructions</a>. Confirm both Java player names are present in the same world.</li>
          </ol>
          <p className="mt-3 text-sm leading-7 text-slate-300">After joining, continue below with Shared Live Rooms, adapter pairing, and each participant's consent. An Essential invitation does not join a CasimirBot room or authorize GPT Live. Two accounts operated by one person do not establish a two-person consent check.</p>
        </details>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">For Java setup on Windows, follow Fabric’s <a className="text-cyan-200 underline" href="https://docs.fabricmc.net/1.21.11/players/installing-java/windows">Java 21 installation guide</a>. Keep Minecraft at the tested 1.21.8 version below.</p>
        <ol className="mt-4 max-w-3xl list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-300">
          <li>Use an empty server folder and Java 21. Choose Minecraft Java <strong>1.21.8</strong> and Fabric Loader <strong>0.18.4</strong> in the <a className="text-cyan-200 underline" href="https://fabricmc.net/use/server/">official Fabric server launcher</a>. Loader 0.18.4 is the tested baseline; a newer loader must meet the supplied mod’s compatibility requirements. Put <code>fabric-api-0.136.1+1.21.8.jar</code> from the <a className="text-cyan-200 underline" href="https://modrinth.com/mod/fabric-api/version/0.136.1%2B1.21.8">matching Fabric API release</a> and the supplied CasimirBot mod JARs in that server folder’s <code>mods</code> directory. Do not put source JARs there or keep two versions of the same mod.</li>
          <li>Compare each supplied JAR’s SHA-256 with the values above before starting the server. On Windows, run <code className="break-all">Get-FileHash -Algorithm SHA256 .\mods\HelixFabricSensor-0.4.19.jar</code> and repeat for <code className="break-all">HelixFabricCompanionSpike-0.1.0-feasibility.jar</code>. Rename the downloaded Fabric server launcher to <code>fabric-server-launch.jar</code>, or substitute its actual filename in the command below. Keep that launcher in the server folder, outside <code>mods</code>. Check <code>java -version</code>, then run <code>java -Xms1G -Xmx2G -jar fabric-server-launch.jar nogui</code> from the server folder. Review the Minecraft EULA linked in the generated <code>eula.txt</code> and accept it there only if you agree. Start again and wait for the server’s ready message. Check its log for the expected Minecraft, Loader, API and CasimirBot mod versions.</li>
          <li>Prepare each player’s client too. Use the <a className="text-cyan-200 underline" href="https://fabricmc.net/use/installer/">official Fabric client installer</a> for Minecraft 1.21.8 and the matching loader. Put the same Fabric API, sensor and Companion JARs in that launcher profile’s game directory under <code>mods</code>. Keep the client and server versions aligned. These client steps still need the attended pilot check; the clean-server test does not qualify the client installation.</li>
          <li>Enable Shared Live Rooms on both accounts. Open your friend’s conversation and choose <strong>Open hosted room controls</strong>. Open the hosted room and have your friend join using its invitation. Confirm both players appear in the room before choosing a task or connecting audio.</li>
          <li>Keep room presence current for each account: in <strong>Hosted service rooms</strong>, select the room and choose <strong>Open selected room in browser</strong>. Sign in with that same account, enable Shared Live Rooms for the website session if needed, and click <strong>Open selected room</strong>. Leave the page open. The owner should see <strong>Owner present on domain</strong>; a friend should see <strong>Member present on domain</strong>. Two accounts on one computer need separate browser sessions.</li>
          <li>With the world loaded and running, review the read-only source scope for that exact world and hosted room, then stage the short-lived sensor pairing. Verify that the sensor claimed it and that the selected hosted source has a fresh observation before continuing. A local sensor reading alone does not prove delivery to the hosted room or GPT Live. Keep the pairing packet private.</li>
          <li>Each player reviews their own game-observation release. In that player’s Minecraft client, <code>/helixshare-client allow voice 1</code> requests one hour of sharing with GPT Live. Read the returned room, world and expiry; enter <code>/helixshare-client confirm</code> yourself only if they match. Wait for the hosted acceptance message. A pending request is not active sharing. Use <code>/helixshare-client off voice</code> to request revocation and check that it is confirmed. If the source is disconnected, remote sharing may remain active until revocation arrives or the grant expires. Sharing with paired Codex uses the separate <code>codex</code> audience. These observation releases do not grant game actions or replace Discord audio consent.</li>
          <li>Join the same Discord call. The host starts GPT Live and chooses <strong>Connect Discord call to GPT Live</strong> after each participant grants the required audio consent. Under <strong>Minecraft context for this call</strong>, choose <strong>Load this room’s sources</strong>, then select the exact world. While that session and source remain valid, fresh game observations refresh automatically. Selecting context grants read access only; game actions require their own approval.</li>
          <li>In Friend Chat, choose <strong>Review hosted room mission</strong> and enter the room ID. Review the paired task, exact world, actor, action, and expiry before the world owner approves an action. A friend message or imported stream update alone cannot approve a game action.</li>
          <li>Start with a terrain observation. For a movement test, approve a short move to a marked waypoint and check the adapter’s reported position. Use <strong>Load shared reports</strong> in the room mission to view the result the owner shared with the room. Report reading requires both you and the owner to be present; room membership alone is not enough. An empty report list means no report is currently shared, not that an action succeeded.</li>
        </ol>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300">If game context stops arriving, check the sensor’s latest observation, the selected room and world, and the Discord bridge status. Reconnect GPT Live and select the source again if its session changed. After a world change, verify and select the new source before continuing.</p>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">Explore the <a className="text-cyan-200 underline" href="https://github.com/pestypig/casimirbot-minecraft-fabric-core-source-preview">Minecraft Fabric/core source preview</a> for selected implementation files and their license. It is not a complete independently buildable mod kit. Use the versioned pilot downloads above for installation.</p>
      </section>

      <section className="border-t border-white/10 py-12">
        <h2 className="text-2xl font-semibold text-white">Free setup and included-use subscriptions</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">For the personal GPT Live path, open the three-dot connection menu in the installed app, then add an OpenAI API key with Realtime access. The examples below show the location and the empty form; never include a key in a screenshot or Codex chat.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Screenshot src={shots.openAiKeyEntry} alt="CasimirBot three-dot connection control highlighted by the pointer with Helix Console connections open" caption="Open the three-dot control at the upper right of Helix Ask. It opens Helix Console connections." />
          <Screenshot src={shots.openAiKeyForm} alt="Empty OpenAI API key field in CasimirBot Helix Console connections" caption="Paste your key into this field privately and save it. This example was captured before any key was entered." />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.055] p-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><CheckCircle2 className="h-5 w-5 text-cyan-200" /> Free personal path</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">Use your CasimirBot account and your own Codex connection for the personal harness. No CasimirBot API key is needed to pair that local connection. For Cloud Agent DM and GPT Live, open the app’s connection settings and add your own provider key. GPT Live needs an OpenAI key with Realtime access before its Live runtime can start. Never paste keys into a chat or setup contract. Your provider bills that usage.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
            <h3 className="text-lg font-semibold text-white">Included-use plan, when available</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">A separate CasimirBot AI plan is intended to fund bounded text requests without your own OpenAI API key. When enrollment launches, the account page will show the offer and remaining allowance. Link the installation to that account and choose managed text permission when you want this path. The current managed-text plan does not fund GPT Live or Cloud Agent DM. At present, checkout and managed text are private tests; this guide does not offer a public purchase. A plan never substitutes for account, device, task, room, or program approval.</p>
          </article>
        </div>
        <p className="mt-6 text-sm text-slate-400">Need connection details? <a className="inline-flex items-center gap-1 text-cyan-200 underline" href="/agent-access">Open Agent Access <ExternalLink className="h-3 w-3" /></a>.</p>
      </section>
    </div>
  </main>;
}
