import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";
import { useFlightDirectorStore } from "@/store/useFlightDirectorStore";
import { useFlightDirectorCurvatureBridge } from "@/hooks/useFlightDirectorCurvatureBridge";
import { useUpdatePipeline } from "@/hooks/use-energy-pipeline";
import { shallow } from "zustand/shallow";

const clampRange = (value: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const wrap01 = (value: number) => {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
};
const TAU = Math.PI * 2;
const shortestPhaseDelta01 = (targetFrac: number, currentFrac: number) => {
  const delta = (targetFrac - currentFrac) * TAU;
  return Math.atan2(Math.sin(delta), Math.cos(delta)) / TAU;
};
const DEFAULT_NEGATIVE_FRACTION = 0.4;
const DEFAULT_THRUST_FRAC = 1 - DEFAULT_NEGATIVE_FRACTION;
const KEY_DEADBAND = 0.08;
const KEY_HYSTERESIS = 0.02;
const ZERO_RATE_DPS = 0.1;
const MIN_RAF_DT_S = 1 / 240;
const MAX_RAF_DT_S = 1 / 30;
const JERK_MULTIPLIER = 4; // jerk ~= 4 * accel per second by default
const PLANAR_BIAS_DELTA_MAX = 0.18;
const PLANAR_INTENT_DEADBAND = 0.015;
const RISE_INTENT_DEADBAND = 0.05;

type AxisProfileState = {
  v_dps: number;
  a_dps2: number;
};

const clampSymmetric = (value: number, limit: number) => clampRange(value, -limit, limit);

const shapeAxis = (raw: number, deadband = KEY_DEADBAND) => {
  const clamped = clampRange(raw, -1, 1);
  if (Math.abs(clamped) <= deadband) return 0;
  const sign = Math.sign(clamped);
  const normalized = (Math.abs(clamped) - deadband) / Math.max(1e-6, 1 - deadband);
  const curved = Math.pow(normalized, 0.85);
  return clampRange(sign * curved, -1, 1);
};

const applyAxisHysteresis = (value: number, last: number, hysteresis = KEY_HYSTERESIS) => {
  if (Math.abs(value - last) < hysteresis) {
    return last;
  }
  return value;
};

const sCurveStep = (
  prev: AxisProfileState,
  targetRate_dps: number,
  dt: number,
  accelLimit_dps2: number,
  jerkLimit_dps3: number,
  rateLimit_dps: number
): AxisProfileState => {
  if (!Number.isFinite(dt) || dt <= 0) return prev;

  const vMax = Math.max(0, rateLimit_dps);
  const aMax = Math.max(0, accelLimit_dps2);
  const jMax = Math.max(0, jerkLimit_dps3);

  const vTarget = clampSymmetric(targetRate_dps, vMax);
  let v = clampSymmetric(prev.v_dps, vMax);
  let a = clampSymmetric(prev.a_dps2, aMax);

  const reversing = Math.sign(vTarget) !== 0 && Math.sign(v) !== Math.sign(vTarget);
  const needZero = reversing && Math.abs(v) > ZERO_RATE_DPS;
  const vGoal = needZero ? 0 : vTarget;
  const dir = Math.sign(vGoal - v);
  const aGoal = dir * aMax;

  if (jMax > 0) {
    const deltaA = clampRange(aGoal - a, -jMax * dt, jMax * dt);
    a = clampRange(a + deltaA, -aMax, aMax);
  } else {
    a = aGoal;
  }

  let vNext = v + a * dt;
  if ((dir > 0 && vNext > vGoal) || (dir < 0 && vNext < vGoal)) {
    vNext = vGoal;
    a = 0;
  }

  if (!Number.isFinite(vNext)) {
    return { v_dps: 0, a_dps2: 0 };
  }

  return { v_dps: clampSymmetric(vNext, vMax), a_dps2: clampSymmetric(a, aMax) };
};

const MANUAL_FLIGHT_KEY_NAMES = new Set([
  "w",
  "a",
  "s",
  "d",
  "space",
  "shift",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);
const MANUAL_FLIGHT_KEY_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const SIMPLE_KEY_LAYOUT = [
  {
    label: "W",
    keys: ["w", "arrowup"],
    ariaLabel: "Forward (W or Up Arrow)",
    className: "basis-14 sm:basis-16",
  },
  {
    label: "A",
    keys: ["a", "arrowleft"],
    ariaLabel: "Strafe left (A or Left Arrow)",
    className: "basis-14 sm:basis-16",
  },
  {
    label: "S",
    keys: ["s", "arrowdown"],
    ariaLabel: "Reverse (S or Down Arrow)",
    className: "basis-14 sm:basis-16",
  },
  {
    label: "D",
    keys: ["d", "arrowright"],
    ariaLabel: "Strafe right (D or Right Arrow)",
    className: "basis-14 sm:basis-16",
  },
  {
    label: "SPACE",
    keys: ["space"],
    ariaLabel: "Lift (Space)",
    className: "flex-1 basis-24",
  },
  {
    label: "SHIFT",
    keys: ["shift"],
    ariaLabel: "Dip (Shift)",
    className: "flex-1 basis-24",
  },
];

type Heading = { label: string; frac: number };

const HEADINGS: Heading[] = [
  { label: "N", frac: 0.0 },
  { label: "NE", frac: 0.125 },
  { label: "E", frac: 0.25 },
  { label: "SE", frac: 0.375 },
  { label: "S", frac: 0.5 },
  { label: "SW", frac: 0.625 },
  { label: "W", frac: 0.75 },
  { label: "NW", frac: 0.875 },
];

const degFromFrac = (frac: number) => wrap01(frac) * 360;

const cardinalFromFrac = (frac: number) => {
  const degrees = degFromFrac(frac);
  const index = Math.round((degrees % 360) / 45) % HEADINGS.length;
  return HEADINGS[index].label;
};

type MiniRoseProps = {
  phase01: number;
  splitFrac: number;
};

type DirectionPadProps = {
  className?: string;
  onVizIntent?: (intent: { rise: number; planar: number }) => void;
};

function MiniRose({ phase01, splitFrac }: MiniRoseProps) {
  const primaryTheta = wrap01(phase01) * TAU;
  const oppositeTheta = wrap01(phase01 + 0.5) * TAU;
  const radius = 46;
  const center = 60;

  const toPoint = (theta: number) => {
    const rotated = theta - Math.PI / 2;
    return {
      x: center + radius * Math.cos(rotated),
      y: center + radius * Math.sin(rotated),
    };
  };

  const primary = toPoint(primaryTheta);
  const opposite = toPoint(oppositeTheta);
  const weightPrimary = clampRange(splitFrac, 0, 1);
  const weightOpposite = 1 - weightPrimary;

  return (
    <svg viewBox="0 0 120 120" width={120} height={120} aria-label="Heading rose (yaw)">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.25" />
      <line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="currentColor" strokeOpacity="0.2" />
      <line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="currentColor" strokeOpacity="0.2" />
      <circle cx={primary.x} cy={primary.y} r={6 + 6 * weightPrimary} fill="currentColor" />
      <circle cx={opposite.x} cy={opposite.y} r={6 + 6 * weightOpposite} fill="currentColor" opacity={0.55} />
      <text x={center} y={14} textAnchor="middle" fontSize="10" opacity="0.65">
        N
      </text>
      <text x={center + radius + 8} y={center + 3} fontSize="10" opacity="0.65">
        E
      </text>
      <text x={center} y={center + radius + 14} textAnchor="middle" fontSize="10" opacity="0.65">
        S
      </text>
      <text x={center - radius - 8} y={center + 3} textAnchor="end" fontSize="10" opacity="0.65">
        W
      </text>
    </svg>
  );
}

const HeadingBadge = React.memo(function HeadingBadge() {
  const phase01 = useDriveSyncStore((state) => state.phase01);
  const headingDeg = Math.round(degFromFrac(phase01));
  const headingCard = cardinalFromFrac(phase01);
  return (
    <Badge>
      {headingCard} | {headingDeg.toString().padStart(3, "0")} deg
    </Badge>
  );
});

type HeadingRoseControlsProps = {
  splitFrac: number;
  splitBiasPercent: number;
  flightBias: number;
  onBiasChange: (value: number) => void;
  setHeading: (frac: number) => void;
};

const HeadingRoseControls = React.memo(function HeadingRoseControls({
  splitFrac,
  splitBiasPercent,
  flightBias,
  onBiasChange,
  setHeading,
}: HeadingRoseControlsProps) {
  const phase01 = useDriveSyncStore((state) => state.phase01);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6 md:col-span-4 flex justify-center">
          <MiniRose phase01={phase01} splitFrac={splitFrac} />
        </div>
        <div className="col-span-6 md:col-span-8 grid grid-cols-3 gap-2">
          {HEADINGS.map((heading) => {
            const isActive = Math.abs(shortestPhaseDelta01(heading.frac, phase01)) < 1e-3;
            return (
              <Button
                key={heading.label}
                variant={isActive ? "default" : "secondary"}
                onClick={() => setHeading(heading.frac)}
              >
                {heading.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Primary / secondary split (|bias| {splitBiasPercent}%)
          </span>
          <Badge variant="outline">
            {Math.round(splitFrac * 100)}% / {Math.round((1 - splitFrac) * 100)}%
          </Badge>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[flightBias]}
          onValueChange={(values) => {
            const value = Array.isArray(values) ? values[0] ?? flightBias : flightBias;
            onBiasChange(value);
          }}
        />
        <div className="text-[0.65rem] text-muted-foreground">
          Scheduler negativeFraction receives {(100 - Math.round(splitFrac * 100))}% to mirror the opposite lobe.
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground leading-5">
        <strong>Why it can look clockwise only:</strong> we start at 0 deg (north). Buttons on the right advance
        phase, which renders clockwise; buttons on the left wrap across 360 deg. The rose shows both lobes, so the
        wrap is visible and expected.
      </div>
    </div>
  );
});

const DriveIntentReadout = React.memo(function DriveIntentReadout() {
  const intent = useDriveSyncStore((state) => state.intent);
  return (
    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
      <div>
        dX <span className="font-mono text-foreground">{intent.x.toFixed(2)}</span>
      </div>
      <div>
        dY <span className="font-mono text-foreground">{intent.y.toFixed(2)}</span>
      </div>
      <div>
        dZ <span className="font-mono text-foreground">{intent.z.toFixed(2)}</span>
      </div>
    </div>
  );
});

export default function DirectionPad({ className, onVizIntent }: DirectionPadProps) {
  const {
    splitEnabled,
    splitFrac: splitFracState,
    sigmaSectors: sigmaSectorsState,
    sectorFloor: floorState,
    phaseMode: phaseModeState,
    nudge01,
    setPhaseMode,
    setSplit,
    setSigma: setSigmaStore,
    setFloor: setFloorStore,
    setIntent,
    setNudge01,
  } = useDriveSyncStore(
    (state) => ({
      splitEnabled: state.splitEnabled,
      splitFrac: state.splitFrac,
      sigmaSectors: state.sigmaSectors,
      sectorFloor: state.sectorFloor,
      phaseMode: state.phaseMode,
      nudge01: state.nudge01,
      setPhaseMode: state.setPhaseMode,
      setSplit: state.setSplit,
      setSigma: state.setSigma,
      setFloor: state.setFloor,
      setIntent: state.setIntent,
      setNudge01: state.setNudge01,
    }),
    shallow
  );
  const setPhase = useDriveSyncStore((state) => state.setPhase);
  useFlightDirectorCurvatureBridge();
  const mutatePipeline = useUpdatePipeline();
  const negFractionPendingRef = useRef<number | null>(null);
  const negFractionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushNegFraction = useCallback(() => {
    if (negFractionPendingRef.current == null) {
      negFractionTimerRef.current = null;
      return;
    }
    const target = clampRange(negFractionPendingRef.current, 0, 1);
    negFractionPendingRef.current = null;
    negFractionTimerRef.current = null;
    try {
      mutatePipeline.mutate({ negativeFraction: target });
    } catch {
      // Endpoint unavailable is non-fatal in mock contexts
    }
  }, [mutatePipeline]);
  const scheduleNegFractionUpdate = useCallback(
    (value: number) => {
      negFractionPendingRef.current = clampRange(value, 0, 1);
      if (negFractionTimerRef.current == null) {
        negFractionTimerRef.current = setTimeout(flushNegFraction, 140);
      }
    },
    [flushNegFraction]
  );
  useEffect(
    () => () => {
      if (negFractionTimerRef.current) {
        clearTimeout(negFractionTimerRef.current);
      }
    },
    []
  );
  const [controlMode, setControlMode] = useState<"simple" | "advanced">("simple");
  const handleModeChange = (value: string) => {
    setControlMode(value === "advanced" ? "advanced" : "simple");
  };
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const desiredYawAxisRef = useRef(0);
  const yawProfileRef = useRef<AxisProfileState>({ v_dps: 0, a_dps2: 0 });
  const lastYawAxisRef = useRef(0);
  const resetYawProfile = useCallback(() => {
    yawProfileRef.current = { v_dps: 0, a_dps2: 0 };
    lastYawAxisRef.current = 0;
  }, []);
  const normalizeKey = useCallback((key: string) => {
    if (key === " ") return "space";
    if (key === "Spacebar") return "space";
    return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  }, []);
  const syncPressedKeys = useCallback(() => {
    setPressedKeys(new Set(pressedKeysRef.current));
  }, []);
  const updateIntentFromPressed = useCallback(() => {
    const pressed = pressedKeysRef.current;
    const lateralX =
      (pressed.has("d") || pressed.has("arrowright") ? 1 : 0) -
      (pressed.has("a") || pressed.has("arrowleft") ? 1 : 0);
    const lateralY =
      (pressed.has("w") || pressed.has("arrowup") ? 1 : 0) -
      (pressed.has("s") || pressed.has("arrowdown") ? 1 : 0);
    const verticalZ = (pressed.has("space") ? 1 : 0) - (pressed.has("shift") ? 1 : 0);
    setIntent({ x: lateralX, y: lateralY, z: verticalZ });

    const state = useFlightDirectorStore.getState();
    state.setRise(clampRange(verticalZ, -1, 1));
    const yawAxis = clampRange(
      (pressed.has("d") || pressed.has("arrowright") ? 1 : 0) -
        (pressed.has("a") || pressed.has("arrowleft") ? 1 : 0),
      -1,
      1
    );
    desiredYawAxisRef.current = yawAxis;
    if (Math.abs(yawAxis) > 0) {
      if (state.mode !== "MAN") {
        state.setMode("MAN");
      }
    } else {
      resetYawProfile();
    }
  }, [resetYawProfile, setIntent]);
  const handleVirtualKeyPress = useCallback(
    (rawKey: string) => {
      const key = normalizeKey(rawKey);
      if (!MANUAL_FLIGHT_KEY_NAMES.has(key)) {
        return;
      }
      const pressed = pressedKeysRef.current;
      if (!pressed.has(key)) {
        pressed.add(key);
        syncPressedKeys();
        updateIntentFromPressed();
      }
    },
    [normalizeKey, syncPressedKeys, updateIntentFromPressed]
  );
  const handleVirtualKeyRelease = useCallback(
    (rawKey: string) => {
      const key = normalizeKey(rawKey);
      if (!MANUAL_FLIGHT_KEY_NAMES.has(key)) {
        return;
      }
      const pressed = pressedKeysRef.current;
      if (pressed.has(key)) {
        pressed.delete(key);
        syncPressedKeys();
        updateIntentFromPressed();
      }
    },
    [normalizeKey, syncPressedKeys, updateIntentFromPressed]
  );
  const renderKeyCap = (
    label: string,
    options: { keys: string[]; className?: string; ariaLabel?: string } = { keys: [] }
  ) => {
    const { keys, className, ariaLabel } = options;
    const [primaryKey] = keys;
    const isActive = keys.some((key) => pressedKeys.has(key));

    const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!event.isPrimary || !primaryKey) {
        return;
      }
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture errors (older browsers)
      }
      handleVirtualKeyPress(primaryKey);
    };

    const releaseKey = (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!primaryKey) {
        return;
      }
      handleVirtualKeyRelease(primaryKey);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture release errors
      }
    };

    return (
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        aria-pressed={isActive}
        className={cn(
          "flex h-11 min-w-[3rem] select-none items-center justify-center rounded-md border px-3 text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          isActive ? "border-primary bg-primary text-primary-foreground shadow-inner" : "border-border bg-muted/50",
          className
        )}
        onPointerDown={onPointerDown}
        onPointerUp={releaseKey}
        onPointerLeave={releaseKey}
        onPointerCancel={releaseKey}
        onContextMenu={(event) => event.preventDefault()}
      >
        {label}
      </button>
    );
  };

  const flightEnabled = useFlightDirectorStore((state) => state.enabled);
  const flightMode = useFlightDirectorStore((state) => state.mode);
  const flightCoupling = useFlightDirectorStore((state) => state.coupling);
  const flightYawRate = useFlightDirectorStore((state) => state.yawRate_dps);
  const flightBias = useFlightDirectorStore((state) => state.thrustBias01);
  const flightMaxYawRate = useFlightDirectorStore((state) => state.maxYawRate_dps);
  const flightMaxYawAccel = useFlightDirectorStore((state) => state.maxYawAccel_dps2);

  const splitFrac = useMemo(() => {
    const value =
      typeof splitFracState === "number" && Number.isFinite(splitFracState)
        ? splitFracState
        : DEFAULT_THRUST_FRAC;
    return clampRange(value, 0, 1);
  }, [splitFracState]);

  const planarBiasActiveRef = useRef(false);
  const biasBaselineRef = useRef(splitFrac);
  useEffect(() => {
    if (!planarBiasActiveRef.current) {
      biasBaselineRef.current = splitFrac;
    }
  }, [splitFrac]);

  const sigmaSectors = useMemo(() => {
    const value =
      typeof sigmaSectorsState === "number" && Number.isFinite(sigmaSectorsState)
        ? sigmaSectorsState
        : 0.25;
    return clampRange(value, 0.25, 8);
  }, [sigmaSectorsState]);

  const floor = useMemo(() => {
    const value =
      typeof floorState === "number" && Number.isFinite(floorState)
        ? floorState
        : 0.2;
    return clampRange(value, 0, 0.99);
  }, [floorState]);

  const riseShapingActiveRef = useRef(false);
  const sigmaBaselineRef = useRef(sigmaSectors);
  useEffect(() => {
    if (!riseShapingActiveRef.current) {
      sigmaBaselineRef.current = sigmaSectors;
    }
  }, [sigmaSectors]);
  const floorBaselineRef = useRef(floor);
  useEffect(() => {
    if (!riseShapingActiveRef.current) {
      floorBaselineRef.current = floor;
    }
  }, [floor]);

  const initialPhase = useDriveSyncStore.getState().phase01;
  const phaseRef = useRef(Number.isFinite(initialPhase) ? wrap01(initialPhase) : 0);
  useEffect(() => {
    const unsubscribe = useDriveSyncStore.subscribe((state) => {
      const value = state.phase01;
      const safe = Number.isFinite(value) ? wrap01(value) : 0;
      phaseRef.current = safe;
    });
    return unsubscribe;
  }, []);

  const phaseModeRef = useRef(phaseModeState);
  useEffect(() => {
    phaseModeRef.current = phaseModeState;
  }, [phaseModeState]);

  const initialIntent = useDriveSyncStore.getState().intent;
  const intentRef = useRef(initialIntent);
  const onVizIntentRef = useRef(onVizIntent);
  useEffect(() => {
    onVizIntentRef.current = onVizIntent;
  }, [onVizIntent]);
  useEffect(() => {
    const state = useFlightDirectorStore.getState();
    if (Math.abs(state.thrustBias01 - splitFrac) > 1e-3) {
      state.setThrustBias01(splitFrac);
    }
  }, [splitFrac]);

  const onBiasChange = (value: number) => {
    const bias = clampRange(value, 0, 1);
    setSplit(true, bias);
    biasBaselineRef.current = bias;
    const negFrac = clampRange(1 - bias, 0, 1);
    scheduleNegFractionUpdate(negFrac);
    const state = useFlightDirectorStore.getState();
    state.setThrustBias01(bias);
  };

  const holdStation = () => {
    onBiasChange(0.5);
    const state = useFlightDirectorStore.getState();
    state.setMode("MAN");
    state.zeroRate();
    state.setYawRateCmd(0);
    desiredYawAxisRef.current = 0;
    resetYawProfile();
  };

  const setHeading = (frac: number) => {
    const headingFrac = wrap01(frac);
    const state = useFlightDirectorStore.getState();
    state.setMode("HDG");
    state.setTargetYaw01(headingFrac);
    state.zeroRate();
    state.setYawRateCmd(0);
    desiredYawAxisRef.current = 0;
    resetYawProfile();
    if (phaseModeRef.current !== "manual") {
      setPhaseMode("manual");
      phaseModeRef.current = "manual";
    }
  };

  const applyPlanarIntentBias = useCallback(
    (
      planarMag: number,
      autopEnabled: boolean,
      driveState: { splitEnabled: boolean; splitFrac: number }
    ) => {
      const magnitude = clampRange(planarMag, 0, 1);
      const shouldDrive = autopEnabled && magnitude > PLANAR_INTENT_DEADBAND;
      if (!shouldDrive) {
        if (planarBiasActiveRef.current) {
          planarBiasActiveRef.current = false;
          const baseline = clampRange(biasBaselineRef.current, 0, 1);
          if (!driveState.splitEnabled || Math.abs(driveState.splitFrac - baseline) > 1e-3) {
            setSplit(true, baseline);
          }
          scheduleNegFractionUpdate(1 - baseline);
          const fd = useFlightDirectorStore.getState();
          if (Math.abs(fd.thrustBias01 - baseline) > 1e-3) {
            fd.setThrustBias01(baseline);
          }
        }
        return;
      }

      planarBiasActiveRef.current = true;
      const eased = 1 - Math.pow(1 - magnitude, 2);
      const targetSplit = clampRange(
        0.5 + PLANAR_BIAS_DELTA_MAX * eased,
        0.5 - PLANAR_BIAS_DELTA_MAX,
        0.5 + PLANAR_BIAS_DELTA_MAX
      );
      if (!driveState.splitEnabled || Math.abs(driveState.splitFrac - targetSplit) > 1e-3) {
        setSplit(true, targetSplit);
      }
      scheduleNegFractionUpdate(1 - targetSplit);
      const fd = useFlightDirectorStore.getState();
      if (Math.abs(fd.thrustBias01 - targetSplit) > 1e-3) {
        fd.setThrustBias01(targetSplit);
      }
    },
    [setSplit, scheduleNegFractionUpdate]
  );

  const applyRiseIntentShaping = useCallback(
    (
      riseValue: number,
      autopEnabled: boolean,
      geometryState: { sigmaSectors: number; sectorFloor: number }
    ) => {
      const riseAbs = Math.abs(clampRange(riseValue, -1, 1));
      const shouldShape = autopEnabled && riseAbs > RISE_INTENT_DEADBAND;
      if (!shouldShape) {
        if (riseShapingActiveRef.current) {
          riseShapingActiveRef.current = false;
          const sigmaTarget = clampRange(sigmaBaselineRef.current, 0.25, 8);
          const floorTarget = clampRange(floorBaselineRef.current, 0, 0.99);
          if (Math.abs(sigmaTarget - geometryState.sigmaSectors) > 1e-3) {
            setSigmaStore(sigmaTarget);
          }
          if (Math.abs(floorTarget - geometryState.sectorFloor) > 1e-3) {
            setFloorStore(floorTarget);
          }
        }
        return;
      }

      riseShapingActiveRef.current = true;
      const sigmaBase = clampRange(sigmaBaselineRef.current, 0.25, 8);
      const floorBase = clampRange(floorBaselineRef.current, 0, 0.99);
      const sigmaTarget = clampRange(sigmaBase * (1 - 0.15 * riseAbs), 0.25, 8);
      const floorTarget = clampRange(floorBase + 0.1 * riseAbs, 0, 0.99);
      if (Math.abs(sigmaTarget - geometryState.sigmaSectors) > 1e-3) {
        setSigmaStore(sigmaTarget);
      }
      if (Math.abs(floorTarget - geometryState.sectorFloor) > 1e-3) {
        setFloorStore(floorTarget);
      }
    },
    [setSigmaStore, setFloorStore]
  );

  useEffect(() => {
    const unsubscribe = useDriveSyncStore.subscribe((state) => {
      const value = state.intent;
      intentRef.current = value;
      const rise = clampRange(value.z, -1, 1);
      const planar = clampRange(Math.hypot(value.x, value.y), 0, 1);
      const cb = onVizIntentRef.current;
      if (cb) {
        cb({ rise, planar });
      }
      const director = useFlightDirectorStore.getState();
      const autopEnabled = director.enabled && director.mode === "MAN";
      applyPlanarIntentBias(planar, autopEnabled, {
        splitEnabled: state.splitEnabled,
        splitFrac: typeof state.splitFrac === "number" ? state.splitFrac : 0.5,
      });
      applyRiseIntentShaping(rise, autopEnabled, {
        sigmaSectors: typeof state.sigmaSectors === "number" ? state.sigmaSectors : 0.25,
        sectorFloor: typeof state.sectorFloor === "number" ? state.sectorFloor : 0.2,
      });
    });
    return unsubscribe;
  }, [applyPlanarIntentBias, applyRiseIntentShaping]);

  const onModeChange = (next: string) => {
    if (!next) return;
    const state = useFlightDirectorStore.getState();
    const desired = next === "HDG" ? "HDG" : "MAN";
    state.setMode(desired);
    if (desired === "HDG") {
      state.setTargetYaw01(phaseRef.current ?? 0);
      desiredYawAxisRef.current = 0;
      resetYawProfile();
    }
    if (desired === "MAN") {
      state.zeroRate();
      state.setYawRateCmd(0);
      desiredYawAxisRef.current = 0;
      resetYawProfile();
    }
  };

  const onCouplingChange = (next: string) => {
    if (!next) return;
    const state = useFlightDirectorStore.getState();
    state.setCoupling(next === "coupled" ? "coupled" : "decoupled");
  };

  const onYawRateLimitChange = (values: number[]) => {
    const rate = clampRange(values[0] ?? flightMaxYawRate, 10, 180);
    const state = useFlightDirectorStore.getState();
    state.setLimits(rate, state.maxYawAccel_dps2);
  };

  const onYawAccelLimitChange = (values: number[]) => {
    const accel = clampRange(values[0] ?? flightMaxYawAccel, 30, 720);
    const state = useFlightDirectorStore.getState();
    state.setLimits(state.maxYawRate_dps, accel);
  };

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const key = normalizeKey(event.key);

      if (key === "h") {
        event.preventDefault();
        const state = useFlightDirectorStore.getState();
        state.setMode("HDG");
        state.setTargetYaw01(phaseRef.current ?? 0);
        state.zeroRate();
        state.setYawRateCmd(0);
        desiredYawAxisRef.current = 0;
        resetYawProfile();
        return;
      }
      if (key === "m") {
        event.preventDefault();
        const state = useFlightDirectorStore.getState();
        state.setMode("MAN");
        state.zeroRate();
        state.setYawRateCmd(0);
        desiredYawAxisRef.current = 0;
        resetYawProfile();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        const state = useFlightDirectorStore.getState();
        state.setCoupling(state.coupling === "coupled" ? "decoupled" : "coupled");
        return;
      }

      const allowed =
        MANUAL_FLIGHT_KEY_NAMES.has(key) || MANUAL_FLIGHT_KEY_CODES.has(event.code);
      if (!allowed) {
        return;
      }

      event.preventDefault();
      handleVirtualKeyPress(event.key);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const key = normalizeKey(event.key);
      const allowed =
        MANUAL_FLIGHT_KEY_NAMES.has(key) || MANUAL_FLIGHT_KEY_CODES.has(event.code);
      if (!allowed) {
        return;
      }

      event.preventDefault();
      handleVirtualKeyRelease(event.key);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      pressedKeysRef.current.clear();
      syncPressedKeys();
      setIntent({ x: 0, y: 0, z: 0 });
      desiredYawAxisRef.current = 0;
      resetYawProfile();
      const state = useFlightDirectorStore.getState();
      state.setYawRateCmd(0);
      state.setRise(0);
    };
  }, [
    handleVirtualKeyPress,
    handleVirtualKeyRelease,
    normalizeKey,
    resetYawProfile,
    setIntent,
    syncPressedKeys,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dtRaw = (now - last) / 1000;
      last = now;
      const dtManual = clampRange(dtRaw, MIN_RAF_DT_S, MAX_RAF_DT_S);
      const dtTick = Math.max(0, dtRaw);

      const state = useFlightDirectorStore.getState();
      const manualActive = state.enabled && state.mode === "MAN";
      const rawAxis = manualActive ? desiredYawAxisRef.current : 0;
      const shapedAxis = shapeAxis(rawAxis);
      const hysteresisAxis = applyAxisHysteresis(shapedAxis, lastYawAxisRef.current);
      lastYawAxisRef.current = hysteresisAxis;

      const rateLimit = Math.max(0, state.maxYawRate_dps);
      const accelLimit = Math.max(0, state.maxYawAccel_dps2);
      const jerkLimit = accelLimit > 0 ? accelLimit * JERK_MULTIPLIER : 0;
      const desiredRate = hysteresisAxis * rateLimit;

      yawProfileRef.current = sCurveStep(
        yawProfileRef.current,
        desiredRate,
        dtManual,
        accelLimit,
        jerkLimit,
        rateLimit
      );

      if (!manualActive && Math.abs(yawProfileRef.current.v_dps) < 1e-3) {
        resetYawProfile();
      }

      state.setYawRateCmd(yawProfileRef.current.v_dps);

      if (state.enabled) {
        if (phaseModeRef.current !== "manual") {
          setPhaseMode("manual");
          phaseModeRef.current = "manual";
        }
        const current = phaseRef.current ?? 0;
        const { nextYaw01 } = state.tick(dtTick, current);
        if (Number.isFinite(nextYaw01) && Math.abs(nextYaw01 - current) > 1e-6) {
          phaseRef.current = nextYaw01;
          setPhase(nextYaw01);
        }
      }

      raf = window.requestAnimationFrame(step);
    };

    raf = window.requestAnimationFrame((time) => {
      last = time;
      step(time);
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [resetYawProfile, setPhase, setPhaseMode]);

  const splitBiasPercent = Math.round(Math.abs(splitFrac - 0.5) * 200);

  useEffect(() => {
    if (!onVizIntent) {
      return;
    }
    const current = intentRef.current;
    const rise = clampRange(current.z, -1, 1);
    const planar = clampRange(Math.hypot(current.x, current.y), 0, 1);
    onVizIntent({ rise, planar });
    return () => {
      onVizIntent({ rise: 0, planar: 0 });
    };
  }, [onVizIntent]);

  return (
    <Card className={cn("p-3 space-y-4", className)}>
      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
        Experimental flight-director and sector-scheduler controls. Input changes local drive/flight state and
        can update the live pipeline negativeFraction; it does not establish steering, propulsion, transport,
        or selected-run NHM2 evidence.
      </div>
      {controlMode === "simple" && (
        <div className="sticky top-2 z-20 -mx-3 -mt-3 rounded-t-md border-b border-border/60 bg-card/95 px-3 pb-3 pt-3 shadow-sm supports-[backdrop-filter]:backdrop-blur">
          <div className="text-center text-xs text-muted-foreground">
            Tap or press W/A/S/D (or arrows) for lateral intent; Space and Shift set vertical intent.
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {SIMPLE_KEY_LAYOUT.map(({ label, keys, className: keyClass, ariaLabel }) => (
              <React.Fragment key={label}>
                {renderKeyCap(label, {
                  keys,
                  className: keyClass,
                  ariaLabel,
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Yaw (heading)</Badge>
          <HeadingBadge />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Mode</span>
          <Select value={controlMode} onValueChange={handleModeChange}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="simple">Simple controls</SelectItem>
              <SelectItem value="advanced">Advanced controls</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {controlMode === "advanced" && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Heading rotates the equatorial lobe pair; pitch and roll are not driven.
        </div>
      )}

      {controlMode === "simple" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DriveIntentReadout />
            <Button variant="outline" size="sm" onClick={holdStation}>
              Center split / zero yaw
            </Button>
          </div>
          <div className="text-[0.7rem] leading-5 text-muted-foreground">
            Tap H to capture heading, M to return to manual, C to toggle scheduler coupling.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
          <div className="space-y-3">
            <div className="rounded-md border border-dashed p-3 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Flight Director
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {flightMode} | {flightCoupling} | {Math.round(flightYawRate)} deg/s
                  </div>
                </div>
                <Button
                  variant={flightEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const state = useFlightDirectorStore.getState();
                    state.setEnabled(!state.enabled);
                    if (!state.enabled) {
                      state.setYawRateCmd(0);
                      state.zeroRate();
                    }
                  }}
                >
                  {flightEnabled ? "Disable" : "Enable"}
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Mode
                  </span>
                  <ToggleGroup type="single" value={flightMode} onValueChange={onModeChange}>
                    <ToggleGroupItem value="MAN">MAN (rate)</ToggleGroupItem>
                    <ToggleGroupItem value="HDG">HDG (hold)</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="space-y-1">
                  <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Coupling
                  </span>
                  <ToggleGroup type="single" value={flightCoupling} onValueChange={onCouplingChange}>
                    <ToggleGroupItem value="decoupled">Decoupled</ToggleGroupItem>
                    <ToggleGroupItem value="coupled">Coupled</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Max yaw rate</span>
                    <span>{Math.round(flightMaxYawRate)} deg/s</span>
                  </div>
                  <Slider
                    min={10}
                    max={180}
                    step={5}
                    value={[flightMaxYawRate]}
                    onValueChange={onYawRateLimitChange}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Max yaw accel</span>
                    <span>{Math.round(flightMaxYawAccel)} deg/s^2</span>
                  </div>
                  <Slider
                    min={30}
                    max={720}
                    step={10}
                    value={[flightMaxYawAccel]}
                    onValueChange={onYawAccelLimitChange}
                  />
                </div>
              </div>
              <div className="text-[0.7rem] text-muted-foreground leading-5">
                A/D (or Left/Right) command rate, W/S bias split, Space lifts, Shift dips. Tap H to capture heading,
                M to return to manual, C to toggle scheduler coupling.
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Flight intent
                  </div>
                  <div className="text-xs text-muted-foreground">
                    WASD / arrows steer laterally, Space lifts, Shift dips.
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={holdStation}>
                  Center split / zero yaw
                </Button>
              </div>
              <DriveIntentReadout />
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Visual nudge</span>
                  <Badge variant="outline">{Math.round(nudge01 * 100)}%</Badge>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={[nudge01]}
                  onValueChange={(values) => {
                    const value = Array.isArray(values) ? values[0] ?? nudge01 : nudge01;
                    setNudge01(value);
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>sigma (sectors)</span>
                  <Badge variant="outline">{sigmaSectors.toFixed(2)}</Badge>
                </div>
                <Slider
                  min={0.25}
                  max={8}
                  step={0.25}
                  value={[sigmaSectors]}
                  onValueChange={(values) => {
                    const value = Array.isArray(values) ? values[0] ?? sigmaSectors : sigmaSectors;
                    setSigmaStore(clampRange(value, 0.25, 8));
                  }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Floor</span>
                  <Badge variant="outline">{floor.toFixed(2)}</Badge>
                </div>
                <Slider
                  min={0}
                  max={0.99}
                  step={0.01}
                  value={[floor]}
                  onValueChange={(values) => {
                    const value = Array.isArray(values) ? values[0] ?? floor : floor;
                    setFloorStore(clampRange(value, 0, 0.99));
                  }}
                />
              </div>
            </div>
          </div>

          <HeadingRoseControls
            splitFrac={splitFrac}
            splitBiasPercent={splitBiasPercent}
            flightBias={flightBias}
            onBiasChange={onBiasChange}
            setHeading={setHeading}
          />
        </div>
      )}
    </Card>
  );
}
