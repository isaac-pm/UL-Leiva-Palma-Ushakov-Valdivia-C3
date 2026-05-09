import { useEffect, useRef, useState } from 'react';
import WorkforceMatrixChart from './utils/d3/WorkforceMatrixChart';
import { customfetch } from './utils/api';
import AnalysisHeader from './components/AnalysisHeader';

const SECTOR_COLORS = {
  Education: '#16a34a',
  Hospitality: '#db2777',
  Housing: '#1a56db',
  'General Services': '#9333ea',
  Other: '#6b7280',
};

const WorkforceLifecycle = () => {
  const containerRef = useRef(null);
  const chartInstance = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visibleSectors, setVisibleSectors] = useState(new Set());
  const [volatilityRange, setVolatilityRange] = useState([0, 2]);
  const [maxVolatility, setMaxVolatility] = useState(2);
  const [cellMetric, setCellMetric] = useState('headcount');
  const [sortBy, setSortBy] = useState('avgHeadcount');

  useEffect(() => {
    let mounted = true;
    const abortController = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        const response = await customfetch('/api/workforce/aggregate', {
          signal: abortController.signal,
        });

        if (!response?.data?.data) {
          throw new Error('Server returned empty response');
        }

        const result = response.data.data;
        if (!mounted) return;

        if (!result.employers || !Array.isArray(result.employers)) {
          throw new Error('Invalid data format from server');
        }

        setData(result);
        setVisibleSectors(new Set(result.sectors || []));
        const maxV = result.aggregates?.maxVolatility || 2;
        setMaxVolatility(maxV);
        setVolatilityRange([0, maxV]);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        if (err.name === 'AbortError') return;
        setError(err.message || 'Unable to load workforce data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || chartInstance.current) return;
    chartInstance.current = new WorkforceMatrixChart(containerRef.current);
    chartInstance.current.create();

    return () => {
      chartInstance.current?.destroy();
      chartInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartInstance.current || !data) return;
    chartInstance.current.update(data);
  }, [data]);

  useEffect(() => {
    if (!chartInstance.current || !data) return;
    chartInstance.current.setVisibleSectors(Array.from(visibleSectors));
  }, [visibleSectors, data]);

  useEffect(() => {
    if (!chartInstance.current) return;
    chartInstance.current.setVolatilityRange(volatilityRange);
  }, [volatilityRange]);

  useEffect(() => {
    if (!chartInstance.current || !data) return;
    chartInstance.current.setCellMetric(cellMetric);
  }, [cellMetric, data]);

  useEffect(() => {
    if (!chartInstance.current || !data) return;
    chartInstance.current.setSortBy(sortBy);
  }, [sortBy, data]);



  const toggleSector = (sector) => {
    setVisibleSectors(prev => {
      const next = new Set(prev);
      if (next.has(sector)) {
        next.delete(sector);
      } else {
        next.add(sector);
      }
      return next;
    });
  };

  const selectAllSectors = () => {
    if (data?.sectors) setVisibleSectors(new Set(data.sectors));
  };

  const clearAllSectors = () => {
    setVisibleSectors(new Set());
  };

  const sectors = data?.sectors || [];
  const aggregates = data?.aggregates || {};

  return (
    <div className="mx-auto w-full max-w-[90rem] px-6 py-6">
      <AnalysisHeader
        overline="Employer Health & Turnover"
        title="Workforce Timeline Matrix"
        subtitle="Heatmap rows: each employer's monthly headcount or turnover. Right columns: aggregate KPIs with threshold coloring."
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-sm text-muted-foreground" style={{ minHeight: 200 }}>
              Loading workforce data...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-red-500" style={{ minHeight: 200 }}>
              {error}
            </div>
          )}
          <div
            ref={containerRef}
          />
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground">
            <h3 className="text-base font-semibold text-foreground mb-2">Controls</h3>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-foreground">Sectors</span>
                <div className="flex gap-1">
                  <button
                    onClick={selectAllSectors}
                    className="text-[10px] px-2 py-0.5 rounded border border-border/60 hover:bg-accent/10 text-muted-foreground"
                  >
                    All
                  </button>
                  <button
                    onClick={clearAllSectors}
                    className="text-[10px] px-2 py-0.5 rounded border border-border/60 hover:bg-accent/10 text-muted-foreground"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {sectors.map((s) => (
                  <div key={s} className="flex items-center gap-1">
                    <label
                      className="flex flex-1 items-center gap-2 cursor-pointer py-0.5 rounded hover:bg-accent/5"
                      onClick={() => toggleSector(s)}
                    >
                      <input
                        type="checkbox"
                        checked={visibleSectors.has(s)}
                        readOnly
                        className="rounded"
                      />
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: SECTOR_COLORS[s] || '#6b7280' }}
                      />
                      <span className="text-xs text-foreground truncate">{s}</span>
                    </label>
                    <button
                      onClick={() => setVisibleSectors(new Set([s]))}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground hover:bg-accent/10 hover:text-foreground shrink-0"
                      title={`Show only ${s}`}
                    >
                      solo
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <span className="text-xs font-medium text-foreground">Cell Metric</span>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setCellMetric('headcount')}
                  className={`text-[10px] px-2 py-1 rounded border ${cellMetric === 'headcount' ? 'bg-accent text-white border-accent' : 'border-border/60 text-muted-foreground hover:bg-accent/10'}`}
                >
                  Headcount
                </button>
                <button
                  onClick={() => setCellMetric('turnover')}
                  className={`text-[10px] px-2 py-1 rounded border ${cellMetric === 'turnover' ? 'bg-accent text-white border-accent' : 'border-border/60 text-muted-foreground hover:bg-accent/10'}`}
                >
                  Turnover
                </button>
              </div>
            </div>

            <div className="mb-4">
              <span className="text-xs font-medium text-foreground">Sort Rows</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="mt-1 w-full rounded border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground"
              >
                <option value="avgHeadcount">Avg Headcount ↓</option>
                <option value="totalTurnover">Total Turnover ↓</option>
                <option value="volatilityIndex">Volatility Index ↓</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-foreground">Volatility Range</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {volatilityRange[0].toFixed(2)} – {volatilityRange[1].toFixed(2)}
                </span>
              </div>
              <div className="relative h-6 mt-1">
                <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-border" />
                <div
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-purple-500"
                  style={{
                    left: `${(volatilityRange[0] / (maxVolatility || 2)) * 100}%`,
                    width: `${((volatilityRange[1] - volatilityRange[0]) / (maxVolatility || 2)) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={maxVolatility || 2}
                  step={0.05}
                  value={volatilityRange[0]}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolatilityRange(prev => [Math.min(v, prev[1]), prev[1]]);
                  }}
                  className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                />
                <input
                  type="range"
                  min={0}
                  max={maxVolatility || 2}
                  step={0.05}
                  value={volatilityRange[1]}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolatilityRange(prev => [prev[0], Math.max(v, prev[0])]);
                  }}
                  className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Show employers with volatility index between the two values.
              </p>
            </div>
          </div>

          {aggregates.totalEmployers && (
            <div className="rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground">
              <h3 className="text-xs font-semibold text-foreground mb-2">Dataset Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Employers:</span>{' '}
                  <span className="text-foreground font-medium">{aggregates.totalEmployers}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max HC:</span>{' '}
                  <span className="text-foreground font-medium">{aggregates.maxHeadcount || 0}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Volatility:</span>{' '}
                  <span className="text-foreground font-medium">{(aggregates.maxVolatility || 0).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Turnover:</span>{' '}
                  <span className="text-foreground font-medium">{aggregates.maxTurnover || 0}</span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground">
            <h3 className="text-xs font-semibold text-foreground mb-2">Legend</h3>
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-3 rounded" style={{background: 'linear-gradient(to right, #f7fbff, #2171b5)'}} />
                <span>Blue cells = headcount volume</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-3 rounded" style={{background: 'linear-gradient(to right, #feedde, #a63603)'}} />
                <span>Orange cells = turnover activity</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded bg-red-500" />
                <span>Volatility &gt; 1.0 (high churn)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded bg-amber-500" />
                <span>Volatility 0.5–1.0 (moderate)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded bg-green-500" />
                <span>Volatility &le; 0.5 (stable)</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default WorkforceLifecycle;
