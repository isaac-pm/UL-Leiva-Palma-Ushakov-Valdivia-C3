import * as d3 from 'd3';
import { getLayout } from './networkLayoutRegistry';

const CLUSTER_COLORS = {
    0: '#2563eb',
    3: '#ea580c',
    4: '#9333ea',
    5: '#dc2626',
    6: '#059669',
    7: '#0891b2',
    9: '#d97706',
};

const TRAVEL_PURPOSE_COLORS = {
    'commute': '#3b82f6',
    'recreation': '#10b981',
    'eating': '#f59e0b',
    'goingHome': '#8b5cf6',
    'returningFromRestaurant': '#ef4444'
};

const TRAVEL_PURPOSE_LABELS = {
    'commute': 'Work/Home Commute',
    'recreation': 'Recreation',
    'eating': 'Eating',
    'goingHome': 'Going Home',
    'returningFromRestaurant': 'Returning from Restaurant'
};

class NetworkD3 {
    margin = { top: 20, right: 20, bottom: 20, left: 20 };
    size;
    height;
    width;
    svg;
    tooltip;
    simulation;
    defaultOpacity = 0.3;
    selectedOpacity = 1;
    onSelect = null;
    onHover = null;
    currentNodes = [];
    currentLinks = [];
    currentSelectedId = null;
    currentHoveredId = null;

    constructor(el, options = {}) {
        this.el = el;
        this.onSelect = options.onSelect || null;
        this.onHover = options.onHover || null;
    }

    create(config) {
        this.size = { width: config.size.width, height: config.size.height };
        this.width = this.size.width - this.margin.left - this.margin.right;
        this.height = this.size.height - this.margin.top - this.margin.bottom;

        d3.select(this.el).selectAll('*').remove();

        // Keep references: this.svg = root, this.g = group
        this.svg = d3.select(this.el)
            .append('svg')
            .attr('width', this.size.width)
            .attr('height', this.size.height)
            .attr('viewBox', [0, 0, this.size.width, this.size.height])
            .attr('style', 'max-width: 100%; height: auto;')
            .attr('class', 'network-svg');

        // Add zoom/pan behavior - filter to only respond to background clicks
        this.zoom = d3.zoom()
            .scaleExtent([0.5, 8])
            .filter((event) => {
                // Only zoom on SVG background, not on nodes/links
                const target = event.target;
                return target.tagName === 'svg' || d3.select(target).classed('network-svg');
            })
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });
        
        this.svg.call(this.zoom);

        // Create graph group first (will be zoomed)
        this.g = this.svg.append('g')
            .attr('class', 'networkG')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        // Create tooltip at SVG root level (NOT inside this.g - so it won't scale)
        this.tooltip = this.svg.append('g')
            .attr('class', 'tooltip')
            .style('display', 'none')
            .style('pointer-events', 'none');

        this.tooltip.append('rect')
            .attr('class', 'tooltip-bg')
            .attr('fill', 'rgba(0,0,0,0.95)')
            .attr('rx', 4)
            .attr('stroke', '#fff');

        this.tooltip.append('text')
            .attr('class', 'tooltip-text')
            .attr('fill', 'white')
            .attr('font-size', '12px');
    }

    showTooltip(event, d) {
        if (!d) return;
        
        const node = d.data || d;
        if (!node) return;
        
        const clusterId = node.clusterId ?? String(node.id)?.replace('cluster_', '') ?? 'Unknown';
        const category = node.category || 'Cluster';
        const interactionCount = node.interactionCount || node.totalWeight || node.totalInteractions || this.getLinkWeight(node.id) || 'N/A';
        const dominantTravel = node.dominantTravelPurpose || 'commute';
        const travelLabel = TRAVEL_PURPOSE_LABELS[dominantTravel] || 'Work/Home Commute';

        const lines = [
            `Cluster: ${clusterId}`,
            `Dominant Travel: ${travelLabel}`,
            `Total Interactions: ${typeof interactionCount === 'number' ? interactionCount.toLocaleString() : interactionCount}`,
        ];

        // Use event pointer coordinates (in screen space, not zoomed space)
        let tx, ty;
        if (event && event.x !== undefined && event.y !== undefined) {
            tx = event.x + 15;
            ty = event.y - 15;
        } else if (node.x !== undefined && node.y !== undefined) {
            // Get screen coordinates from transformed node position
            const transform = d3.zoomTransform(this.svg.node());
            tx = transform.applyX(node.x) + 15;
            ty = transform.applyY(node.y) - 15;
        } else {
            tx = 50;
            ty = 50;
        }

        // Keep tooltip within bounds
        if (tx + 150 > this.width) tx = tx - 165;
        if (ty + 60 > this.height) ty = ty - 65;

        this.tooltip.select('.tooltip-text').selectAll('tspan').remove();

        lines.forEach((line, i) => {
            this.tooltip.select('.tooltip-text')
                .append('tspan')
                .text(line)
                .attr('x', 8)
                .attr('dy', i === 0 ? 0 : 18);
        });

        const textEl = this.tooltip.select('.tooltip-text').node();
        const bbox = textEl.getBBox();

        this.tooltip.select('.tooltip-bg')
            .attr('x', bbox.x - 4)
            .attr('y', bbox.y - 4)
            .attr('width', bbox.width + 8)
            .attr('height', bbox.height + 8);

        this.tooltip
            .attr('transform', `translate(${tx}, ${ty})`)
            .style('display', 'block')
            .raise();
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style('display', 'none');
        }
    }

    getLinkWeight(nodeId) {
        if (!nodeId) return null;
        const clusterId = String(nodeId).replace('cluster_', '');
        let total = 0;
        this.currentLinks.forEach(link => {
            const sourceId = String(link.source?.id || link.source);
            const targetId = String(link.target?.id || link.target);
            if (sourceId.includes(clusterId) || targetId.includes(clusterId)) {
                total += link.weight || 1;
            }
        });
        return total || null;
    }

    update(data) {
        const { nodes = [], links = [] } = data;

        console.log('[NetworkD3] update called with', nodes.length, 'nodes,', links.length, 'links');
        
        if (!nodes.length) {
            console.log('[NetworkD3] No nodes - returning');
            return;
        }
        
        console.log('[NetworkD3] First node:', nodes[0]);

        this.currentNodes = nodes;
        this.currentLinks = links;

        const layout = getLayout('force');

        if (!layout) {
            console.error('Force layout not found in registry');
            return;
        }

        if (!this.g || this.g.empty()) {
            console.log('[NetworkD3] this.g is empty');
            return;
        }

        console.log('[NetworkD3] Rendering via this.g');

        if (!this.tooltip || this.tooltip.empty()) {
            this.createTooltip();
        }

        layout.render(this.g, nodes, links, {
            width: this.width,
            height: this.height,
            rootSvg: this.svg,
            onSelect: this.onSelect,
            onHover: (items) => {
                const currentId = items ? items[0]?.id : null;
                if (currentId !== this.currentHoveredId) {
                    this.currentHoveredId = currentId;
                    if (this.onHover) {
                        this.onHover(items);
                    }
                }
            },
            showTooltip: (event, d) => this.showTooltip(event, d),
            hideTooltip: () => this.hideTooltip(),
            defaultOpacity: this.defaultOpacity,
            selectedOpacity: this.selectedOpacity,
            selectedId: this.currentSelectedId,
            getClusterColor: (node) => {
                if (node && node.dominantTravelPurpose) {
                    return TRAVEL_PURPOSE_COLORS[node.dominantTravelPurpose] || '#94a3b8';
                }
                return CLUSTER_COLORS[node?.clusterId] || '#94a3b8';
            },
            getNodeSize: (node) => {
                const totalInteractions = node?.totalInteractions || node?.totalWeight || 1;
                return 8 + Math.min(32, totalInteractions / 300);
            }
        });

        // Center view on new data - reset zoom transform
        if (this.zoom && this.svg) {
            this.svg.transition()
                .duration(500)
                .call(this.zoom.transform, d3.zoomIdentity);
        }
    }

    updateSelection(selectedId) {
        this.currentSelectedId = selectedId;

        if (!selectedId) {
            this.svg.selectAll('.node-circle')
                .attr('stroke', '#fff')
                .attr('stroke-width', 1)
                .style('opacity', this.defaultOpacity);

            this.svg.selectAll('.link-path')
                .style('opacity', this.defaultOpacity);

            return;
        }

        this.svg.selectAll('.node-circle')
            .attr('stroke', d => {
                const nodeId = d.id || `cluster_${d.clusterId}`;
                return nodeId === selectedId ? '#fff' : '#fff';
            })
            .attr('stroke-width', d => {
                const nodeId = d.id || `cluster_${d.clusterId}`;
                return nodeId === selectedId ? 3 : 1;
            })
            .style('opacity', d => {
                const nodeId = d.id || `cluster_${d.clusterId}`;
                return nodeId === selectedId ? this.selectedOpacity : this.defaultOpacity;
            });

        this.svg.selectAll('.link-path')
            .style('opacity', d => {
                const sourceId = String(d.source?.id || d.source);
                const targetId = String(d.target?.id || d.target);
                return (sourceId === selectedId || targetId === selectedId) ? this.selectedOpacity : this.defaultOpacity * 0.5;
            });
    }

    updateHover(hoveredId) {
        if (!hoveredId) {
            this.svg.selectAll('.node-circle')
                .attr('stroke', '#fff');
            return;
        }

        this.svg.selectAll('.node-circle')
            .attr('stroke', d => {
                const nodeId = d.id || `cluster_${d.clusterId}`;
                return nodeId === hoveredId ? '#fbbf24' : '#fff';
            });
    }

    clear() {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }
        d3.select(this.el).selectAll('*').remove();
    }

    destroy() {
        this.clear();
    }
}

export default NetworkD3;