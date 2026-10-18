import React from "react";
import {
  AlertTriangle,
  Calculator,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Info,
  RefreshCw,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useDocViewerStore } from "@/store/useDocViewerStore";
import defaultWorksheetCsv from "@/data/needle_Ipeak_worksheet.csv?raw";

type NormalizedRow = Record<string, string>;

type ParsedWorksheetRow = {
  index: number;
  raw: Record<string, string>;
  normalized: NormalizedRow;
};

type ParsedWorksheet = {
  rows: ParsedWorksheetRow[];
  headers: string[];
  delimiter: string;
  warnings: string[];
};

type FilledWorksheetRow = {
  name: string;
  L_H?: number;
  E_pulse_J?: number;
  t_rise_s?: number;
  pulse_width_s?: number;
  rep_rate_hz?: number;
  di_dt_A_per_s?: number;
  I_peak_A?: number;
  I_peak_method?: string | null;
  V_required_kV?: number;
  V_max_kV?: number;
  L_total_uH?: number;
  J_A_per_mm2?: number;
  J_over_Jc?: number;
  N_parallel?: number;
  area_mm2?: number;
  Jc_A_per_mm2?: number;
  I_rms_A_est?: number;
  needs?: string;
};

type FillMeta = {
  source: string;
  parsedRows: number;
  filledRows: number;
  needsRows: number;
  delimiter: string;
  headers: string[];
  timestamp: number;
};

const OUTPUT_COLUMNS: (keyof FilledWorksheetRow)[] = [
  "name",
  "L_H",
  "E_pulse_J",
  "t_rise_s",
  "pulse_width_s",
  "rep_rate_hz",
  "di_dt_A_per_s",
  "I_peak_A",
  "I_peak_method",
  "V_required_kV",
  "V_max_kV",
  "L_total_uH",
  "J_A_per_mm2",
  "J_over_Jc",
  "N_parallel",
  "area_mm2",
  "Jc_A_per_mm2",
  "I_rms_A_est",
  "needs",
];

function normalizeKey(key: string): string {
  return key
    .replace(/[µμ]/g, "u")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"+|"+$/g, ""));
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5);
  const candidates: Array<"," | ";" | "\t" | "|"> = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const score = sample.reduce((acc, line) => acc + (line.split(candidate).length - 1), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore <= 0 ? "," : best;
}

function parseWorksheet(raw: string): ParsedWorksheet {
  const cleaned = raw.replace(/\uFEFF/g, "").trim();
  if (!cleaned) return { rows: [], headers: [], delimiter: ",", warnings: ["Worksheet is empty"] };

  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const delimiter = detectDelimiter(lines);
  const headers = splitRow(lines[0], delimiter);
  const warnings: string[] = [];
  if (headers.length <= 1) warnings.push("Only one column detected; check delimiter or header row.");

  const rows: ParsedWorksheetRow[] = [];
  lines.slice(1).forEach((line, idx) => {
    const cells = splitRow(line, delimiter);
    const rawRow: Record<string, string> = {};
    headers.forEach((header, colIdx) => {
      rawRow[header] = cells[colIdx] ?? "";
    });
    const normalized: NormalizedRow = {};
    for (const [key, value] of Object.entries(rawRow)) {
      const normKey = normalizeKey(key);
      if (!normKey) continue;
      const trimmed = value.trim();
      if (normalized[normKey] && normalized[normKey].length > 0) continue;
      normalized[normKey] = trimmed;
    }
    rows.push({ index: idx, raw: rawRow, normalized });
  });

  return { rows, headers, delimiter, warnings };
}

function pick(row: NormalizedRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && String(value).trim() !== "") return value;
  }
  return undefined;
}

function toNumber(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function resolveInductanceH(row: NormalizedRow): number | undefined {
  const L = toNumber(pick(row, "l_h", "l_henry", "inductance_h", "l"));
  if (L !== undefined) return L;
  const l_uH = toNumber(pick(row, "l_uh", "inductance_uh", "l_total_uh"));
  if (l_uH !== undefined) return l_uH * 1e-6;
  const l_mH = toNumber(pick(row, "l_mh", "inductance_mh"));
  if (l_mH !== undefined) return l_mH * 1e-3;
  return undefined;
}

function resolveEnergyJ(row: NormalizedRow): number | undefined {
  const E = toNumber(pick(row, "e_j", "energy_j", "e_pulse_j", "stored_energy_j"));
  if (E !== undefined) return E;
  const e_mJ = toNumber(pick(row, "e_mj", "energy_mj"));
  if (e_mJ !== undefined) return e_mJ * 1e-3;
  const e_kJ = toNumber(pick(row, "e_kj", "energy_kj"));
  if (e_kJ !== undefined) return e_kJ * 1e3;
  return undefined;
}

function resolveTriseS(row: NormalizedRow): number | undefined {
  const t = toNumber(pick(row, "t_rise_s", "trise_s", "rise_time_s", "pulse_rise_s"));
  if (t !== undefined) return t;
  const t_us = toNumber(pick(row, "t_rise_us", "trise_us", "rise_time_us", "pulse_rise_us"));
  if (t_us !== undefined) return t_us * 1e-6;
  const t_ns = toNumber(pick(row, "t_rise_ns", "trise_ns"));
  if (t_ns !== undefined) return t_ns * 1e-9;
  return undefined;
}

function resolveDurationS(row: NormalizedRow): number | undefined {
  const t = toNumber(pick(row, "pulse_width_s", "tau_s", "duration_s", "fwhm_s"));
  if (t !== undefined) return t;
  const t_us = toNumber(pick(row, "pulse_width_us", "tau_us", "duration_us"));
  if (t_us !== undefined) return t_us * 1e-6;
  const t_ns = toNumber(pick(row, "pulse_width_ns", "tau_ns", "duration_ns"));
  if (t_ns !== undefined) return t_ns * 1e-9;
  return undefined;
}

function resolveRepRate(row: NormalizedRow): number | undefined {
  return toNumber(pick(row, "rep_rate_hz", "rep_hz", "pps", "prf_hz"));
}

function resolveDiDt(row: NormalizedRow): number | undefined {
  const diDt = toNumber(pick(row, "di_dt_a_per_s", "di_dt", "didt"));
  if (diDt !== undefined) return diDt;
  const diDtUs = toNumber(pick(row, "di_dt_a_per_us", "didt_a_per_us"));
  if (diDtUs !== undefined) return diDtUs * 1e6;
  const diDtNs = toNumber(pick(row, "di_dt_a_per_ns", "didt_a_per_ns"));
  if (diDtNs !== undefined) return diDtNs * 1e9;
  return undefined;
}

function resolveVmax(row: NormalizedRow): number | undefined {
  const V = toNumber(pick(row, "v_max_v", "vmax_v", "v_bus_max_v", "bus_vmax_v"));
  if (V !== undefined) return V;
  const kV = toNumber(pick(row, "v_max_kv", "vmax_kv", "v_bus_max_kv"));
  if (kV !== undefined) return kV * 1e3;
  return undefined;
}

function resolveStrayL(row: NormalizedRow): number {
  const Ls = toNumber(pick(row, "l_stray_h", "l_bus_h", "ls_h"));
  if (Ls !== undefined) return Ls;
  const nH = toNumber(pick(row, "l_stray_nh", "ls_nh"));
  if (nH !== undefined) return nH * 1e-9;
  return 0;
}

function resolveConductor(row: NormalizedRow) {
  const N = toNumber(pick(row, "n_parallel", "n_tapes", "n_strands", "tapes", "strands"));
  const area = toNumber(pick(row, "area_mm2", "sc_area_mm2", "strand_area_mm2", "cs_area_mm2"));

  let area_mm2 = area;
  if (area_mm2 === undefined) {
    const width = toNumber(pick(row, "tape_width_mm", "width_mm", "conductor_width_mm"));
    const thUm = toNumber(pick(row, "tape_thickness_um", "thickness_um"));
    const thMm = toNumber(pick(row, "tape_thickness_mm", "thickness_mm"));
    if (width !== undefined && thUm !== undefined) {
      area_mm2 = width * (thUm * 1e-3);
    } else if (width !== undefined && thMm !== undefined) {
      area_mm2 = width * thMm;
    }
  }

  const Jc = toNumber(pick(row, "jc_a_per_mm2", "jcrit_a_per_mm2", "jc"));
  const Npar = N !== undefined && N > 0 ? Math.round(N) : undefined;
  return { Npar, area_mm2, Jc };
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) return value.toExponential(6);
  return Number(value.toFixed(6)).toString();
}

function computeFilledRow(row: ParsedWorksheetRow): FilledWorksheetRow {
  const normalized = row.normalized;
  const name = (pick(normalized, "name", "load", "id", "element", "stage") ?? `row_${row.index + 1}`).toString();
  const L = resolveInductanceH(normalized);
  const E = resolveEnergyJ(normalized);
  let tr = resolveTriseS(normalized);
  const tp = resolveDurationS(normalized);
  const rep = resolveRepRate(normalized);
  const diDt = resolveDiDt(normalized);
  const Vmax = resolveVmax(normalized);
  const Ls = resolveStrayL(normalized);
  const { Npar, area_mm2, Jc } = resolveConductor(normalized);
  const I_user = toNumber(pick(normalized, "i_peak_a", "ipeak_a", "i_a_peak", "i_pk_a"));

  const needs = new Set<string>();
  const Ltot = (L ?? 0) + (Ls ?? 0);
  const L_base = L !== undefined && L > 0 ? L : undefined;
  const L_total = Ltot > 0 ? Ltot : undefined;

  let I_final: number | undefined;
  let picked: string | null = null;
  let trFinal = tr;
  let didtFinal = diDt;
  let Vflat = Vmax;
  let E_final = E;

  const I_energy =
    E_final !== undefined && L_base !== undefined ? Math.sqrt(Math.max(0, (2 * E_final) / L_base)) : undefined;

  if (I_user !== undefined && Number.isFinite(I_user) && I_user > 0) {
    I_final = I_user;
    picked = "user";
  }

  if (I_final === undefined && I_energy !== undefined) {
    I_final = I_energy;
    picked = "E & L";
  }

  if (I_final === undefined && didtFinal !== undefined && trFinal !== undefined && trFinal > 0) {
    I_final = didtFinal * trFinal;
    picked = "di/dt * t_rise";
  }

  if (
    I_final === undefined &&
    Vflat !== undefined &&
    L_total !== undefined &&
    trFinal !== undefined &&
    trFinal > 0
  ) {
    const diFromV = Vflat / L_total;
    I_final = diFromV * trFinal;
    if (didtFinal === undefined) didtFinal = diFromV;
    picked = "V * t_rise / L";
  }

  if (I_final === undefined && didtFinal !== undefined && I_energy !== undefined && didtFinal > 0) {
    I_final = I_energy;
    trFinal = I_energy / didtFinal;
    picked = "E & di/dt -> t_rise";
  }

  if (trFinal === undefined && I_final !== undefined && didtFinal !== undefined && didtFinal > 0) {
    trFinal = I_final / didtFinal;
  }
  if (didtFinal === undefined && I_final !== undefined && trFinal !== undefined && trFinal > 0) {
    didtFinal = I_final / trFinal;
  }
  if (didtFinal === undefined && Vflat !== undefined && L_total !== undefined) {
    didtFinal = Vflat / L_total;
  }
  if (Vflat === undefined && didtFinal !== undefined && L_total !== undefined) {
    Vflat = L_total * didtFinal;
  }
  if (E_final === undefined && I_final !== undefined && L_base !== undefined) {
    E_final = 0.5 * L_base * I_final * I_final;
  }

  if (I_final === undefined) {
    if (L === undefined) needs.add("L");
    if (E === undefined && Vmax === undefined && diDt === undefined) needs.add("E_or_Vmax_or_di/dt");
    if (tr === undefined && (E === undefined || diDt === undefined)) needs.add("t_rise or (E & di/dt)");
  }

  const V_req = L_total !== undefined && didtFinal !== undefined ? L_total * didtFinal : undefined;

  let J: number | undefined;
  let J_frac: number | undefined;
  if (I_final !== undefined && area_mm2 !== undefined && area_mm2 > 0) {
    const N_eff = Npar && Npar > 0 ? Npar : 1;
    J = I_final / (N_eff * area_mm2);
    if (Jc !== undefined && Jc > 0) {
      J_frac = J / Jc;
    }
  }

  let I_rms: number | undefined;
  const width = tp ?? trFinal;
  if (I_final !== undefined && width !== undefined && width > 0) {
    I_rms = I_final / Math.sqrt(3);
    if (rep !== undefined && rep > 0) {
      const duty = width * rep;
      I_rms *= Math.sqrt(Math.max(1e-12, duty));
    }
  }

  return {
    name,
    L_H: L,
    E_pulse_J: E_final,
    t_rise_s: trFinal,
    pulse_width_s: tp,
    rep_rate_hz: rep,
    di_dt_A_per_s: didtFinal,
    I_peak_A: I_final,
    I_peak_method: picked,
    V_required_kV: V_req !== undefined ? V_req / 1e3 : undefined,
    V_max_kV: Vmax !== undefined ? Vmax / 1e3 : undefined,
    L_total_uH: Ltot > 0 ? Ltot * 1e6 : undefined,
    J_A_per_mm2: J,
    J_over_Jc: J_frac,
    N_parallel: Npar,
    area_mm2,
    Jc_A_per_mm2: Jc,
    I_rms_A_est: I_rms,
    needs: needs.size ? Array.from(needs).sort().join(", ") : undefined,
  };
}

function filledRowsToCsv(rows: FilledWorksheetRow[]): string {
  const header = OUTPUT_COLUMNS.join(",");
  const lines = rows.map((row) =>
    OUTPUT_COLUMNS.map((col) => {
      const value = row[col];
      if (value === undefined || value === null) return "";
      if (typeof value === "number") return formatNumber(value);
      return String(value).replace(/[\r\n]+/g, " ").trim();
    }).join(","),
  );
  return [header, ...lines].join("\n");
}

function downloadCsv(csv: string, filename: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function NeedleIpeakWorksheetPanel() {
  const [worksheetText, setWorksheetText] = React.useState("");
  const [parsedWorksheet, setParsedWorksheet] = React.useState<ParsedWorksheet>({
    rows: [],
    headers: [],
    delimiter: ",",
    warnings: [],
  });
  const [filledWorksheet, setFilledWorksheet] = React.useState<FilledWorksheetRow[]>([]);
  const [filledCsv, setFilledCsv] = React.useState<string>("");
  const [fillMeta, setFillMeta] = React.useState<FillMeta>({
    source: "none",
    parsedRows: 0,
    filledRows: 0,
    needsRows: 0,
    delimiter: ",",
    headers: [],
    timestamp: Date.now(),
  });
  const [loadMessage, setLoadMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const docViewer = useDocViewerStore();

  const runFill = React.useCallback(
    (text: string, source: string) => {
      const parsed = parseWorksheet(text);
      const filled = parsed.rows.map((row) => computeFilledRow(row));
      setParsedWorksheet(parsed);
      setFilledWorksheet(filled);
      setFilledCsv(filledRowsToCsv(filled));
      const filledCount = filled.filter((row) => row.I_peak_A !== undefined).length;
      const needsCount = filled.filter((row) => row.needs && row.needs.length > 0).length;
      setFillMeta({
        source,
        parsedRows: parsed.rows.length,
        filledRows: filledCount,
        needsRows: needsCount,
        delimiter: parsed.delimiter,
        headers: parsed.headers,
        timestamp: Date.now(),
      });
    },
    [],
  );

  const handleRecompute = React.useCallback(() => {
    runFill(worksheetText, "manual");
    setLoadMessage("Re-ran fill with current worksheet text");
  }, [runFill, worksheetText]);

  const handleTextChange = React.useCallback((text: string) => {
    setWorksheetText(text);
    setParsedWorksheet({ rows: [], headers: [], delimiter: ",", warnings: [] });
    setFilledWorksheet([]);
    setFilledCsv("");
    setFillMeta({
      source: "edited",
      parsedRows: 0,
      filledRows: 0,
      needsRows: 0,
      delimiter: ",",
      headers: [],
      timestamp: Date.now(),
    });
    setLoadMessage("Worksheet changed; re-run fill before export");
  }, []);

  const handleLoadDefault = React.useCallback(() => {
    const trimmed = defaultWorksheetCsv.trim();
    setWorksheetText(trimmed);
    runFill(trimmed, "repo");
    setLoadMessage("Loaded legacy example data/needle_Ipeak_worksheet.csv");
  }, [runFill]);

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      setWorksheetText(text);
      runFill(text, `file:${file.name}`);
      setLoadMessage(`Loaded ${file.name}`);
      event.target.value = "";
    },
    [runFill],
  );

  const handleDownloadFilled = React.useCallback(() => {
    if (!filledCsv) return;
    downloadCsv(filledCsv, "needle_Ipeak_filled.csv");
  }, [filledCsv]);

  const lastRunLabel = React.useMemo(() => new Date(fillMeta.timestamp).toLocaleString(), [fillMeta.timestamp]);
  const normalizedHeaders = React.useMemo(
    () => fillMeta.headers.map((header) => normalizeKey(header)),
    [fillMeta.headers],
  );
  const delimiterLabel = React.useMemo(() => {
    if (fillMeta.delimiter === "\t") return "tab";
    if (fillMeta.delimiter === ",") return "comma";
    if (fillMeta.delimiter === ";") return "semicolon";
    if (fillMeta.delimiter === "|") return "pipe";
    return fillMeta.delimiter || "n/a";
  }, [fillMeta.delimiter]);
  const displayNumber = React.useCallback((value?: number) => {
    const formatted = formatNumber(value);
    return formatted === "" ? "—" : formatted;
  }, []);

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-50">
      <aside className="w-[340px] border-r border-white/10 bg-slate-950/70 p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Needle Hull Mk.1</p>
            <h1 className="text-lg font-semibold text-slate-50">I_peak Worksheet</h1>
            <p className="text-xs text-slate-400">
              Developer CSV estimator for historical Mk.1 load planning. Inputs must come from the loaded file; estimates are not measured hardware or selected-run NHM2 evidence.
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-400/50 bg-indigo-500/15">
            <FileSpreadsheet className="h-5 w-5 text-indigo-200" />
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => docViewer.viewDoc("/docs/warp-pulsed-power.md")}
        >
          <ClipboardList className="h-4 w-4 mr-2" />
          Open pulsed-power doc
        </Button>
      </aside>

      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="flex min-h-full flex-col">
            <section className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Worksheet ingest</p>
                  <h2 className="text-lg font-semibold text-slate-50">Load, detect, and fill I_peak</h2>
                  <p className="text-xs text-slate-400">
                    Estimates I_peak from each loaded row using available L/E/t_rise/di/dt and conductor geometry.
                    The method and needs columns show the calculation path and missing inputs.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    onClick={handleDownloadFilled}
                    disabled={!filledWorksheet.length}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Filled CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/20"
                    onClick={handleRecompute}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-run fill
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="space-y-3 rounded-lg border border-white/10 bg-slate-900/60 p-3 xl:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-dashed border-white/30"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Load CSV
                    </Button>
                    <Button variant="ghost" size="sm" className="text-slate-100" onClick={handleLoadDefault}>
                      Load legacy example
                    </Button>
                    <BadgeChip icon={<FileSpreadsheet className="h-3 w-3" />} label={`${fillMeta.parsedRows} rows`} tone="cyan" />
                    <BadgeChip
                      icon={<Info className="h-3 w-3" />}
                      label={`${delimiterLabel}-sep`}
                    />
                  </div>
                  <Textarea
                    value={worksheetText}
                    onChange={(event) => handleTextChange(event.target.value)}
                    placeholder="Load a CSV, load the legacy example, or paste rows with a header."
                    className="min-h-[190px] bg-slate-950/70 border-white/10 text-xs font-mono text-slate-100"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>{loadMessage ?? (fillMeta.source === "none" ? "No CSV loaded" : `Last run: ${lastRunLabel} (${fillMeta.source})`)}</span>
                    <span className="text-slate-500">
                      Headers: {fillMeta.headers.length ? normalizedHeaders.join(", ") : "none detected"}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-white/10 bg-slate-900/60 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SummaryCard
                      label="I_peak estimated"
                      value={`${fillMeta.filledRows}/${fillMeta.parsedRows || 0}`}
                      icon={<Zap className="h-4 w-4 text-emerald-200" />}
                    />
                    <SummaryCard
                      label="Needs data"
                      value={`${fillMeta.needsRows}`}
                      icon={<AlertTriangle className="h-4 w-4 text-amber-200" />}
                    />
                    <SummaryCard
                      label="Rows ingested"
                      value={`${fillMeta.parsedRows}`}
                      icon={<FileSpreadsheet className="h-4 w-4 text-cyan-200" />}
                    />
                    <SummaryCard
                      label="Headers"
                      value={`${fillMeta.headers.length}`}
                      icon={<Info className="h-4 w-4 text-slate-200" />}
                    />
                  </div>
                  {parsedWorksheet.warnings.length > 0 && (
                    <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        Parser warnings
                      </div>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {parsedWorksheet.warnings.map((warning, idx) => (
                          <li key={`warn-${idx}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="rounded-md border border-white/10 bg-slate-950/60 p-2 text-[11px] text-slate-300">
                    <div className="font-semibold text-slate-100">Auto-detection</div>
                    <p className="mt-1">
                      Looks for L/E/t_rise/di/dt/V_max plus conductor geometry (area, width×thickness, N_parallel).
                      Keeps blanks for missing inputs and tags them in the needs column.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-slate-900/60">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Filled sheet preview</p>
                    <h3 className="text-base font-semibold text-slate-50">
                      I_peak path, V_required, J, and RMS estimates
                    </h3>
                    <p className="text-xs text-slate-400">
                      These are engineering estimates for the loaded CSV only. Method identifies the calculation path; needs lists missing inputs.
                    </p>
                  </div>
                  <BadgeChip icon={<Calculator className="h-4 w-4" />} label={`${filledWorksheet.length} rows`} tone="cyan" />
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-900/70">
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>I_peak (A)</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>V_req (kV)</TableHead>
                        <TableHead>V_max (kV)</TableHead>
                        <TableHead>di/dt (A/s)</TableHead>
                        <TableHead>L_total (uH)</TableHead>
                        <TableHead>J (A/mm²)</TableHead>
                        <TableHead>I_rms est (A)</TableHead>
                        <TableHead>Needs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filledWorksheet.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-xs text-slate-300">
                            No rows parsed yet. Load a CSV or paste content, then re-run the fill.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filledWorksheet.map((row) => (
                          <TableRow
                            key={`${row.name}-${row.L_H ?? row.E_pulse_J ?? row.I_peak_A ?? row.t_rise_s ?? row.pulse_width_s ?? row.rep_rate_hz ?? ""}`}
                          >
                            <TableCell className="font-semibold text-xs text-slate-100">{row.name}</TableCell>
                            <TableCell className="font-mono text-xs text-emerald-200">
                              {displayNumber(row.I_peak_A)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-slate-300">
                              {row.I_peak_method ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-cyan-200">
                              {displayNumber(row.V_required_kV)}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-200">
                              {displayNumber(row.V_max_kV)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-slate-200">
                              {displayNumber(row.di_dt_A_per_s)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-slate-200">
                              {displayNumber(row.L_total_uH)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-slate-200">
                              {displayNumber(row.J_A_per_mm2)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-slate-200">
                              {displayNumber(row.I_rms_A_est)}
                            </TableCell>
                            <TableCell className="text-[11px] text-amber-100">{row.needs ?? "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </section>

          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

type BadgeChipProps = {
  icon?: React.ReactNode;
  label: string;
  tone?: "cyan" | "slate" | "amber";
};

function BadgeChip({ icon, label, tone = "slate" }: BadgeChipProps) {
  const toneClass =
    tone === "cyan"
      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
      : tone === "amber"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
        : "border-white/15 bg-white/5 text-slate-100";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
        toneClass,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

type SummaryCardProps = {
  label: string;
  value: string;
  icon: React.ReactNode;
};

function SummaryCard({ label, value, icon }: SummaryCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900/70 text-slate-50">
        {icon}
      </div>
      <div className="leading-tight">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-50">{value}</p>
      </div>
    </div>
  );
}
