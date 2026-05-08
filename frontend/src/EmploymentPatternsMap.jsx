import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BuildingsMapD3 from './utils/maps/buildingsMap';
import { customfetch } from './utils/api';

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString();
};

const EmploymentPatternsMap = () => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [buildings, setBuildings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const stats = useMemo(() => {
    const counts = buildings.reduce(
      (acc, item) => {
        const type = item.type || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        acc.total += 1;
        return acc;
      },
      { total: 0 }
    );
    return counts;
  }, [buildings]);

  const getChartSize = useCallback(() => {
    if (!containerRef.current) {
      return { width: 900, height: 520 };
    }
    return {
      width: containerRef.current.offsetWidth || 900,
      height: containerRef.current.offsetHeight || 520,
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await customfetch('/api/buildings/map?limit=20000');
        const data = response?.data?.data || [];
        if (!isMounted) return;
        setBuildings(data);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Unable to load building polygons');
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
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new BuildingsMapD3(containerRef.current, {
      rotation: '270',
      onSelect: (item) => setSelected(item),
      onHover: (event, item) => {
        if (!event || !item || !containerRef.current) {
          setHovered(null);
          return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        setHovered({
          id: item.id,
          type: item.type || 'Unknown',
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      },
    });

    mapRef.current.create({ size: getChartSize() });

    return () => {
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [getChartSize]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.update(buildings);
  }, [buildings]);

  useEffect(() => {
    if (!selected) return;
    const next = buildings.find((item) => item.id === selected.id) || null;
    if (next !== selected) {
      setSelected(next);
    }
  }, [buildings, selected]);

  useEffect(() => {
    const handleResize = () => {
      if (!mapRef.current || !containerRef.current) return;
      mapRef.current.create({ size: getChartSize() });
      mapRef.current.update(buildings);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [buildings, getChartSize]);

  return (
    <div className="mx-auto w-full max-w-[90rem] px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Employment Patterns Map
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">
            Building footprints by activity hub
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Zoom and click buildings to highlight them. This layer is sourced from the
            Buildings table.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="rounded-full bg-card px-3 py-1 text-foreground">
            Total: {formatNumber(stats.total)}
          </div>
          {Object.entries(stats)
            .filter(([key]) => key !== 'total')
            .map(([key, value]) => (
              <div key={key} className="rounded-full border border-border/60 px-3 py-1 text-muted-foreground">
                {key}: {formatNumber(value)}
              </div>
            ))}
        </div>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
              Loading buildings...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-red-500">
              {error}
            </div>
          )}
          <div
            ref={containerRef}
            className="mx-auto min-h-[260px] w-[70%]"
          />
          {hovered && (
            <div
              className="pointer-events-none absolute rounded-md bg-black/80 px-3 py-2 text-xs text-white"
              style={{ left: hovered.x + 12, top: hovered.y + 12 }}
            >
              <div>Building {hovered.id}</div>
              <div className="text-[10px] text-white/70">{hovered.type}</div>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
          <h3 className="text-base font-semibold text-foreground">Details</h3>
          <p className="mt-1 text-xs">
            Click on a building to lock the highlight. Scroll to zoom, drag to pan.
          </p>

          <div className="mt-4 rounded-lg bg-card/80 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Selection</p>
            {selected ? (
              <div className="mt-2 text-sm text-foreground">
                <div>Building {selected.id}</div>
                <div className="text-xs text-muted-foreground">{selected.type || 'Unknown'}</div>
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Polygon rings: {selected.rings?.length || 0}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs">No building selected yet.</p>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-border/60 bg-accent/5 p-3 text-xs">
            <p className="font-semibold text-foreground">Legend</p>
            <div className="mt-2 flex flex-col gap-2">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500" /> Commercial
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Residential
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> School
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default EmploymentPatternsMap;
