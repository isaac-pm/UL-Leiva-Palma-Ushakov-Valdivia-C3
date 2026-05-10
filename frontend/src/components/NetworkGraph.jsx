import { useEffect, useRef, useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import NetworkD3 from '../utils/d3/NetworkD3';
import { setSelectedNodeId, setHoveredClusterId } from '../store/graphSlice';
import { setHighlightedGroup } from '../store/sankeySlice';

const NetworkGraph = ({ width = 500, height = 400 }) => {
  const dispatch = useDispatch();
  const containerRef = useRef(null);
  const networkD3Ref = useRef(null);
  const hasInitialized = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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

    const chartSize = getChartSize();
    networkD3.create({ size: chartSize });
    setDimensions(chartSize);
    networkD3Ref.current = networkD3;
    hasInitialized.current = true;

    return () => {
      networkD3Ref.current?.destroy();
      hasInitialized.current = false;
    };
  }, []);

  // Resize handler to update chart dimensions when container size changes
  useEffect(() => {
    if (!containerRef.current || !networkD3Ref.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        const newHeight = entry.contentRect.height;
        
        if (newWidth !== dimensions.width || newHeight !== dimensions.height) {
          const newSize = getChartSize();
          setDimensions({ width: newSize.width, height: newSize.height });
          
          // Recreate with new dimensions
          networkD3Ref.current.create({ size: newSize });
          if (nodes.length > 0) {
            networkD3Ref.current.update({ nodes, links });
          }
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [nodes, links, dimensions.width, dimensions.height, getChartSize]);

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

  const travelPurposeLabels = {
    commute: 'Work/Home Commute',
    recreation: 'Recreation',
    eating: 'Eating',
    goingHome: 'Going Home',
    returningFromRestaurant: 'Returning from Restaurant',
};

const travelPurposeColors = {
    commute: '#3b82f6',
    recreation: '#10b981',
    eating: '#f59e0b',
    goingHome: '#8b5cf6',
    returningFromRestaurant: '#ef4444',
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
        {Object.entries(travelPurposeLabels).map(([id, label]) => (
          <span
            key={id}
            className="px-2 py-1 rounded-full flex items-center gap-1"
            style={{
              backgroundColor: `${travelPurposeColors[id]}20`,
              color: travelPurposeColors[id],
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: travelPurposeColors[id],
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