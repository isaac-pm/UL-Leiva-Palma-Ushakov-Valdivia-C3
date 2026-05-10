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

            // Fix: Start nodes SPREAD ACROSS the full canvas (not clustered at center)
            const simulationNodes = nodes.map((node, i) => ({
                ...node,
                index: i,
                totalWeight: nodeWeights[node.id] || 0,
                x: Math.random() * width * 0.8 + width * 0.1,  // Spread across 80% of canvas
                y: Math.random() * height * 0.8 + height * 0.1,
            }));

            const simulationLinks = links.map((link, i) => ({
                ...link,
                index: i,
                source: `cluster_${link.source}`,
                target: `cluster_${link.target}`,
            }));

            console.log('[NetworkLayout] Link force setup:', simulationLinks.slice(0, 3).map(l => `${l.source}->${l.target}`));

            const simulation = d3.forceSimulation(simulationNodes)
                .force('link', d3.forceLink(simulationLinks)
                    .id(d => d.id)
                    .distance(60)
                    .strength(0.6)
                )
                .force('charge', d3.forceManyBody().strength(-700))
                .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
                .force('collision', d3.forceCollide().radius(d => 8 + Math.min(10, (d.totalWeight || 0) / 500)));

            simulation.stop();
            for (let i = 0; i < 300; i++) {
                simulation.tick();
            }

            simulation.on('tick', () => {
                nodeG.selectAll('.node-circle')
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);
                linkG.selectAll('.link-path')
                    .attr('d', d => `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`);
            });

            // Debug: check final node positions and link distances
            console.log('[NetworkLayout] Final node positions:', simulationNodes.slice(0, 3).map(n => `${n.id}: (${Math.round(n.x)},${Math.round(n.y)})`));
            
            // Calculate and log distances for linked nodes
            simulationLinks.forEach(link => {
                if (link.source.x !== undefined && link.target.x !== undefined) {
                    const dx = link.target.x - link.source.x;
                    const dy = link.target.y - link.source.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    console.log(`[NetworkLayout] Link ${link.source.id}->${link.target.id} distance: ${Math.round(dist)}`);
                }
            });

            // IMPORTANT: After simulation, d.source and d.target are now NODE OBJECTS (not strings)
            // Use them directly instead of searching
            
            // Clear existing elements to ensure proper z-order
            svg.selectAll('.linkG').remove();
            svg.selectAll('.nodeG').remove();

            // Render links FIRST (background) - so they appear behind nodes
            const linkG = svg.append('g').attr('class', 'linkG');

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
            const nodeG = svg.append('g').attr('class', 'nodeG');

            const nodesSelection = nodeG.selectAll('.node-circle')
                .data(simulationNodes, d => d.id)
                .join(
                    enter => enter.append('circle')
                        .attr('class', 'node-circle')
                        .attr('r', 0)  // Start at 0 for animation
                        .attr('fill', d => getClusterColor(d.clusterId))
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 1.5)
                        .attr('cx', d => d.x)
                        .attr('cy', d => d.y)
                        .style('cursor', 'pointer')
                        .style('opacity', 0)
                        // Attach events BEFORE transition
                        .on('click', (event, d) => {
                            if (onSelect) onSelect([d]);
                        })
                        .on('mouseenter', (event, d) => {
                            if (showTooltip) showTooltip(event, d);
                            if (onHover) onHover([d]);
                        })
                        .on('mouseleave', () => {
                            hideTooltip();
                            if (onHover) onHover(null);
                        })
                        // Then apply transition
                        .transition()
                        .duration(400)
                        .attr('r', d => 6 + Math.min(12, (d.totalWeight || 0) / 800))
                        .style('opacity', defaultOpacity),
                    update => update
                        .transition()
                        .duration(300)
                        .attr('r', d => 6 + Math.min(12, (d.totalWeight || 0) / 800)),
                    exit => exit
                        .transition()
                        .duration(200)
                        .attr('r', 0)
                        .style('opacity', 0)
                        .remove()
                );

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