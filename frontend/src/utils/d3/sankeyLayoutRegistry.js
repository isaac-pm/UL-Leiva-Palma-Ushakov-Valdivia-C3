import * as d3 from 'd3';
import * as d3Sankey from 'd3-sankey';

const LAYOUT_REGISTRY = {
    sankey: {
        id: 'sankey',
        label: 'Sankey',
        description: 'Flow diagram from source → middle → target',
        
        applyLayout: (data, width, height) => {
            const { nodes, links } = data;
            
            if (!nodes || !nodes.length || !links || !links.length) {
                return { nodes: [], links: [] };
            }
            
            const sankeyNodes = nodes.map((node) => ({ ...node }));
            const sankeyLinks = links.map((link) => ({
                ...link,
                source: link.source,
                target: link.target,
            }));
            
            const sankeyGenerator = d3Sankey.sankey()
                .nodeWidth(20)
                .nodePadding(20)
                .extent([[1, 1], [width - 1, height - 1]]);
            
            try {
                const result = sankeyGenerator({
                    nodes: sankeyNodes,
                    links: sankeyLinks,
                });
                return { nodes: result.nodes, links: result.links };
            } catch (e) {
                console.error('Sankey error:', e);
                return { nodes: [], links: [] };
            }
        },
        
        clear: (svg) => {
            svg.selectAll(".sankeyG, .link, .nodeRect, .nodeLabel").remove();
        },
        
        render: (svg, data, layoutData, options) => {
            const { nodes: layoutNodes, links: layoutLinks } = layoutData;
            const { 
                onSelect, 
                onHover, 
                defaultOpacity = 0.7, 
                selectedOpacity = 1,
                showTooltip,
                hideTooltip,
                selectedNodeId,
                width: svgWidth = 800,
            } = options;
            
            if (!layoutNodes?.length) return;
            
            const sankeyG = svg.selectAll(".sankeyG").data([1]).join("g").attr("class", "sankeyG");
            
            // Strong saturated colors for NODES
            const nodeColorScale = d3.scaleOrdinal()
                .domain(['LowIncome', 'MediumIncome', 'HighIncome', 'VeryHighIncome'])
                .range(['#2563eb', '#ea580c', '#9333ea', '#dc2626']);

            // Light colors for FLOWS
            const flowColorScale = d3.scaleOrdinal()
                .domain(['LowIncome', 'MediumIncome', 'HighIncome', 'VeryHighIncome'])
                .range(['#93c5fd', '#fdba74', '#d8b4fe', '#fca5a5']);
            
            // Helper to get quartile category from originalData
            const getQuartileCategory = (d) => {
                const quartileMap = {1:'LowIncome',2:'MediumIncome',3:'HighIncome',4:'VeryHighIncome'};
                return d.originalData?.sourceFinancialQuartile ? 
                    quartileMap[d.originalData.sourceFinancialQuartile] : 'VeryHighIncome';
            };
            
            // Layer 1 links: source → middle (USE PRESERVED sourceLayer/targetLayer)
            const layer1Links = layoutLinks.filter(l => l.sourceLayer === 1 && l.targetLayer === 2);
            
            sankeyG.selectAll(".link-layer1")
                .data(layer1Links)
                .join("path")
                .attr("class", "link link-layer1")
                .attr("d", d3Sankey.sankeyLinkHorizontal())
                .attr("fill", "none")
                .attr("stroke", d => flowColorScale(getQuartileCategory(d)))
                .attr("stroke-opacity", defaultOpacity)
                .attr("stroke-width", d => Math.max(1, d.width || 1))
                .style("cursor", "pointer")
                .on("click", (event, d) => { if (onSelect && d.originalData) onSelect([d.originalData]); })
                .on("mouseenter", (event, d) => { 
                    if (showTooltip && d.originalData) showTooltip(event, d); 
                    if (onHover && d.originalData) onHover([d.originalData]); 
                })
                .on("mouseleave", () => { 
                    hideTooltip(); 
                    if (onHover) onHover(null); 
                });
            
            // Layer 2 links: middle → target (USE PRESERVED sourceLayer/targetLayer)
            const layer2Links = layoutLinks.filter(l => l.sourceLayer === 2 && l.targetLayer === 3);
            
            sankeyG.selectAll(".link-layer2")
                .data(layer2Links)
                .join("path")
                .attr("class", "link link-layer2")
                .attr("d", d3Sankey.sankeyLinkHorizontal())
                .attr("fill", "none")
                .attr("stroke", d => flowColorScale(getQuartileCategory(d)))
                .attr("stroke-opacity", defaultOpacity)
                .attr("stroke-width", d => Math.max(1, d.width || 1))
                .style("cursor", "pointer")
                .on("click", (event, d) => { if (onSelect && d.originalData) onSelect([d.originalData]); })
                .on("mouseenter", (event, d) => { 
                    if (showTooltip && d.originalData) showTooltip(event, d); 
                    if (onHover && d.originalData) onHover([d.originalData]); 
                })
                .on("mouseleave", () => { 
                    hideTooltip(); 
                    if (onHover) onHover(null); 
                });
            
            // Nodes
            const validNodes = layoutNodes.filter(n => n && n.x0 !== undefined);
            
            const nodeG = sankeyG.selectAll(".nodeG")
                .data(validNodes)
                .join("g")
                .attr("class", "nodeG")
                .attr("transform", d => `translate(${d.x0},${d.y0})`)
                .style("cursor", "pointer");
            
            nodeG.selectAll(".nodeRect")
                .data(d => [d])
                .join("rect")
                .attr("class", "nodeRect")
                .attr("width", d => Math.max(0, d.x1 - d.x0))
                .attr("height", d => Math.max(0, d.y1 - d.y0))
                .attr("fill", d => nodeColorScale(d.category || 'VeryHighIncome'))
                .attr("stroke", "#fff")
                .attr("stroke-width", 1)
                .style("opacity", d => !selectedNodeId ? defaultOpacity : d.id === selectedNodeId ? selectedOpacity : defaultOpacity * 0.3)
                .on("click", (event, d) => { if (onSelect) onSelect(layoutNodes.filter(n => n.id === d.id)); })
                .on("mouseenter", (event, d) => { 
                    if (showTooltip) {
                        showTooltip(event, d); 
                    }
                    if (onHover) onHover(layoutNodes.filter(n => n.id === d.id)); 
                })
                .on("mouseleave", () => { hideTooltip(); if (onHover) onHover(null); });
            
            nodeG.selectAll(".nodeLabel")
                .data(d => [d])
                .join("text")
                .attr("class", "nodeLabel")
                .attr("x", d => d.x0 < svgWidth / 2 ? d.x1 - d.x0 + 6 : -6)
                .attr("y", d => (d.y1 - d.y0) / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", d => d.x0 < svgWidth / 2 ? "start" : "end")
                .attr("fill", "currentColor")
                .attr("font-size", "11px")
                .attr("font-weight", "500")
                .text(d => d.name);
        }
    }
};

export const getLayouts = () => Object.values(LAYOUT_REGISTRY);
export const getLayout = (id) => LAYOUT_REGISTRY[id];
export default LAYOUT_REGISTRY;