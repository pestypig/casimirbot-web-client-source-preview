import { panelRegistry } from "@/lib/desktop/panelRegistry";
import { HELIX_PANELS } from "@/pages/helix-core.panels";

const helixPanelIds = new Set(HELIX_PANELS.map((panel) => panel.id));

export default function EndpointsPanel() {
  const helixEndpoints = Array.from(
    new Set(HELIX_PANELS.flatMap((panel) => panel.endpoints ?? []))
  ).sort();
  const nonHelixPanels = panelRegistry.filter((panel) => !helixPanelIds.has(panel.id));

  return (
    <div className="w-full h-full overflow-auto p-5 space-y-6 bg-slate-950/40 text-slate-100">
      <section>
        <h2 className="font-semibold mb-2 text-cyan-300 tracking-wide uppercase text-xs">
          Helix Core Panels
        </h2>
        <ul className="text-sm list-disc pl-5 space-y-2 marker:text-cyan-500">
          {HELIX_PANELS.map((panel) => (
            <li key={panel.id}>
              <strong className="text-slate-50">{panel.title}</strong>{" "}
              <span className="text-slate-400 text-xs uppercase tracking-wide">
                ({panel.id})
              </span>
              {panel.endpoints?.length ? (
                <ul className="list-[circle] pl-5 mt-1 space-y-1 marker:text-blue-400">
                  {panel.endpoints.map((endpoint) => (
                    <li key={endpoint} className="text-slate-400 text-xs">
                      {endpoint}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {nonHelixPanels.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2 text-cyan-300 tracking-wide uppercase text-xs">
            Desktop Shell Panels
          </h2>
          <ul className="text-sm list-disc pl-5 space-y-2 marker:text-cyan-500">
            {nonHelixPanels.map((panel) => (
              <li key={panel.id}>
                <strong className="text-slate-50">{panel.title}</strong>{" "}
                <span className="text-slate-400 text-xs uppercase tracking-wide">
                  ({panel.id})
                </span>
                {panel.endpoints?.length ? (
                  <ul className="list-[circle] pl-5 mt-1 space-y-1 marker:text-blue-400">
                    {panel.endpoints.map((endpoint) => (
                      <li key={endpoint} className="text-slate-400 text-xs">
                        {endpoint}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-2 text-cyan-300 tracking-wide uppercase text-xs">
          Helix API Endpoints
        </h2>
        <ul className="text-sm list-disc pl-5 space-y-1 marker:text-cyan-500">
          {helixEndpoints.map((endpoint) => (
            <li key={endpoint} className="text-slate-400 text-xs">
              {endpoint}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
