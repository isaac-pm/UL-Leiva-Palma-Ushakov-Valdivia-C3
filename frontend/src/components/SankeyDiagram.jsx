import { useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SankeyD3 from '../utils/d3/SankeyD3';
import { setHighlightedGroup } from '../store/sankeySlice';

const SankeyDiagram = ({ width = 1000, height = 400 }) => {
  const dispatch = useDispatch();
  const containerRef = useRef(null);
  const sankeyD3Ref = useRef(null);
  const hasInitialized = useRef(false);

  const { nodes, links, loading } = useSelector((state) => state.sankey);
  const { selectedNodeId } = useSelector((state) => state.graph);

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

    const sankeyD3 = new SankeyD3(containerRef.current, {
      onSelect: (items) => {
        if (items && items[0] && items[0].category) {
          dispatch(setHighlightedGroup(items[0].category));
        }
      },
      onHover: (items) => {
        if (items && items[0] && items[0].category) {
          dispatch(setHighlightedGroup(items[0].category));
        } else if (!items) {
          dispatch(setHighlightedGroup(null));
        }
      },
    });

    sankeyD3.create({ size: getChartSize() });
    sankeyD3Ref.current = sankeyD3;
    hasInitialized.current = true;

    return () => {
      sankeyD3Ref.current?.destroy();
      hasInitialized.current = false;
    };
  }, []);

  useEffect(() => {
    const sankeyD3 = sankeyD3Ref.current;
    if (sankeyD3 && nodes && links) {
      sankeyD3.update({ nodes, links });
    }
  }, [nodes, links]);

  useEffect(() => {
    const sankeyD3 = sankeyD3Ref.current;
    if (sankeyD3) {
      sankeyD3.updateSelection(selectedNodeId);
    }
  }, [selectedNodeId]);

  return (
    <div className="relative bg-card rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold text-foreground mb-4">Sankey Flow Diagram</h3>
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      <div 
        ref={containerRef} 
        className="sankey-container"
        style={{ 
          width: '100%', 
          height: height,
          minHeight: '300px'
        }}
      />

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-full flex items-center gap-1 bg-emerald-500/20 text-emerald-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Low Income
        </span>
        <span className="px-2 py-1 rounded-full flex items-center gap-1 bg-blue-500/20 text-blue-500">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Medium Income
        </span>
        <span className="px-2 py-1 rounded-full flex items-center gap-1 bg-amber-500/20 text-amber-500">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          High Income
        </span>
        <span className="px-2 py-1 rounded-full flex items-center gap-1 bg-red-500/20 text-red-500">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Very High Income
        </span>
      </div>

      <div className="mt-2 p-2 bg-accent/5 rounded text-xs text-muted-foreground">
        <strong>Hover</strong> on flows to see balance amounts | 
        <strong> Click</strong> nodes to highlight
      </div>
    </div>
  );
};

export default SankeyDiagram;