
import React from 'react';

export default function CanvasFallback(props: {
  title?: string;
  reason?: string;
  onRetry?: () => void;
}) {
  const { title = 'WebGL Not Available', reason, onRetry } = props;
  const openExternal = () => window.open(window.location.href, '_blank', 'noopener,noreferrer');
  const testWebGL = () => window.open('https://get.webgl.org/', '_blank', 'noopener,noreferrer');
  const retry = () => onRetry?.() ?? window.location.reload();

  return (
    <div className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <h3 className="text-base font-semibold text-amber-900">{title}</h3>
      <p className="mt-2 text-sm text-amber-800">
        Your current browser environment isn't allowing WebGL to start.
        {reason ? <> <b>Reason:</b> {reason}.</> : null}
      </p>
      <ul className="mt-3 ml-5 list-disc text-sm text-amber-800 space-y-1">
        <li>Open this preview in your system browser (not an embedded preview).</li>
        <li>Enable hardware acceleration in your browser settings.</li>
        <li>Try another browser (Chrome / Firefox / Edge).</li>
        <li>Visit <code>chrome://gpu</code> (or <code>edge://gpu</code>) to check driver status.</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={openExternal} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">
          Open in browser
        </button>
        <button onClick={testWebGL} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm">
          Test WebGL
        </button>
        <button onClick={retry} className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-sm">
          Try again
        </button>
      </div>
      <p className="mt-2 text-xs text-amber-700">
        Tip: add <code>?no-gl=1</code> to the URL to force this fallback for testing.
      </p>
    </div>
  );
}
