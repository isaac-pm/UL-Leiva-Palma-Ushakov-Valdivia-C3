import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';

export const runForceSimulation = (nodes, links, width = 600, height = 400) => {
  if (!nodes.length || !links.length) return { nodes: [], links: [] };

  const simulationNodes = nodes.map((node, i) => ({ ...node, index: i }));
  const simulationLinks = links.map((link) => ({
    ...link,
    source: link.source,
    target: link.target,
  }));

  const simulation = forceSimulation(simulationNodes)
    .force('link', forceLink(simulationLinks).distance(50))
    .force('charge', forceManyBody().strength(-100))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collision', forceCollide().radius(20))
    .force('x', forceX(width / 2).strength(0.1))
    .force('y', forceY(height / 2).strength(0.1));

  simulation.stop();
  
  for (let i = 0; i < 300; i++) {
    simulation.tick();
  }

  return {
    nodes: simulationNodes,
    links: simulationLinks,
  };
};

export const clusterColors = {
  HighIncome: '#10b981',
  MediumIncome: '#3b82f6',
  LowIncome: '#f59e0b',
  HighSpender: '#ef4444',
  LowSpender: '#8b5cf6',
  Stable: '#06b6d4',
  Unstable: '#ec4899',
};

export const getClusterColor = (clusterId) => {
  return clusterColors[clusterId] || '#94a3b8';
};