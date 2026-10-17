import React, { useEffect, useState } from "react";

export default function ConnectionExpiryNotice({ deadline, label, recovery }: {
  deadline: string;
  label: string;
  recovery: string;
}) {
  const [now, setNow] = useState(Date.now);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { setDismissed(false); setNow(Date.now()); }, [deadline]);
  const expires = Date.parse(deadline);
  if (!Number.isFinite(expires)) return null;
  const seconds = Math.max(0, Math.ceil((expires - now) / 1000));
  return <div className="mt-3 rounded border border-amber-300/30 p-3 text-xs">
    <p>{label}: {seconds > 0
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining (local clock estimate)`
      : "expiry time reached; server status must be rechecked"}.</p>
    {seconds === 0 && !dismissed ? <div role="alert" className="mt-2 rounded bg-amber-950 p-3 text-amber-50">
      <p>{recovery}</p>
      <p>No app restart is needed. This notice does not renew or grant permission.</p>
      <button type="button" onClick={() => setDismissed(true)} className="mt-2 rounded border px-3 py-1">Dismiss expiry notice</button>
    </div> : null}
  </div>;
}
