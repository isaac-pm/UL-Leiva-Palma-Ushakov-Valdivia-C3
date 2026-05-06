import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setSelectedNodeId, setHoveredClusterId } from '../store/graphSlice';
import { setHighlightedGroup } from '../store/sankeySlice';
import { getClusterColor, runForceSimulation } from '../utils/d3/useForceSimulation';

const NetworkGraph = ({ width = 500, height = 400 }) => {
  const canvasRef = useRef(null);
  const dispatch = useDispatch();

  const { nodes, links, loading, selectedNodeId } = useSelector((state) => state.graph);
  const { highlightedGroup } = useSelector((state) => state.sankey);

  const renderedNodes = useMemo(() => {
    if (!nodes.length || !links.length) return [];
    const result = runForceSimulation(nodes, links, width, height);
    return result.nodes;
  }, [nodes, links, width, height]);

  const canvasDraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !renderedNodes.length) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const isHighlightedGroup = highlightedGroup !== null;
    const [sourceCategory] = highlightedGroup?.split('_') || [];

    renderedNodes.forEach((node) => {
      const nodeX = node.x ?? width / 2;
      const nodeY = node.y ?? height / 2;
      const radius = 8;

      let isDimmed = false;
      if (isHighlightedGroup && node.category) {
        isDimmed = !node.category.includes(sourceCategory);
      }

      ctx.beginPath();
      ctx.arc(nodeX, nodeY, isDimmed ? radius * 0.5 : radius, 0, 2 * Math.PI);
      ctx.fillStyle = getClusterColor(node.clusterId) + (isDimmed ? '40' : 'cc');
      ctx.fill();

      ctx.strokeStyle = node.id === selectedNodeId ? '#fff' : 'transparent';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    links.forEach((link) => {
      const sourceId = link.source?.id || `cluster_${link.source}`;
      const targetId = link.target?.id || `cluster_${link.target}`;
      const source = renderedNodes.find((n) => n.id === sourceId);
      const target = renderedNodes.find((n) => n.id === targetId);

      if (!source || !target) return;

      const sourceX = source.x ?? width / 2;
      const sourceY = source.y ?? height / 2;
      const targetX = target.x ?? width / 2;
      const targetY = target.y ?? height / 2;

      let isDimmed = false;
      if (isHighlightedGroup && source.category) {
        isDimmed = !source.category.includes(sourceCategory);
      }

      ctx.beginPath();
      ctx.moveTo(sourceX, sourceY);
      ctx.lineTo(targetX, targetY);
      ctx.strokeStyle = isDimmed ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = isDimmed ? 0.5 : 1;
      ctx.stroke();
    });
  }, [renderedNodes, links, width, height, selectedNodeId, highlightedGroup]);

  useEffect(() => {
    canvasDraw();
  }, [canvasDraw]);

  const handleCanvasClick = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas || !renderedNodes.length) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const clickedNode = renderedNodes.find((node) => {
      const nodeX = node.x ?? width / 2;
      const nodeY = node.y ?? height / 2;
      const distance = Math.sqrt((clickX - nodeX) ** 2 + (clickY - nodeY) ** 2);
      return distance < 12;
    });

    if (clickedNode) {
      dispatch(setSelectedNodeId(selectedNodeId === clickedNode.id ? null : clickedNode.id));
      
      const groupId = clickedNode.category ? `${clickedNode.category}_Flow` : null;
      if (groupId) {
        dispatch(setHighlightedGroup(groupId));
      }
    } else {
      dispatch(setSelectedNodeId(null));
      dispatch(setHighlightedGroup(null));
    }
  }, [dispatch, renderedNodes, width, height, selectedNodeId]);

  const handleCanvasMouseMove = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas || !renderedNodes.length) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const hoveredNode = renderedNodes.find((node) => {
      const nodeX = node.x ?? width / 2;
      const nodeY = node.y ?? height / 2;
      const distance = Math.sqrt((mouseX - nodeX) ** 2 + (mouseY - nodeY) ** 2);
      return distance < 12;
    });

    if (hoveredNode) {
      dispatch(setHoveredClusterId(hoveredNode.clusterId));
      canvas.style.cursor = 'pointer';
    } else {
      dispatch(setHoveredClusterId(null));
      canvas.style.cursor = 'default';
    }
  }, [dispatch, renderedNodes, width, height]);

  return (
    <div className="relative bg-card rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold text-foreground mb-4">Social Network Graph</h3>
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-border rounded cursor-pointer"
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
      />

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {['HighIncome', 'MediumIncome', 'LowIncome', 'Stable', 'Unstable'].map((cluster) => (
          <span
            key={cluster}
            className="px-2 py-1 rounded-full flex items-center gap-1"
            style={{ backgroundColor: getClusterColor(cluster) + '20', color: getClusterColor(cluster) }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getClusterColor(cluster) }}
            />
            {cluster}
          </span>
        ))}
      </div>
    </div>
  );
};

export default NetworkGraph;