import React from "react";

export default function InfoDot({
  title,
  text,
  className = "",
}: { title?: string; text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center align-middle ml-2 ${className}`}>
      <span
        className="relative group cursor-help"
        aria-label={title || "info"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24"
             className="text-slate-300 group-hover:text-slate-100 transition">
          <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.18"/>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <text x="12" y="16" textAnchor="middle" fontSize="12" fill="currentColor">i</text>
        </svg>
        {/* Tooltip */}
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50">
          <div className="inline-block max-w-[22rem] whitespace-normal break-words rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 shadow-lg">
            {text}
          </div>
        </span>
      </span>
    </span>
  );
}
