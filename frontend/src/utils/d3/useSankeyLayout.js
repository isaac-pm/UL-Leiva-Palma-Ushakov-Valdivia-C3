import { useMemo } from 'react';
import * as d3Sankey from 'd3-sankey';
import * as d3Interpolate from 'd3-interpolate';

export const useSankeyLayout = (nodes, links, width = 600, height = 400) => {
  const layout = useMemo(() => {
    if (!nodes || !nodes.length || !links || !links.length) {
      return { nodes: [], links: [], paths: [] };
    }

    const sankeyGenerator = d3Sankey.sankey()
      .nodeWidth(20)
      .nodePadding(20)
      .extent([[1, 1], [width - 1, height - 1]]);

    const sankeyNodes = nodes.map((node) => ({ ...node }));
    const sankeyLinks = links.map((link) => ({
      ...link,
      source: link.sourceIndex,
      target: link.targetIndex,
    }));

    const { nodes: layoutNodes, links: layoutLinks } = sankeyGenerator({
      nodes: sankeyNodes,
      links: sankeyLinks,
    });

    const paths = layoutLinks.map((link) => {
      const sourceNode = layoutNodes[link.source];
      const targetNode = layoutNodes[link.target];
      
      if (!sourceNode || !targetNode) return null;
      
      return {
        ...link,
        path: link.path || d3Sankey.sankeyLinkHorizontal()(link),
        sourceX: sourceNode.x0,
        sourceY: (sourceNode.y0 + sourceNode.y1) / 2,
        targetX: targetNode.x1,
        targetY: (targetNode.y0 + targetNode.y1) / 2,
      };
    }).filter(Boolean);

    return {
      nodes: layoutNodes,
      links: layoutLinks,
      paths,
    };
  }, [nodes, links, width, height]);

  const interpolate = useMemo(() => {
    return (oldNodes, _oldLinks, newNodes, _newLinks) => {
      if (!oldNodes.length || !newNodes.length) return null;

      // Use the links params to avoid unused var warning
      const linkCount = _oldLinks?.length ?? _newLinks?.length ?? 0;
      
      const interpolators = {};
      
      newNodes.forEach((newNode, i) => {
        const oldNode = oldNodes[i];
        if (oldNode) {
          interpolators[`node-${newNode.id}`] = {
            x0: d3Interpolate.interpolateNumber(oldNode.x0 || 0, newNode.x0),
            x1: d3Interpolate.interpolateNumber(oldNode.x1 || 0, newNode.x1),
            y0: d3Interpolate.interpolateNumber(oldNode.y0 || 0, newNode.y0),
            y1: d3Interpolate.interpolateNumber(oldNode.y1 || 0, newNode.y1),
            linkCount,
          };
        }
      });

      return interpolators;
    };
  }, []);

  return { layout, interpolate };
};

export const nodeColorScale = (category) => {
  const colors = {
    HighIncome: '#10b981',
    MediumIncome: '#3b82f6',
    LowIncome: '#f59e0b',
    Food: '#ef4444',
    Education: '#8b5cf6',
    Recreation: '#ec4899',
    Shelter: '#06b6d4',
    Commute: '#6366f1',
  };
  return colors[category] || '#94a3b8';
};

export const flowColorScale = (sourceCategory, targetCategory) => {
  const colors = {
    HighIncome: { Food: '#10b981', Education: '#059669', Recreation: '#047857', Shelter: '#065f46' },
    MediumIncome: { Food: '#3b82f6', Education: '#2563eb', Recreation: '#1d4ed8', Shelter: '#1e40af' },
    LowIncome: { Food: '#f59e0b', Education: '#d97706', Recreation: '#b45309', Shelter: '#92400e' },
  };
  return colors[sourceCategory]?.[targetCategory] || '#94a3b8';
};