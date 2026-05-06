import * as d3 from 'd3';

const LAYOUT_REGISTRY = {
    force: {
        id: 'force',
        label: 'Force-Directed',
        description: 'Force-directed graph layout',

        render: (svg, nodes, links, options) => {
            const {
                width,
                height,
                onSelect,
                onHover,
                showTooltip,
                hideTooltip,
                defaultOpacity,
                selectedOpacity,
                selectedId,
                getClusterColor,
            } = options;

            if (!nodes.length) {
                console.log('[NetworkLayout] No nodes to render');
                return;
            }

            console.log('[NetworkLayout] Rendering', nodes.length, 'nodes', links.length, 'links');

            // Pre-compute node weights for sizing
            const nodeWeights = {};
            links.forEach(link => {
                const sourceId = `cluster_${link.source}`;
                const targetId = `cluster_${link.target}`;
                nodeWeights[sourceId] = (nodeWeights[sourceId] || 0) + (link.weight || 1);
                nodeWeights[targetId] = (nodeWeights[targetId] || 0) + (link.weight || 1);
            });

            const simulationNodes = nodes.map((node, i) => ({
                ...node,
                index: i,
                totalWeight: nodeWeights[node.id] || 0,
                x: width / 2 + (Math.random() - 0.5) * 50,
                y: height / 2 + (Math.random() - 0.5) * 50,
            }));

            const simulationLinks = links.map((link, i) => ({
                ...link,
                index: i,
                source: `cluster_${link.source}`,
                target: `cluster_${link.target}`,
            }));

            const simulation = d3.forceSimulation(simulationNodes)
                .force('link', d3.forceLink(simulationLinks)
                    .id(d => d.id)
                    .distance(100)
                    .strength(0.5)
                )
                .force('charge', d3.forceManyBody().strength(-300))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide().radius(d => 8 + Math.min(10, (nodeWeights[d.id] || 0) / 500)))
                .force('x', d3.forceX(width / 2).strength(0.03))
                .force('y', d3.forceY(height / 2).strength(0.03));

            simulation.stop();
            for (let i = 0; i < 500; i++) {
                simulation.tick();
            }

            // IMPORTANT: After simulation, d.source and d.target are now NODE OBJECTS (not strings)
            // Use them directly instead of searching

            // Render links FIRST (background) - so they appear behind nodes
            const linkG = svg.selectAll('.linkG').data([1]).join('g').attr('class', 'linkG');

            linkG.selectAll('.link-path')
                .data(simulationLinks, d => `${d.source.id || d.source}-${d.target.id || d.target}`)
                .join(
                    enter => enter.append('path')
                        .attr('class', 'link-path')
                        .attr('fill', 'none')
                        .attr('stroke', '#94a3b8')
                        .attr('stroke-opacity', 0.5)
                        .attr('stroke-width', d => Math.max(1, Math.min(4, Math.sqrt(d.weight || 1) / 20)))
                        .style('cursor', 'pointer')
                        .on('click', (event, d) => {
                            if (onSelect) {
                                onSelect([d.originalData || d]);
                            }
                        })
                        .on('mouseenter', (event, d) => {
                            if (showTooltip) {
                                showTooltip(event, d);
                            }
                            if (onHover) {
                                onHover([d.source, d.target]);
                            }
                        })
                        .on('mouseleave', () => {
                            hideTooltip();
                            if (onHover) onHover(null);
                        }),
                    update => update
                        .attr('stroke-width', d => Math.max(1, Math.min(4, Math.sqrt(d.weight || 1) / 20))),
                    exit => exit.remove()
                )
                .attr('d', d => {
                    // Use d.source and d.target directly - they are now node objects after simulation
                    const source = d.source;
                    const target = d.target;
                    if (!source || !target || source.x === undefined || target.x === undefined) return '';
                    return `M${source.x},${source.y}L${target.x},${target.y}`;
                });

            // Render nodes SECOND (foreground) - so they appear on top of links
            const nodeG = svg.selectAll('.nodeG').data([1]).join('g').attr('class', 'nodeG');

            const nodesSelection = nodeG.selectAll('.node-circle')
                .data(simulationNodes, d => d.id)
                .join(
                    enter => enter.append('circle')
                        .attr('class', 'node-circle')
                        .attr('r', d => 6 + Math.min(12, (d.totalWeight || 0) / 800))
                        .attr('fill', d => getClusterColor(d.clusterId))
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 1.5)
                        .style('cursor', 'pointer')
                        .style('opacity', defaultOpacity)
                        .on('click', (event, d) => {
                            if (onSelect) {
                                onSelect([d]);
                            }
                        })
                        .on('mouseenter', (event, d) => {
                            if (showTooltip) {
                                showTooltip(event, d);
                            }
                            if (onHover) {
                                onHover([d]);
                            }
                        })
                        .on('mouseleave', () => {
                            hideTooltip();
                            if (onHover) onHover(null);
                        }),
                    update => update
                        .transition()
                        .duration(300)
                        .attr('r', d => 6 + Math.min(12, (d.totalWeight || 0) / 800)),
                    exit => exit.remove()
                )
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);

            nodesSelection.call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));

            function dragstarted(event, d) {
                if (!event.active) {
                    simulation.alphaTarget(0.3).restart();
                }
                d.fx = d.x;
                d.fy = d.y;
            }

            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }

            function dragended(event, d) {
                if (!event.active) {
                    simulation.alphaTarget(0);
                }
                d.fx = null;
                d.fy = null;
            }

            if (selectedId) {
                svg.selectAll('.node-circle')
                    .transition()
                    .duration(200)
                    .attr('stroke', d => d.id === selectedId ? '#fff' : '#fff')
                    .attr('stroke-width', d => d.id === selectedId ? 3 : 1.5)
                    .attr('r', d => d.id === selectedId 
                        ? 6 + Math.min(12, (d.totalWeight || 0) / 800) + 4  // Make selected node bigger
                        : 6 + Math.min(12, (d.totalWeight || 0) / 800))
                    .style('opacity', d => d.id === selectedId ? selectedOpacity : defaultOpacity);
            }
        }
    }
};

export const getLayouts = () => Object.values(LAYOUT_REGISTRY);
export const getLayout = (id) => LAYOUT_REGISTRY[id];