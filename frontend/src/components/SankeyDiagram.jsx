import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import * as d3Interpolate from 'd3-interpolate';
import { useSankeyLayout, nodeColorScale } from '../utils/d3/useSankeyLayout';
import { setHighlightedGroup } from '../store/sankeySlice';

const SankeyDiagram = ({ width = 500, height = 400 }) => {
  const dispatch = useDispatch();

  const { nodes, links: sankeyLinks, loading, highlightedGroup } = useSelector((state) => state.sankey);
  const { selectedNodeId } = useSelector((state) => state.graph);

  const { layout } = useSankeyLayout(nodes, sankeyLinks, width, height);

  const handleFlowHover = useCallback((sourceCategory, targetCategory) => {
    const groupId = `${sourceCategory}_${targetCategory}`;
    dispatch(setHighlightedGroup(groupId));
  }, [dispatch]);

  const handleFlowLeave = useCallback(() => {
    dispatch(setHighlightedGroup(null));
  }, [dispatch]);

  return (
    <div className="relative bg-card rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold text-foreground mb-4">Sankey Flow Diagram</h3>
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-bg)" />
          </linearGradient>
        </defs>

        {layout.paths.map((link, index) => {
          const sourceNode = layout.nodes[link.source];
          const targetNode = layout.nodes[link.target];
          
          if (!sourceNode || !targetNode) return null;

          const isHighlighted = highlightedGroup === `${sourceNode.category}_${targetNode.category}`;
          const isDimmed = selectedNodeId && !isHighlighted;

          const sourceColor = nodeColorScale(sourceNode.category);
          const targetColor = nodeColorScale(targetNode.category);
          const midColor = d3Interpolate.interpolateRgb(sourceColor, targetColor)(0.5);

          return (
            <path
              key={`flow-${index}`}
              d={link.path}
              fill="none"
              stroke={midColor}
              strokeWidth={Math.max(link.width || 1, 1)}
              opacity={isDimmed ? 0.2 : isHighlighted ? 1 : 0.7}
              className="transition-all duration-300 cursor-pointer"
              onMouseEnter={() => handleFlowHover(sourceNode.category, targetNode.category)}
              onMouseLeave={handleFlowLeave}
              style={{ pointerEvents: 'stroke' }}
            />
          );
        })}

        {layout.nodes.map((node, index) => {
          if (!node) return null;
          
          const nodeColor = nodeColorScale(node.category);
          const isSelected = selectedNodeId === node.id;

          return (
            <g
              key={`node-${index}`}
              transform={`translate(${node.x0}, ${node.y0})`}
              className="transition-opacity duration-300"
              opacity={selectedNodeId && selectedNodeId !== node.id && !isSelected ? 0.3 : 1}
            >
              <rect
                width={node.x1 - node.x0}
                height={node.y1 - node.y0}
                fill={nodeColor}
                rx={4}
                className="cursor-pointer hover:opacity-80"
              />
              <text
                x={node.x0 < width / 2 ? node.x1 - node.x0 + 8 : -8}
                y={(node.y1 - node.y0) / 2}
                textAnchor={node.x0 < width / 2 ? 'start' : 'end'}
                dominantBaseline="middle"
                className="text-xs fill-current"
                style={{ fontSize: '12px' }}
              >
                {node.name}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {['HighIncome', 'MediumIncome', 'LowIncome'].map((category) => (
          <span
            key={category}
            className="px-2 py-1 rounded-full flex items-center gap-1"
            style={{ backgroundColor: nodeColorScale(category) + '20', color: nodeColorScale(category) }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: nodeColorScale(category) }}
            />
            {category}
          </span>
        ))}
      </div>
    </div>
  );
};

export default SankeyDiagram;