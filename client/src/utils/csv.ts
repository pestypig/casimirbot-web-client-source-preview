import type { VacuumGapSweepRow } from "@shared/schema";

const HEADER = [
  "d_nm",
  "m",
  "Omega_GHz",
  "phi_deg",
  "detune_MHz",
  "kappa_MHz",
  "kappaEff_MHz",
  "rho_g_over_gth",
  "status",
  "G_dB",
  "QL",
  "stable",
  "dB_squeeze",
  "deltaU_cycle_J",
  "noiseTemp_K",
  "plateau_width_deg",
  "bias_phi_deg",
  "negEnergyProxy",
  "notes",
];

export function rowsToCSV(rows: VacuumGapSweepRow[]): string {
  const lines = rows.map((row) => {
    const plateau = row.plateau;
    const qValue = Number.isFinite(row.QL) ? row.QL! : row.QL_base ?? "";
    const cells = [
      row.d_nm,
      row.m,
      row.Omega_GHz,
      row.phi_deg,
      row.detune_MHz ?? "",
      row.kappa_MHz ?? "",
      row.kappaEff_MHz ?? "",
      row.pumpRatio ?? "",
      row.status ?? "",
      row.G.toFixed(4),
      qValue,
      row.stable ? 1 : 0,
      row.dB_squeeze ?? "",
      row.deltaU_cycle_J ?? "",
      row.noiseTemp_K ?? "",
      plateau?.width_deg ?? "",
      row.crest ? row.phi_deg : "",
      row.negEnergyProxy ?? "",
      (row.notes ?? []).join("|"),
    ];
    return cells.join(",");
  });
  return [HEADER.join(","), ...lines].join("\n");
}

export function downloadCSV(rows: VacuumGapSweepRow[], filename = "vacuum-gap-sweep.csv") {
  if (!rows.length) return;
  const csv = rowsToCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
