import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Example = {
  label: string;
  command: string;
};

const examples: Example[] = [
  {
    label: "Process a folder",
    command: "python tools/remove_bg_edges.py --input ./input_pngs --output ./output_pngs",
  },
  {
    label: "Feather + stronger morphology",
    command: "python tools/remove_bg_edges.py --input ./input_pngs --output ./output_pngs --morph 9 --feather 2.0",
  },
  {
    label: "Manual Canny thresholds",
    command: "python tools/remove_bg_edges.py --input ./input_pngs --output ./output_pngs --canny-low 30 --canny-high 120",
  },
  {
    label: "Cleaner edges with GrabCut",
    command: "python tools/remove_bg_edges.py --input ./input_pngs --output ./output_pngs --method grabcut --feather 1.5",
  },
  {
    label: "Save debug masks",
    command: "python tools/remove_bg_edges.py --input ./input_pngs --output ./output_pngs --save-mask",
  },
];

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="mt-1 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 ring-1 ring-white/5">
      {value}
    </pre>
  );
}

export default function RemoveBgEdgesPanel() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [resultUrl, setResultUrl] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [method, setMethod] = React.useState<"largest-contour" | "grabcut">("largest-contour");
  const [morph, setMorph] = React.useState(15);
  const [feather, setFeather] = React.useState(1);
  const [blur, setBlur] = React.useState(3);
  const [sigma, setSigma] = React.useState(0.2);
  const [cannyLow, setCannyLow] = React.useState<string>("20");
  const [cannyHigh, setCannyHigh] = React.useState<string>("80");
  const [grabcutBorder, setGrabcutBorder] = React.useState(12);
  const [invert, setInvert] = React.useState(false);

  const revokeUrls = React.useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [previewUrl, resultUrl]);

  React.useEffect(() => () => revokeUrls(), [revokeUrls]);

  const onFileSelect = React.useCallback(
    (incoming?: File | null) => {
      revokeUrls();
      if (!incoming) {
        setFile(null);
        setPreviewUrl(null);
        setResultUrl(null);
        return;
      }
      setFile(incoming);
      setPreviewUrl(URL.createObjectURL(incoming));
      setResultUrl(null);
    },
    [revokeUrls]
  );

  const handleProcess = React.useCallback(async () => {
    if (!file) {
      setStatus("Pick a PNG to process.");
      return;
    }
    setIsLoading(true);
    setStatus("Processing…");
    setResultUrl(null);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("method", method);
      if (Number.isFinite(morph)) form.append("morph", String(morph));
      if (Number.isFinite(feather) && feather > 0) form.append("feather", String(feather));
      if (Number.isFinite(blur)) form.append("blur", String(blur));
      if (Number.isFinite(sigma)) form.append("sigma", String(sigma));
      const cl = Number(cannyLow);
      const ch = Number(cannyHigh);
      if (Number.isFinite(cl)) form.append("cannyLow", String(cl));
      if (Number.isFinite(ch)) form.append("cannyHigh", String(ch));
      if (Number.isFinite(grabcutBorder)) form.append("grabcutBorder", String(grabcutBorder));
      if (invert) form.append("invert", "1");
      const res = await fetch("/api/tools/remove-bg-edges", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message = typeof payload?.message === "string" ? payload.message : "Background removal failed.";
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setStatus("Done. Download or right-click → Save as PNG.");
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Background removal failed.";
      setStatus(message);
    } finally {
      setIsLoading(false);
    }
  }, [file, feather, method, morph, blur, sigma, cannyLow, cannyHigh, grabcutBorder, invert]);

  const applyPreset = React.useCallback(
    (kind: "badge" | "grabcut") => {
      if (kind === "badge") {
        setMethod("largest-contour");
        setBlur(3);
        setSigma(0.2);
        setMorph(15);
        setFeather(1);
        setCannyLow("20");
        setCannyHigh("80");
        setInvert(false);
      } else {
        setMethod("grabcut");
        setBlur(3);
        setSigma(0.2);
        setMorph(15);
        setFeather(1);
        setCannyLow("20");
        setCannyHigh("80");
        setGrabcutBorder(12);
        setInvert(false);
      }
    },
    []
  );

  return (
    <div className="h-full w-full overflow-auto bg-slate-950/90 p-4 text-slate-50">
      <div className="mb-4 flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">PNG edge cutter</div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-semibold text-white">remove_bg_edges.py</h1>
          <Badge variant="secondary" className="bg-emerald-900/50 text-emerald-100">
            tools/remove_bg_edges.py
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-slate-300">
          Batch background removal for PNGs: edge mask ➜ filled contour ➜ transparent output. Switch between a fast
          largest-contour pass or a GrabCut refinement when hair/fur needs cleaner borders.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-slate-700 text-slate-200">
            Mode: largest-contour (default)
          </Badge>
          <Badge variant="outline" className="border-slate-700 text-slate-200">
            Mode: grabcut (refines edge mask)
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-800/80 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-base text-white">Drop a PNG and go</CardTitle>
            <CardDescription className="text-slate-300">
              Upload locally, the server runs <code className="rounded bg-slate-800 px-1 py-[1px] text-[11px]">remove_bg_edges.py</code>, and returns a
              transparent PNG.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="remove-bg-upload"
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/60 px-4 py-6 text-center transition hover:border-cyan-500/60 hover:bg-slate-900"
            >
              <div className="text-sm font-semibold text-slate-100">Upload or drop a PNG</div>
              <div className="mt-1 text-xs text-slate-400">Keeps the filename; returns a new PNG with alpha.</div>
              <Input
                id="remove-bg-upload"
                type="file"
                accept=".png,image/png"
                className="hidden"
                onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
              <span className="text-slate-400">Presets:</span>
              <Button
                variant="secondary"
                size="sm"
                className="bg-slate-800 text-slate-100 hover:bg-slate-700"
                type="button"
                onClick={() => applyPreset("badge")}
              >
                Badge (auto)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="bg-slate-800 text-slate-100 hover:bg-slate-700"
                type="button"
                onClick={() => applyPreset("grabcut")}
              >
                GrabCut refine
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-300" htmlFor="remove-bg-method">
                  Mode
                </Label>
                <select
                  id="remove-bg-method"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-100 shadow-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  value={method}
                  onChange={(e) => setMethod(e.target.value === "grabcut" ? "grabcut" : "largest-contour")}
                >
                  <option value="largest-contour">Largest contour (fast)</option>
                  <option value="grabcut">GrabCut refine</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-300" htmlFor="remove-bg-morph">
                  Morph kernel
                </Label>
                <Input
                  id="remove-bg-morph"
                  type="number"
                  min={3}
                  max={255}
                  step={2}
                  value={morph}
                  onChange={(e) => setMorph(Number(e.target.value) || 0)}
                  className="w-full border-slate-700 bg-slate-900 text-sm text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-300" htmlFor="remove-bg-feather">
                  Feather (sigma)
                </Label>
                <Input
                  id="remove-bg-feather"
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={feather}
                  onChange={(e) => setFeather(Number(e.target.value) || 0)}
                  className="w-full border-slate-700 bg-slate-900 text-sm text-slate-100"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-300" htmlFor="remove-bg-blur">
                  Blur (Gaussian k)
                </Label>
                <Input
                  id="remove-bg-blur"
                  type="number"
                  min={1}
                  max={25}
                  step={1}
                  value={blur}
                  onChange={(e) => setBlur(Number(e.target.value) || 0)}
                  className="w-full border-slate-700 bg-slate-900 text-sm text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-300" htmlFor="remove-bg-sigma">
                  Auto-Canny sigma
                </Label>
                <Input
                  id="remove-bg-sigma"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sigma}
                  onChange={(e) => setSigma(Number(e.target.value) || 0)}
                  className="w-full border-slate-700 bg-slate-900 text-sm text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-300" htmlFor="remove-bg-invert">
                  Mask polarity
                </Label>
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    id="remove-bg-invert"
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                    checked={invert}
                    onChange={(e) => setInvert(e.target.checked)}
                  />
                  <span>Invert (keep the other side)</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-300" htmlFor="remove-bg-canny-low">
                  Canny low
                </Label>
                <Input
                  id="remove-bg-canny-low"
                  type="number"
                  min={0}
                  max={255}
                  step={5}
                  value={cannyLow}
                  onChange={(e) => setCannyLow(e.target.value)}
                  placeholder="auto"
                  className="w-full border-slate-700 bg-slate-900 text-sm text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-300" htmlFor="remove-bg-canny-high">
                  Canny high
                </Label>
                <Input
                  id="remove-bg-canny-high"
                  type="number"
                  min={0}
                  max={255}
                  step={5}
                  value={cannyHigh}
                  onChange={(e) => setCannyHigh(e.target.value)}
                  placeholder="auto"
                  className="w-full border-slate-700 bg-slate-900 text-sm text-slate-100"
                />
              </div>
              {method === "grabcut" && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300" htmlFor="remove-bg-border">
                    GrabCut border (px)
                  </Label>
                  <Input
                    id="remove-bg-border"
                    type="number"
                    min={0}
                    max={64}
                    step={1}
                    value={grabcutBorder}
                    onChange={(e) => setGrabcutBorder(Number(e.target.value) || 0)}
                    className="w-full border-slate-700 bg-slate-900 text-sm text-slate-100"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void handleProcess()} disabled={isLoading} className="bg-cyan-600 hover:bg-cyan-500">
                {isLoading ? "Processing…" : "Remove background"}
              </Button>
              {status && <div className="text-sm text-slate-300">{status}</div>}
            </div>
            <div className="text-xs text-slate-400">
              Tip for your badge: try blur 3, sigma 0.2, morph 15, Canny 20/80, feather 1.0; if edges still bleed, switch to GrabCut and set border to 12.
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800/80 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-base text-white">Preview</CardTitle>
            <CardDescription className="text-slate-300">
              Original on the left, output on the right. Right-click the result to save.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Input</div>
              <div className="flex h-48 items-center justify-center overflow-hidden rounded-md border border-slate-800 bg-slate-950">
                {previewUrl ? (
                  <img src={previewUrl} alt="input preview" className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="text-xs text-slate-500">Pick a PNG to preview</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Result</div>
              <div className="flex h-48 items-center justify-center overflow-hidden rounded-md border border-slate-800 bg-slate-950">
                {resultUrl ? (
                  <img src={resultUrl} alt="output preview" className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="text-xs text-slate-500">Process to see the cutout</div>
                )}
              </div>
              {resultUrl && (
                <div className="flex items-center justify-end">
                  <a
                    href={resultUrl}
                    download={file?.name ? `${file.name.replace(/\\.png$/i, "")}_cutout.png` : "cutout.png"}
                    className="text-xs font-semibold text-cyan-300 hover:text-cyan-100"
                  >
                    Download PNG
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-slate-800/80 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-base text-white">Install deps</CardTitle>
            <CardDescription className="text-slate-300">
              Uses OpenCV + NumPy. Install once in your Python env.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock value="pip install opencv-python numpy" />
          </CardContent>
        </Card>

        <Card className="border-slate-800/80 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-base text-white">Inputs & outputs</CardTitle>
            <CardDescription className="text-slate-300">
              Accepts a PNG file or directory; writes PNGs with alpha to the output folder. Use{" "}
              <code className="rounded bg-slate-800 px-1 py-[1px] text-[11px]">--glob</code> to filter when pointing at a
              directory.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-200">
            <div>Edge flow: grayscale → blur → Canny → morphology → largest contour fill.</div>
            <div>GrabCut refines that mask (probable FG/BG, eroded sure-FG, border forced to BG).</div>
            <div>Alpha keeps any existing transparency instead of re-opaquing transparent pixels.</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-3 border-slate-800/80 bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-base text-white">Quick commands</CardTitle>
          <CardDescription className="text-slate-300">
            Swap paths as needed; works on single files or batches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {examples.map((example) => (
            <div key={example.label}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">{example.label}</div>
              <CodeBlock value={example.command} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-3 border-slate-800/80 bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-base text-white">Notes</CardTitle>
          <CardDescription className="text-slate-300">
            Tweaks that usually fix haloing or edge gaps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-200">
          <ul className="space-y-1 list-disc pl-5 marker:text-cyan-300">
            <li>Boost <code className="rounded bg-slate-800 px-1 py-[1px] text-[11px]">--morph</code> when edges break.</li>
            <li>Feather with a small sigma (e.g., <code className="rounded bg-slate-800 px-1 py-[1px] text-[11px]">--feather 1.5</code>) to calm jaggies.</li>
            <li>Clamp Canny manually if the auto thresholds feel too timid or too loud.</li>
            <li>GrabCut + <code className="rounded bg-slate-800 px-1 py-[1px] text-[11px]">--grabcut-border</code> helps if subjects touch the frame edge.</li>
            <li>Flip the mask if you kept background by mistake with <code className="rounded bg-slate-800 px-1 py-[1px] text-[11px]">--invert</code>.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
