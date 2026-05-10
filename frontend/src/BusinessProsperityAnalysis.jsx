import { useEffect, useMemo, useRef, useState } from 'react';
import AnalysisHeader from './components/AnalysisHeader';
import { customfetch } from './utils/api';

const typeColors = {
  Restaurant: '#0072b2',
  Pub: '#d55e00',
};

const formatMoney = (value) => {
  if (!Number.isFinite(value)) return '$0';
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
};

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString();
};

const classifyBusiness = (item, sorted) => {
  if (!sorted.length) return 'Stable';
  const rank = sorted.findIndex((row) =>
    row.businessId === item.businessId && row.businessType === item.businessType
  );
  const topCutoff = Math.max(1, Math.ceil(sorted.length * 0.25));
  const bottomCutoff = Math.floor(sorted.length * 0.75);

  if (rank >= 0 && rank < topCutoff) return 'Prosperous';
  if (rank >= bottomCutoff || item.trendDelta < 0) return 'Watch';
  return 'Stable';
};

const MiniTrend = ({ data }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const points = data || [];
  if (points.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-border/60 text-xs text-muted-foreground">
        No monthly trend available
      </div>
    );
  }

  const width = 320;
  const height = 116;
  const maxRevenue = Math.max(...points.map((d) => d.estimatedRevenue), 1);
  const path = points
    .map((d, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - (d.estimatedRevenue / maxRevenue) * (height - 16) - 8;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full overflow-visible">
        <line x1="0" y1={height - 8} x2={width} y2={height - 8} stroke="var(--border)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" />
        {points.map((d, index) => {
          const x = (index / Math.max(points.length - 1, 1)) * width;
          const y = height - (d.estimatedRevenue / maxRevenue) * (height - 16) - 8;
          return (
            <circle
              key={d.month}
              cx={x}
              cy={y}
              r="5"
              fill="var(--card)"
              stroke="var(--accent)"
              strokeWidth="2"
              onMouseMove={() => setHoveredPoint({ ...d, x: (x / width) * 100, y })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          );
        })}
      </svg>
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 w-44 rounded-md bg-black/85 px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: `${Math.min(hoveredPoint.x, 68)}%`,
            top: Math.max(0, hoveredPoint.y - 12),
          }}
        >
          <div className="font-semibold">
            {new Date(`${hoveredPoint.month}T00:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              year: 'numeric',
            })}
          </div>
          <div className="mt-1 text-white/75">
            {formatMoney(hoveredPoint.estimatedRevenue)} estimated sales
          </div>
          <div className="text-white/75">
            {formatNumber(hoveredPoint.visitCount)} visits
          </div>
          <div className="text-white/75">
            {formatNumber(hoveredPoint.uniqueCustomers)} customers
          </div>
        </div>
      )}
    </div>
  );
};

const PortfolioScatterplot = ({ items, selected, onSelect, hovered, onHover }) => {
  if (!items.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-border/60 text-sm text-muted-foreground">
        No businesses match the current filter
      </div>
    );
  }

  const width = 620;
  const height = 340;
  const margin = { top: 28, right: 36, bottom: 52, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxCustomers = Math.max(...items.map((item) => item.uniqueCustomers), 1);
  const maxRevenue = Math.max(...items.map((item) => item.estimatedRevenue), 1);
  const maxVisits = Math.max(...items.map((item) => item.visitCount), 1);

  const project = (item) => {
    return {
      x: margin.left + (item.uniqueCustomers / maxCustomers) * plotWidth,
      y: margin.top + plotHeight - (item.estimatedRevenue / maxRevenue) * plotHeight,
    };
  };

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxCustomers * ratio));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maxRevenue * ratio);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[30rem] w-full rounded-lg border border-border/60 bg-background">
      <rect x="16" y="16" width={width - 32} height={height - 32} rx="8" fill="var(--card)" />
      <g>
        {xTicks.map((tick) => {
          const x = margin.left + (tick / maxCustomers) * plotWidth;
          return (
            <g key={`x-${tick}`}>
              <line x1={x} y1={margin.top} x2={x} y2={margin.top + plotHeight} stroke="var(--border)" strokeOpacity="0.45" />
              <text x={x} y={height - 24} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                {formatNumber(tick)}
              </text>
            </g>
          );
        })}
        {yTicks.map((tick) => {
          const y = margin.top + plotHeight - (tick / maxRevenue) * plotHeight;
          return (
            <g key={`y-${tick}`}>
              <line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke="var(--border)" strokeOpacity="0.45" />
              <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
                {formatMoney(tick)}
              </text>
            </g>
          );
        })}
        <line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" />
        <text x={margin.left + plotWidth / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
          Unique customers
        </text>
        <text
          x="18"
          y={margin.top + plotHeight / 2}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted-foreground)"
          transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`}
        >
          Estimated sales
        </text>
      </g>
      {items.map((item) => {
        const point = project(item);
        const isSelected = selected
          && selected.businessId === item.businessId
          && selected.businessType === item.businessType;
        const radius = 5 + Math.sqrt(item.visitCount / maxVisits) * 17;
        return (
          <g
            key={`${item.businessType}-${item.businessId}`}
            role="button"
            tabIndex="0"
            onClick={() => onSelect(item)}
            onMouseMove={(event) => onHover(item, event)}
            onMouseLeave={() => onHover(null, null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(item);
            }}
            className="cursor-pointer"
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={typeColors[item.businessType] || '#666'}
              opacity={isSelected || hovered === item ? 1 : 0.82}
              stroke={isSelected ? '#ffffff' : 'var(--card)'}
              strokeWidth={isSelected || hovered === item ? 4 : 2}
            />
            {isSelected && (
              <text
                x={point.x + radius + 6}
                y={point.y + 4}
                fontSize="11"
                fill="var(--foreground)"
              >
                {item.businessType} {item.businessId}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const BusinessProsperityAnalysis = () => {
  const portfolioRef = useRef(null);
  const rankingRowRefs = useRef({});
  const [businesses, setBusinesses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [hoveredBusiness, setHoveredBusiness] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');
  const [sortKey, setSortKey] = useState('prosperityScore');

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await customfetch('/api/business-prosperity/summary');
        const data = response?.data?.data || [];
        if (!isMounted) return;
        setBusinesses(data);
        setSelected(data[0] || null);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Unable to load business prosperity data');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setTimeseries([]);
      return;
    }

    let isMounted = true;
    const loadDetail = async () => {
      try {
        setDetailLoading(true);
        const response = await customfetch(
          `/api/business-prosperity/${selected.businessType}/${selected.businessId}/timeseries`
        );
        if (isMounted) setTimeseries(response?.data?.data || []);
      } catch {
        if (isMounted) setTimeseries([]);
      } finally {
        if (isMounted) setDetailLoading(false);
      }
    };

    loadDetail();

    return () => {
      isMounted = false;
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const key = `${selected.businessType}-${selected.businessId}`;
    rankingRowRefs.current[key]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [selected]);

  const sortedBusinesses = useMemo(() => {
    return [...businesses].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  }, [businesses, sortKey]);

  const filteredBusinesses = useMemo(() => {
    return sortedBusinesses.filter((item) =>
      typeFilter === 'All' ? true : item.businessType === typeFilter
    );
  }, [sortedBusinesses, typeFilter]);

  const summary = useMemo(() => {
    const totalRevenue = businesses.reduce((sum, item) => sum + item.estimatedRevenue, 0);
    const totalVisits = businesses.reduce((sum, item) => sum + item.visitCount, 0);
    const growing = businesses.filter((item) => item.trendDelta > 0).length;
    const watched = businesses.filter((item) => classifyBusiness(item, sortedBusinesses) === 'Watch').length;
    return { totalRevenue, totalVisits, growing, watched };
  }, [businesses, sortedBusinesses]);

  const visibleRows = filteredBusinesses;
  const maxRevenue = Math.max(...visibleRows.map((item) => item.estimatedRevenue), 1);

  const handlePortfolioHover = (item, event) => {
    if (!item || !event || !portfolioRef.current) {
      setHoveredBusiness(null);
      return;
    }

    const rect = portfolioRef.current.getBoundingClientRect();
    setHoveredBusiness({
      item,
      x: Math.min(event.clientX - rect.left + 12, rect.width - 220),
      y: Math.max(12, event.clientY - rect.top - 24),
    });
  };

  return (
    <div className="mx-auto w-full max-w-[90rem] px-6 py-6 text-left">
      <AnalysisHeader
        overline="Challenge 3"
        title="Business Prosperity Analysis"
        subtitle="Restaurants and pubs ranked by demand, estimated revenue, customer reach, and change across the dataset."
        right={(
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-muted-foreground">Estimated sales</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(summary.totalRevenue)}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-muted-foreground">Visits</p>
              <p className="text-sm font-semibold text-foreground">{formatNumber(summary.totalVisits)}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-muted-foreground">Growing</p>
              <p className="text-sm font-semibold text-foreground">{formatNumber(summary.growing)}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-muted-foreground">Watch list</p>
              <p className="text-sm font-semibold text-foreground">{formatNumber(summary.watched)}</p>
            </div>
          </div>
        )}
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {['All', 'Restaurant', 'Pub'].map((type) => (
            <button
              key={type}
              type="button"
              className={`rounded-md border px-3 py-2 text-sm transition ${
                typeFilter === type
                  ? 'border-transparent bg-accent text-white'
                  : 'border-border/60 bg-card text-foreground'
              }`}
              onClick={() => setTypeFilter(type)}
            >
              {type}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select
            className="rounded-md border border-border/60 bg-card px-3 py-2 text-foreground"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
          >
            <option value="prosperityScore">Prosperity score</option>
            <option value="estimatedRevenue">Estimated revenue</option>
            <option value="visitCount">Visits</option>
            <option value="uniqueCustomers">Unique customers</option>
            <option value="trendDelta">Visit change</option>
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Prosperity ranking</h2>
              <p className="text-xs text-muted-foreground">
                Score combines estimated sales, visits, and customer reach.
              </p>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: typeColors.Restaurant }} />
                Restaurant
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: typeColors.Pub }} />
                Pub
              </span>
            </div>
          </div>

          {loading && (
            <div className="mt-4 rounded-lg bg-background p-6 text-center text-sm text-muted-foreground">
              Loading business summary...
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg bg-background p-6 text-center text-sm text-red-500">
              {error}
            </div>
          )}
          {!loading && !error && (
            <div className="mt-4 max-h-[48rem] overflow-y-auto rounded-lg border border-border/60">
              {visibleRows.map((item) => {
                const status = classifyBusiness(item, sortedBusinesses);
                const isSelected = selected
                  && selected.businessId === item.businessId
                  && selected.businessType === item.businessType;
                return (
                  <button
                    key={`${item.businessType}-${item.businessId}`}
                    ref={(node) => {
                      rankingRowRefs.current[`${item.businessType}-${item.businessId}`] = node;
                    }}
                    type="button"
                    onClick={() => setSelected(item)}
                    className={`grid w-full grid-cols-[150px_minmax(140px,1fr)_100px_95px_80px] items-center gap-3 border-b border-border/60 px-3 py-3 text-left text-sm last:border-b-0 ${
                      isSelected ? 'bg-accent/10' : 'bg-background hover:bg-accent/5'
                    }`}
                  >
                    <span>
                      <span className="font-semibold text-foreground">
                        {item.businessType} {item.businessId}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{status}</span>
                    </span>
                    <span className="h-3 rounded-full bg-card">
                      <span
                        className="block h-3 rounded-full"
                        style={{
                          width: `${Math.max(3, (item.estimatedRevenue / maxRevenue) * 100)}%`,
                          background: typeColors[item.businessType],
                        }}
                      />
                    </span>
                    <span className="text-foreground">{formatMoney(item.estimatedRevenue)}</span>
                    <span className="text-muted-foreground">{formatNumber(item.visitCount)} visits</span>
                    <span className={item.trendDelta >= 0 ? 'text-foreground' : 'text-red-500'}>
                      {item.trendDelta >= 0 ? '+' : ''}{formatNumber(item.trendDelta)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-border/60 bg-card p-4">
          <h2 className="text-base font-semibold text-foreground">Selected business</h2>
          {selected ? (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {selected.businessType} {selected.businessId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {classifyBusiness(selected, sortedBusinesses)} based on comparative rank and trend
                  </p>
                </div>
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ background: typeColors[selected.businessType] }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs text-muted-foreground">Estimated sales</p>
                  <p className="font-semibold text-foreground">{formatMoney(selected.estimatedRevenue)}</p>
                </div>
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs text-muted-foreground">Unique customers</p>
                  <p className="font-semibold text-foreground">{formatNumber(selected.uniqueCustomers)}</p>
                </div>
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs text-muted-foreground">
                    {selected.businessType === 'Restaurant' ? 'Food cost' : 'Hourly cost'}
                  </p>
                  <p className="font-semibold text-foreground">{formatMoney(selected.listedCost)}</p>
                </div>
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs text-muted-foreground">Visit change</p>
                  <p className="font-semibold text-foreground">
                    {selected.trendDelta >= 0 ? '+' : ''}{formatNumber(selected.trendDelta)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Monthly estimated sales</p>
                  {detailLoading && <span className="text-xs text-muted-foreground">Loading...</span>}
                </div>
                <MiniTrend data={timeseries} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No business selected.</p>
          )}
        </aside>
      </div>

      <section className="mt-4 rounded-lg border border-border/60 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Business portfolio</h2>
            <p className="text-xs text-muted-foreground">
              Each business is positioned by customer reach and estimated sales. Circle size shows visit volume.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full" style={{ background: typeColors.Restaurant }} />
              Restaurant
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full" style={{ background: typeColors.Pub }} />
              Pub
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full border border-border/60 bg-card" />
              Larger circle = more visits
            </span>
          </div>
        </div>
        <div ref={portfolioRef} className="relative">
          <PortfolioScatterplot
            items={filteredBusinesses}
            selected={selected}
            hovered={hoveredBusiness?.item}
            onSelect={setSelected}
            onHover={handlePortfolioHover}
          />
          {hoveredBusiness && (
            <div
              className="pointer-events-none absolute z-10 w-52 rounded-md bg-black/85 px-3 py-2 text-xs text-white shadow-lg"
              style={{ left: hoveredBusiness.x, top: hoveredBusiness.y }}
            >
              <div className="font-semibold">
                {hoveredBusiness.item.businessType} {hoveredBusiness.item.businessId}
              </div>
              <div className="mt-1 text-white/75">
                {formatMoney(hoveredBusiness.item.estimatedRevenue)} estimated sales
              </div>
              <div className="text-white/75">
                {formatNumber(hoveredBusiness.item.uniqueCustomers)} unique customers
              </div>
              <div className="text-white/75">
                {formatNumber(hoveredBusiness.item.visitCount)} visits
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default BusinessProsperityAnalysis;
