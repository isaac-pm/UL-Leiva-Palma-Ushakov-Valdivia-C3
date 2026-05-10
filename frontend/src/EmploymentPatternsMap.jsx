import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import BuildingsMapD3 from './utils/maps/buildingsMap';
import { customfetch } from './utils/api';
import AnalysisHeader from './components/AnalysisHeader';
import LayerControlPanel from './components/maps/LayerControlPanel';
import EmployerDetailPanel from './components/panels/EmployerDetailPanel';
import { useEmployerMapData } from './hooks/useEmployerMapData';
import { DEFAULT_LAYER_STATE } from './types/employerMap';
import { setSelectedBuildings, clearSelectedBuildings, setBuildingToEmployerIds } from './store/uiSlice';

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return '\u2014';
  return value.toLocaleString();
};

const EmploymentPatternsMap = () => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const dispatch = useDispatch();
  const selectedBuildings = useSelector((s) => s.ui.selectedBuildings);

  const [buildings, setBuildings] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [layerState, setLayerState] = useState(DEFAULT_LAYER_STATE);
  const [selectedEmployer, setSelectedEmployer] = useState(null);
  const [employerDetail, setEmployerDetail] = useState(null);
  const [employerDetailLoading, setEmployerDetailLoading] = useState(false);
  const [employerHover, setEmployerHover] = useState(null);
  const [hexRadius, setHexRadius] = useState(20);
  const [debouncedHexRadius, setDebouncedHexRadius] = useState(20);
  const { employers, stats, loading: empLoading, error: empError } = useEmployerMapData();
  const employerWageRef = useRef({});
  const employerIdByBuildingRef = useRef({});

  useEffect(() => {
    const wageLookup = {};
    const idLookup = {};
    employers.forEach(e => {
      if (e.buildingId != null) {
        wageLookup[e.buildingId] = e.avgHourlyRate;
        idLookup[e.buildingId] = e.employerId;
      }
    });
    employerWageRef.current = wageLookup;
    employerIdByBuildingRef.current = idLookup;

    const buildingEmpIds = {};
    employers.forEach(e => {
      if (e.buildingId != null) {
        if (!buildingEmpIds[e.buildingId]) buildingEmpIds[e.buildingId] = [];
        buildingEmpIds[e.buildingId].push(e.employerId);
      }
    });
    dispatch(setBuildingToEmployerIds(buildingEmpIds));
  }, [employers, dispatch]);

  const statsSummary = useMemo(() => {
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
      onBrushEnd: (ids) => {
        dispatch(setSelectedBuildings(ids));
      },
      onHover: (event, item) => {
        if (!event || !item || !containerRef.current) {
          setHovered(null);
          return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        const wage = employerWageRef.current[item.id];
        const employerId = employerIdByBuildingRef.current[item.id];
        setHovered({
          id: item.id,
          type: item.type || 'Unknown',
          wage: wage != null ? wage : null,
          employerId: employerId != null ? employerId : null,
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
  }, [getChartSize, dispatch]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.update(buildings);
  }, [buildings]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setSelectedBuildings(selectedBuildings);
  }, [selectedBuildings]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.mapPoint) return;
    mapRef.current.updateHexbin(employers, layerState, stats || {}, {
      onHover: (event, bin) => {
        if (!event || !bin || !containerRef.current) {
          setEmployerHover(null);
          return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        const totalJobs = bin.members.reduce((s, m) => s + m.jobCount, 0);
        setEmployerHover({
          employerCount: bin.members.length,
          totalJobs,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      },
      onSelect: (event, bin) => {
        const top = bin.members.reduce((best, m) =>
          m.jobCount > (best?.jobCount || 0) ? m : best, null);
        if (!top) return;
        setSelectedEmployer(top);
      },
    }, debouncedHexRadius);
  }, [employers, layerState, stats, debouncedHexRadius]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.updatePolygonFill(employers, layerState, stats || {});
  }, [employers, layerState, stats]);

  useEffect(() => {
    if (!selectedEmployer || selectedEmployer.jobCount === 0) {
      setEmployerDetail(null);
      return;
    }

    let isMounted = true;

    const fetchDetail = async () => {
      try {
        setEmployerDetailLoading(true);
        const response = await customfetch(`/api/employers/${selectedEmployer.employerId}/detail`);
        const data = response?.data?.data;
        if (isMounted) setEmployerDetail(data);
      } catch (err) {
        if (isMounted) setEmployerDetail(null);
      } finally {
        if (isMounted) setEmployerDetailLoading(false);
      }
    };

    fetchDetail();

    return () => {
      isMounted = false;
    };
  }, [selectedEmployer]);

  useEffect(() => {
    const handleResize = () => {
      if (!mapRef.current || !containerRef.current) return;
      mapRef.current.create({ size: getChartSize() });
      mapRef.current.update(buildings);
      if (employers.length > 0 && stats) {
        mapRef.current.updateHexbin(employers, layerState, stats, {}, debouncedHexRadius);
        mapRef.current.updatePolygonFill(employers, layerState, stats);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [buildings, employers, layerState, stats, getChartSize, debouncedHexRadius]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && selectedBuildings.length > 0) {
        dispatch(clearSelectedBuildings());
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedBuildings, dispatch]);

  const handleCloseEmployer = useCallback(() => {
    setSelectedEmployer(null);
    setEmployerDetail(null);
  }, []);

  const clampTooltip = (x, y, tooltipWidth = 200, tooltipHeight = 60) => {
    if (!containerRef.current) return { x, y };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.min(x + 12, rect.width - tooltipWidth - 8),
      y: Math.min(y + 12, rect.height - tooltipHeight - 8),
    };
  };

  const anyLayerActive = layerState.jobConcentration || layerState.wageGeography ||
    layerState.employerStability;

  return (
    <div className="mx-auto w-full max-w-[90rem] px-6 py-6">
      <AnalysisHeader
        overline="Employment Patterns Map"
        title="Building footprints by activity hub"
        subtitle="Click buildings to toggle selection. Shift+drag for rectangle selection. This layer is sourced from the Buildings table."
        right={(
          <div className="flex flex-wrap justify-end gap-2 text-[11px]">
            <div className="rounded-full bg-card px-3 py-1 text-foreground">
              Total: {formatNumber(statsSummary.total)}
            </div>
            {Object.entries(statsSummary)
              .filter(([key]) => key !== 'total')
              .map(([key, value]) => (
                <div key={key} className="rounded-full border border-border/60 px-3 py-1 text-muted-foreground">
                  {key}: {formatNumber(value)}
                </div>
              ))}
          </div>
        )}
      />

      <div className="mt-6 grid justify-center gap-4 lg:grid-cols-[minmax(0,888px)_280px]">
        <div className="relative h-[740px] w-full overflow-hidden rounded-2xl border border-border/60 bg-card/80">
          {(loading || empLoading) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
              Loading...
            </div>
          )}
          {(error || empError) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-red-500">
              {error || empError}
            </div>
          )}
          <div
            ref={containerRef}
            className="h-full w-full"
          />

          {hovered && !selectedEmployer && (
            <div
              className="pointer-events-none absolute rounded-md bg-black/80 px-3 py-2 text-xs text-white"
              style={{ left: hovered.x + 12, top: hovered.y + 12 }}
            >
              <div>Building {hovered.id}</div>
              <div className="text-[10px] text-white/70">{hovered.type}</div>
              {hovered.employerId != null && (
                <div className="text-[10px] text-yellow-300">Employer {hovered.employerId}</div>
              )}
              {hovered.wage != null && layerState.wageGeography && layerState.wageMode === 'specific' && (
                <div className="text-[10px] text-yellow-300">${hovered.wage.toFixed(2)}/hr</div>
              )}
            </div>
          )}

          {employerHover && (
            <div
              className="pointer-events-none absolute rounded-md bg-black/80 px-3 py-2 text-xs text-white"
              style={{
                left: clampTooltip(employerHover.x, employerHover.y - 20).x,
                top: clampTooltip(employerHover.x, employerHover.y - 20).y,
              }}
            >
              <div>{employerHover.employerCount} employer{employerHover.employerCount !== 1 ? 's' : ''}</div>
              <div className="text-[10px] text-white/70">{employerHover.totalJobs} total jobs</div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <LayerControlPanel
            layerState={layerState}
            setLayerState={setLayerState}
            stats={stats}
            hexRadius={hexRadius}
            setHexRadius={setHexRadius}
          />

          {selectedEmployer && selectedEmployer.jobCount > 0 ? (
            <EmployerDetailPanel
              employerId={selectedEmployer.employerId}
              detail={employerDetail}
              loading={employerDetailLoading}
              onClose={handleCloseEmployer}
            />
          ) : (
            <aside className="w-full rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground">
              <h3 className="text-base font-semibold text-foreground">Details</h3>
              <p className="mt-1 text-xs">
                Click on a building to lock the highlight. Scroll to zoom, drag to pan.
              </p>

              <div className="mt-4 rounded-lg bg-card/80 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Selection</p>
                {selectedBuildings.length > 0 ? (
                  <div className="mt-2 text-sm text-foreground">
                    <div>{selectedBuildings.length} building{selectedBuildings.length !== 1 ? 's' : ''} selected</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedBuildings.slice(0, 10).map(id => (
                        <span key={id} className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          #{id}
                        </span>
                      ))}
                      {selectedBuildings.length > 10 && (
                        <span className="text-[10px] text-muted-foreground">+{selectedBuildings.length - 10} more</span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        dispatch(clearSelectedBuildings());
                        mapRef.current?.clearSelection();
                      }}
                      className="mt-2 text-[10px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:bg-accent/10"
                    >
                      Clear selection
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs">Click buildings to select. Shift+drag for rectangle selection.</p>
                )}
              </div>

              <div className="mt-4 rounded-lg border border-border/60 bg-accent/5 p-3 text-xs">
                <p className="font-semibold text-foreground">Legend</p>
                <div className="mt-2 flex flex-col gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#1A56DB' }} /> Residential
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#7EA8F8' }} /> Apartment
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#9333EA' }} /> Employer
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#581C87' }} /> Commercial
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#DB2777' }} /> Pub
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#0891B2' }} /> Restaurant
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#111827' }} /> School
                  </span>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmploymentPatternsMap;
