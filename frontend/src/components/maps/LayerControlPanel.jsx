import {
  SUB_MODE_GENERAL,
  SUB_MODE_SPECIFIC,
  EMPLOYER_STABILITY_COLORS,
  EMPLOYER_STABILITY_LABELS,
} from '../../types/employerMap';

const LAYER_DEFS = [
  { key: 'jobConcentration', label: 'Job Concentration', desc: 'Shaded by total job count per area', modes: false },
  { key: 'wageGeography', label: 'Wage Geography', desc: 'Shaded by average hourly wage', modes: true },
  { key: 'employerStability', label: 'Employer Stability', desc: 'Shaded by wage variance (stability)', modes: true },
];

export default function LayerControlPanel({ layerState, setLayerState, stats, hexRadius, setHexRadius }) {
  const toggle = (key) => {
    setLayerState((prev) => {
      if (!prev[key]) {
        const next = {};
        for (const k of Object.keys(prev)) {
          next[k] = k === key || k === 'wageMode' || k === 'stabilityMode' ? prev[k] : false;
        }
        next[key] = true;
        return next;
      }
      return { ...prev, [key]: false };
    });
  };

  const setSubMode = (key, mode) => {
    setLayerState((prev) => ({ ...prev, [key]: mode }));
  };

  const activeLayer = LAYER_DEFS.find((d) => layerState[d.key]);

  const isSpecificMode =
    (activeLayer?.key === 'wageGeography' && layerState.wageMode === 'specific') ||
    (activeLayer?.key === 'employerStability' && layerState.stabilityMode === 'specific');

  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground">
      <h3 className="text-base font-semibold text-foreground">Employer Layers</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {LAYER_DEFS.map((layer) => {
          const active = layerState[layer.key];
          return (
            <button
              key={layer.key}
              type="button"
              onClick={() => toggle(layer.key)}
              className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] leading-tight transition-all ${
                active
                  ? 'border-accent/20 bg-accent/10 text-foreground shadow-sm'
                  : 'border-border/60 bg-card/80 text-muted-foreground hover:border-border'
              }`}
              title={layer.desc}
            >
              <span className="font-medium">{layer.label}</span>
            </button>
          );
        })}
      </div>

      {activeLayer && activeLayer.modes && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">Mode:</span>
          <div className="flex rounded-md border border-border/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setSubMode(activeLayer.key === 'wageGeography' ? 'wageMode' : 'stabilityMode', SUB_MODE_GENERAL)}
              className={`px-2 py-0.5 cursor-pointer transition-colors ${
                layerState[activeLayer.key === 'wageGeography' ? 'wageMode' : 'stabilityMode'] === SUB_MODE_GENERAL
                  ? 'bg-accent/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground bg-card/60'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setSubMode(activeLayer.key === 'wageGeography' ? 'wageMode' : 'stabilityMode', SUB_MODE_SPECIFIC)}
              className={`px-2 py-0.5 cursor-pointer transition-colors ${
                layerState[activeLayer.key === 'wageGeography' ? 'wageMode' : 'stabilityMode'] === SUB_MODE_SPECIFIC
                  ? 'bg-accent/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground bg-card/60'
              }`}
            >
              Specific
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[2px] bg-accent/60" />
          Building Footprints
        </span>
      </div>

      {!isSpecificMode && (
        <div className="mt-3 border-t border-border/60 pt-2">
          <label className="flex items-center justify-between text-[11px] font-medium text-foreground">
            <span>Hexagon Grid Size</span>
            <span className="tabular-nums text-muted-foreground">{hexRadius}px</span>
          </label>
          <input
            type="range"
            min="5"
            max="50"
            value={hexRadius}
            onChange={(e) => setHexRadius(Number(e.target.value))}
            className="mt-1 w-full cursor-pointer accent-[var(--accent)]"
          />
        </div>
      )}

      {activeLayer && (
        <div className="mt-2 border-t border-border/60 pt-2 text-[11px]">
          {activeLayer.key === 'jobConcentration' && (
            <>
              <span className="font-medium text-foreground">Job Concentration</span>
              <div className="mt-0.5 text-muted-foreground">Hexagons shaded by total job count</div>
              <div className="mt-1 h-2 w-full rounded-sm"
                style={{ background: 'linear-gradient(to right, #d73027, #ffffbf, #1a9850)' }}
              />
            </>
          )}
          {activeLayer.key === 'wageGeography' && layerState.wageMode === SUB_MODE_GENERAL && (
            <>
              <span className="font-medium text-foreground">Wage (General)</span>
              <div className="mt-0.5 text-muted-foreground">Hexagons show the average hourly wage of jobs in that area</div>
              <div className="mt-1 h-2 w-full rounded-sm"
                style={{ background: 'linear-gradient(to right, #d73027, #ffffbf, #1a9850)' }}
              />
              {stats && (
                <div className="mt-0.5 flex justify-between text-[10px]">
                  <span>${stats.minWage?.toFixed(1)}</span>
                  <span>${stats.maxWage?.toFixed(1)}</span>
                </div>
              )}
            </>
          )}
          {activeLayer.key === 'wageGeography' && layerState.wageMode === SUB_MODE_SPECIFIC && (
            <>
              <span className="font-medium text-foreground">Wage (Specific)</span>
              <div className="mt-0.5 text-muted-foreground">Building color reflects the employer's average hourly wage</div>
              <div className="mt-1 h-2 w-full rounded-sm"
                style={{ background: 'linear-gradient(to right, #d73027, #ffffbf, #1a9850)' }}
              />
            </>
          )}
          {activeLayer.key === 'employerStability' && (
            <>
              <span className="font-medium text-foreground">Stability</span>
              <div className="mt-0.5 text-muted-foreground">
                {layerState.stabilityMode === SUB_MODE_GENERAL ? 'Hexagons aggregate a composite score: wage consistency, schedule regularity, and role diversity penalize high variance — red is unstable, green is stable' : 'Building color reflects the employer\'s composite stability score'}
              </div>
              {Object.entries(EMPLOYER_STABILITY_COLORS).map(([key, color]) => (
                <div key={key} className="mt-0.5 flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-[2px]" style={{ backgroundColor: color }} />
                  <span>{EMPLOYER_STABILITY_LABELS[key]}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
