import React from "react";
import type { CivilizationProvisioningLensV1 } from "@shared/civilization-provisioning-network";
import { CIVILIZATION_LENS_OPTIONS } from "./civilizationLensModel";

export function CivilizationLensControls({
  value,
  onChange,
}: {
  value: CivilizationProvisioningLensV1;
  onChange: (value: CivilizationProvisioningLensV1) => void;
}) {
  return (
    <label className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-md border border-white/15 bg-black/80 px-2 py-1.5 text-[11px] text-slate-300 shadow-lg backdrop-blur">
      <span>Evidence lens</span>
      <select
        aria-label="Civilization evidence lens"
        value={value}
        onChange={(event) => onChange(event.target.value as CivilizationProvisioningLensV1)}
        className="h-7 rounded border border-white/15 bg-[#0a1714] px-2 text-[11px] text-white outline-none focus:border-emerald-300"
      >
        {CIVILIZATION_LENS_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
