import { useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import NetworkD3 from '../utils/d3/NetworkD3';
import { setSelectedNodeId, setHoveredClusterId } from '../store/graphSlice';
import { setHighlightedGroup } from '../store/sankeySlice';

const NetworkGraph = ({ width = 500, height = 400 }) => {
  const dispatch = useDispatch();
  const containerRef = useRef(null);
  const networkD3Ref = useRef(null);
  const hasInitialized = useRef(false);

  const { nodes, links, loading, selectedNodeId, hoveredClusterId } = useSelector((state) => state.graph);

  const getChartSize = useCallback(() => {
    if (containerRef.current) {
      return {
        width: containerRef.current.offsetWidth || width,
        height: containerRef.current.offsetHeight || height,
      };
    }
    return { width, height };
  }, [width, height]);

  useEffect(() => {
    if (!containerRef.current || hasInitialized.current) return;

    const networkD3 = new NetworkD3(containerRef.current, {
      onSelect: (items) => {
        if (items && items[0]) {
          dispatch(setSelectedNodeId(items[0].id));
          if (items[0].category) {
            dispatch(setHighlightedGroup(items[0].category));
          }
        }
      },
      onHover: (items) => {
        if (items && items[0]) {
          dispatch(setHoveredClusterId(items[0].clusterId));
        } else {
          dispatch(setHoveredClusterId(null));
        }
      },
    });

    networkD3.create({ size: getChartSize() });
    networkD3Ref.current = networkD3;
    hasInitialized.current = true;

    return () => {
      networkD3Ref.current?.destroy();
      hasInitialized.current = false;
    };
  }, []);

  useEffect(() => {
    const networkD3 = networkD3Ref.current;
    console.log('[NetworkGraph] useEffect - nodes:', nodes.length, 'links:', links.length);
    if (networkD3 && nodes.length) {
      networkD3.update({ nodes, links });
    } else {
      console.log('[NetworkGraph] Skipping update - no nodes or no d3 instance');
    }
  }, [nodes, links]);

  useEffect(() => {
    const networkD3 = networkD3Ref.current;
    if (networkD3) {
      networkD3.updateSelection(selectedNodeId);
    }
  }, [selectedNodeId]);

  useEffect(() => {
    const networkD3 = networkD3Ref.current;
    if (networkD3) {
      networkD3.updateHover(hoveredClusterId);
    }
  }, [hoveredClusterId]);

  const clusterLabels = {
    0: 'Urban',
    3: 'Suburban A',
    4: 'Suburban B',
    5: 'Rural',
    6: 'Peri-urban',
    7: 'Mixed',
    9: 'Industrial',
  };

  return (
    <div className="relative bg-card rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold text-foreground mb-4">Social Network Graph</h3>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      <div
        ref={containerRef}
        className="network-container"
        style={{
          width: '100%',
          height: height,
          minHeight: '300px',
        }}
      />

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {Object.entries(clusterLabels).map(([id, label]) => (
          <span
            key={id}
            className="px-2 py-1 rounded-full flex items-center gap-1"
            style={{
              backgroundColor: `hsl(${(parseInt(id) * 45) % 360}, 70%, 90%)`,
              color: `hsl(${(parseInt(id) * 45) % 360}, 70%, 30%)`,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: `hsl(${(parseInt(id) * 45) % 360}, 70%, 40%)`,
              }}
            />
            {label}
          </span>
        ))}
      </div>

      <div className="mt-2 p-2 bg-accent/5 rounded text-xs text-muted-foreground">
        <strong>Hover</strong> nodes to see details | <strong>Click</strong> to select |
        <strong> Drag</strong> to reposition nodes
      </div>
    </div>
  );
};

export default NetworkGraph;