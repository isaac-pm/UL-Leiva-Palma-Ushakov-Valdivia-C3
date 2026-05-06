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

            const simulationNodes = nodes.map((node, i) => ({
                ...node,
                index: i,
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
                    .distance(80)
                    .strength(link => 1 / Math.min(
                        simulationNodes.filter(n => n.id === link.source || n.id === link.source?.id).length,
                        simulationNodes.filter(n => n.id === link.target || n.id === link.target?.id).length
                    ) || 1)
                )
                .force('charge', d3.forceManyBody().strength(-200))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide().radius(25))
                .force('x', d3.forceX(width / 2).strength(0.05))
                .force('y', d3.forceY(height / 2).strength(0.05));

            simulation.stop();
            for (let i = 0; i < 300; i++) {
                simulation.tick();
            }

            const linkG = svg.selectAll('.linkG').data([1]).join('g').attr('class', 'linkG');

            linkG.selectAll('.link-path')
                .data(simulationLinks, d => `${d.source}-${d.target}`)
                .join(
                    enter => enter.append('path')
                        .attr('class', 'link-path')
                        .attr('fill', 'none')
                        .attr('stroke', '#94a3b8')
                        .attr('stroke-opacity', 0.4)
                        .attr('stroke-width', d => Math.sqrt(d.weight || 1))
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
                                const sourceNode = simulationNodes.find(n =>
                                    n.id === d.source || n.id === d.source?.id
                                );
                                const targetNode = simulationNodes.find(n =>
                                    n.id === d.target || n.id === d.target?.id
                                );
                                onHover([sourceNode, targetNode]);
                            }
                        })
                        .on('mouseleave', () => {
                            hideTooltip();
                            if (onHover) onHover(null);
                        }),
                    update => update
                        .attr('stroke-width', d => Math.sqrt(d.weight || 1)),
                    exit => exit.remove()
                )
                .attr('d', d => {
                    const sourceNode = simulationNodes.find(n =>
                        n.id === d.source || n.id === d.source?.id
                    );
                    const targetNode = simulationNodes.find(n =>
                        n.id === d.target || n.id === d.target?.id
                    );
                    if (!sourceNode || !targetNode) return '';
                    return `M${sourceNode.x},${sourceNode.y}L${targetNode.x},${targetNode.y}`;
                });

            const nodeG = svg.selectAll('.nodeG').data([1]).join('g').attr('class', 'nodeG');

            const nodesSelection = nodeG.selectAll('.node-circle')
                .data(simulationNodes, d => d.id)
                .join(
                    enter => enter.append('circle')
                        .attr('class', 'node-circle')
                        .attr('r', 8)
                        .attr('fill', d => getClusterColor(d.clusterId))
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 1)
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
                    update => update,
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
                    .attr('stroke', d => d.id === selectedId ? '#fff' : '#fff')
                    .attr('stroke-width', d => d.id === selectedId ? 3 : 1)
                    .style('opacity', d => d.id === selectedId ? selectedOpacity : defaultOpacity);
            }
        }
    }
};

export const getLayouts = () => Object.values(LAYOUT_REGISTRY);
export const getLayout = (id) => LAYOUT_REGISTRY[id];