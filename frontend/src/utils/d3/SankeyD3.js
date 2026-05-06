import * as d3 from 'd3';
import { getLayout } from './sankeyLayoutRegistry';

class SankeyD3 {
    margin = { top: 10, right: 10, bottom: 10, left: 10 };
    size = { width: 0, height: 0 };
    svg = null;
    tooltip = null;
    defaultOpacity = 0.7;
    selectedOpacity = 1;
    onSelect = null;
    onHover = null;
    currentData = { nodes: [], links: [] };
    selectedNodeId = null;
    layoutType = 'sankey';

    constructor(el, options = {}) {
        this.el = el;
        this.onSelect = options.onSelect || null;
        this.onHover = options.onHover || null;
    }

create(config) {
        this.size = { width: config.size.width, height: config.size.height };

        // Clear existing
        d3.select(this.el).selectAll("*").remove();

        this.svg = d3.select(this.el)
            .append("svg")
            .attr("width", this.size.width)
            .attr("height", this.size.height)
            .append("g")
            .attr("class", "sankeySvg")
            .attr("transform", `translate(${this.margin.left},${this.margin.top})`);

        // Create tooltip
        this.createTooltip();
    }

    createTooltip() {
        this.tooltip = this.svg.append("g")
            .attr("class", "tooltip")
            .style("display", "none")
            .style("pointer-events", "none");

        this.tooltip.append("rect")
            .attr("class", "tooltip-bg")
            .attr("fill", "rgba(0,0,0,0.95)")
            .attr("rx", 4)
            .attr("stroke", "#fff");

        this.tooltip.append("text")
            .attr("class", "tooltip-text")
            .attr("fill", "white")
            .attr("font-size", "12px");
    }

    showTooltip(event, d) {
        const lines = [];
        
        if (d.originalData) {
            lines.push(`From: ${d.originalData.sourceFinancialQuartile}`);
            lines.push(`To: ${d.originalData.targetFinancialQuartile}`);
            lines.push(`Purpose: ${d.originalData.travelPurpose}`);
            lines.push(`Participants: ${d.originalData.participantCount}`);
            lines.push(`Balance: $${d.originalData.totalStartingBalance?.toLocaleString()}`);
        } else if (d.name) {
            lines.push(d.name);
            if (d.totalValue !== undefined) {
                lines.push(`Total: $${d.totalValue.toLocaleString()}`);
            }
            if (d.layer) {
                lines.push(`Layer: ${d.layer}`);
            }
        }

        const [mx, my] = d3.pointer(event, this.svg.node());
        let tx = mx + 10;
        let ty = my + 10;

        if (tx + 150 > this.size.width) tx = mx - 160;
        if (ty + 100 > this.size.height) ty = my - 110;

        this.tooltip.select(".tooltip-text").selectAll("tspan").remove();
        
        lines.forEach((line, i) => {
            this.tooltip.select(".tooltip-text")
                .append("tspan")
                .text(line)
                .attr("x", 8)
                .attr("dy", i === 0 ? 0 : 16);
        });

        const textEl = this.tooltip.select(".tooltip-text").node();
        if (textEl) {
            const bbox = textEl.getBBox();
            
            this.tooltip.select(".tooltip-bg")
                .attr("x", bbox.x - 4)
                .attr("y", bbox.y - 4)
                .attr("width", bbox.width + 8)
                .attr("height", bbox.height + 8);

            this.tooltip
                .attr("transform", `translate(${tx}, ${ty})`)
                .style("display", "block")
                .raise();
        }
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style("display", "none");
        }
    }

    update(data, layoutType = 'sankey') {
        this.currentData = data;
        this.layoutType = layoutType;

        if (!data || !data.nodes || !data.links) {
            this.clear();
            return;
        }

        const layout = getLayout(layoutType);
        if (!layout) {
            console.error(`Layout '${layoutType}' not found`);
            return;
        }

        const width = this.size.width - this.margin.left - this.margin.right;
        const height = this.size.height - this.margin.top - this.margin.bottom;

        const layoutData = layout.applyLayout(data, width, height);

        // Clear previous
        layout.clear(this.svg);

        // Re-create tooltip if removed
        if (!this.tooltip || this.tooltip.empty()) {
            this.createTooltip();
        }

        // Render
        layout.render(this.svg, data, layoutData, {
            onSelect: this.onSelect,
            onHover: (items) => {
                const currentId = items && items[0]?.id;
                if (currentId !== this.lastHoveredId) {
                    this.lastHoveredId = currentId;
                    if (this.onHover) {
                        this.onHover(items);
                    }
                }
            },
            defaultOpacity: this.defaultOpacity,
            selectedOpacity: this.selectedOpacity,
            showTooltip: (event, d) => this.showTooltip(event, d),
            hideTooltip: () => this.hideTooltip(),
            selectedNodeId: this.selectedNodeId,
            width,
            height,
        });
    }

    updateSelection(selectedNodeId) {
        this.selectedNodeId = selectedNodeId;
        
        if (!this.svg) return;
        
        const width = this.size.width - this.margin.left - this.margin.right;
        const height = this.size.height - this.margin.top - this.margin.bottom;
        
        // Re-render with selection
        const layout = getLayout(this.layoutType);
        if (layout) {
            layout.clear(this.svg);
            
            const layoutData = layout.applyLayout(this.currentData, width, height);
            
            layout.render(this.svg, this.currentData, layoutData, {
                onSelect: this.onSelect,
                onHover: (items) => {
                    if (this.onHover) {
                        this.onHover(items);
                    }
                },
                defaultOpacity: this.defaultOpacity,
                selectedOpacity: this.selectedOpacity,
                showTooltip: (event, d) => this.showTooltip(event, d),
                hideTooltip: () => this.hideTooltip(),
                selectedNodeId: this.selectedNodeId,
                width,
                height,
            });
        }
    }

    updateHover(hoveredData) {
        if (!hoveredData || hoveredData.length === 0) {
            this.svg?.selectAll(".nodeG").select(".nodeRect")
                .attr("stroke", "#fff");
            return;
        }
        
        const hoveredIds = new Set(hoveredData.map(d => d.id));
        
        this.svg?.selectAll(".nodeG")
            .select(".nodeRect")
            .attr("stroke", d => hoveredIds.has(d.id) ? "#e6550d" : "#fff");
    }

    clear() {
        if (this.el) {
            d3.select(this.el).selectAll("*").remove();
        }
    }

    destroy() {
        this.clear();
        this.svg = null;
        this.tooltip = null;
    }
}

export default SankeyD3;