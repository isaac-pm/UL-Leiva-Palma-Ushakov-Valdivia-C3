import { useEffect, useRef, useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SankeyD3 from '../utils/d3/SankeyD3';
import { setHighlightedGroup } from '../store/sankeySlice';

const SankeyDiagram = ({ width = 1000, height = 400 }) => {
  const dispatch = useDispatch();
  const containerRef = useRef(null);
  const sankeyD3Ref = useRef(null);
  const hasInitialized = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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

    const chartSize = getChartSize();
    sankeyD3.create({ size: chartSize });
    setDimensions({ width: chartSize.width, height: chartSize.height });
    sankeyD3Ref.current = sankeyD3;
    hasInitialized.current = true;

    return () => {
      sankeyD3Ref.current?.destroy();
      hasInitialized.current = false;
    };
  }, []);

  // Resize handler to update chart dimensions when container size changes
  useEffect(() => {
    if (!containerRef.current || !sankeyD3Ref.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        const newHeight = entry.contentRect.height;
        
        if (newWidth !== dimensions.width || newHeight !== dimensions.height) {
          const newSize = getChartSize();
          setDimensions({ width: newSize.width, height: newSize.height });
          
          // Recreate with new dimensions
          sankeyD3Ref.current.create({ size: newSize });
          if (nodes.length > 0 && links.length > 0) {
            sankeyD3Ref.current.update({ nodes, links });
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
        <span className="px-2 py-1 rounded-full flex items-center gap-1 bg-[#93c5fd]/20 text-[#93c5fd]">
          <span className="w-2 h-2 rounded-full bg-[#93c5fd]" />
          Low Income
        </span>
        <span className="px-2 py-1 rounded-full flex items-center gap-1 bg-[#fdba74]/20 text-[#fdba74]">
          <span className="w-2 h-2 rounded-full bg-[#fdba74]" />
          Medium Income
        </span>
        <span className="px-2 py-1 rounded-full flex items-center gap-1 bg-[#d8b4fe]/20 text-[#d8b4fe]">
          <span className="w-2 h-2 rounded-full bg-[#d8b4fe]" />
          High Income
        </span>
        <span className="px-2 py-1 rounded-full flex items-center gap-1 bg-[#dc2626]/20 text-[#dc2626]">
          <span className="w-2 h-2 rounded-full bg-[#dc2626]" />
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