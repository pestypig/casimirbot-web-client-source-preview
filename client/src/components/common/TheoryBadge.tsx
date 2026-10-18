import React from "react";
import { openDocPanel } from "@/lib/docs/openDocPanel";

type TheoryBadgeProps = {
  /** Digest ids, e.g., ["ford-roman-qi-1995"] */
  refs: string[];
  /** Category jump target in docs/papers.md (id is case-sensitive) */
  categoryAnchor?: string;
  /** Optional: override base path for docs (default: "/docs") */
  docsBaseHref?: string;
  /** Optional accessible label override */
  ariaLabel?: string;
};

export const TheoryBadge: React.FC<TheoryBadgeProps> = ({
  refs,
  categoryAnchor,
  docsBaseHref = "/docs",
  ariaLabel,
}) => {
  const [open, setOpen] = React.useState(false);
  const normalizedBase = React.useMemo(() => docsBaseHref.replace(/\/$/, "") || "/docs", [docsBaseHref]);
  const categoryHref = categoryAnchor
    ? `${normalizedBase}/papers.md#${encodeURIComponent(categoryAnchor)}`
    : undefined;

  const toggle = (event: React.MouseEvent) => {
    event.preventDefault();
    setOpen((state) => !state);
  };

  const handleCategoryClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (categoryHref) {
      openDocPanel(categoryHref);
    }
  };

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((state) => !state);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div style={wrapperStyle}>
      {categoryHref ? (
        <button
          type="button"
          onClick={handleCategoryClick}
          style={buttonStyle}
          aria-label={ariaLabel ?? `Open ${categoryAnchor}`}
          title="Open theory category"
        >
          ?
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          onKeyDown={handleKey}
          aria-expanded={open}
          aria-label={ariaLabel ?? "Open theory context"}
          title="Theory context"
          style={buttonStyle}
        >
          ?
        </button>
      )}

      {open && (
        <div role="dialog" aria-label="Theory digests" style={popoverStyle}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Digests</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {refs.map((id) => {
              const href = `${normalizedBase}/papers/${id}.md`;
              return (
                <li key={id} style={{ margin: "2px 0" }}>
                  <button type="button" onClick={() => openDocPanel(href)} style={linkButtonStyle}>
                    {id}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

const wrapperStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  position: "relative",
};

const sharedLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  width: 18,
  height: 18,
  borderRadius: 9,
  border: "1px solid currentColor",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontSize: 11,
  lineHeight: "18px",
  userSelect: "none",
};

const buttonStyle: React.CSSProperties = {
  ...sharedLabelStyle,
  cursor: "pointer",
  background: "transparent",
};

const popoverStyle: React.CSSProperties = {
  position: "absolute",
  zIndex: 9999,
  top: "100%",
  left: 0,
  marginTop: 6,
  padding: 8,
  background: "var(--theory-bg, #121212)",
  color: "var(--theory-fg, #f5f5f5)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 6,
  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
  minWidth: 220,
};

const anchorStyle: React.CSSProperties = {
  textDecoration: "underline",
};

const linkButtonStyle: React.CSSProperties = {
  ...anchorStyle,
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  padding: 0,
  font: "inherit",
};
