import * as d3 from 'd3';

const SECTOR_COLORS = {
  Education: '#16a34a',
  Hospitality: '#db2777',
  Housing: '#1a56db',
  'General Services': '#9333ea',
  Other: '#6b7280',
};

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 28;
const LABEL_WIDTH = 130;
const SECTOR_WIDTH = 14;
const CELL_WIDTH = 34;
const GAP_X = 2;
const KPI_WIDTH = 64;

export default class WorkforceMatrixChart {
  constructor(container) {
    this.container = container;
    this.size = { width: 900, height: 550 };
    this.data = null;
    this.visibleSectors = new Set();
    this.volatilityThreshold = 0;
    this.cellMetric = 'headcount';
    this.sortBy = 'avgHeadcount';
    this.svg = null;
    this.chartGroup = null;
    this.tooltip = null;
  }

  create() {
    d3.select(this.container).selectAll('*').remove();

    this.svg = d3.select(this.container)
      .append('svg')
      .style('width', '100%');

    this.tooltip = d3.select(this.container)
      .append('div')
      .attr('class', 'matrix-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('background', 'rgba(17,24,39,0.95)')
      .style('color', '#fff')
      .style('font-size', '11px')
      .style('font-family', 'system-ui, sans-serif')
      .style('padding', '10px 12px')
      .style('border-radius', '8px')
      .style('z-index', '100')
      .style('max-width', '260px')
      .style('line-height', '1.5')
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.3)');

    this.chartGroup = this.svg.append('g');
  }

  update(data) {
    this.data = data?.employers || [];
    this.aggregates = data?.aggregates || {};
    this.sectors = data?.sectors || [];
    if (this.visibleSectors.size === 0) {
      this.visibleSectors = new Set(this.sectors);
    }
    this.render();
  }

  setVisibleSectors(sectors) {
    this.visibleSectors = new Set(sectors);
    this.render();
  }

  setVolatilityThreshold(threshold) {
    this.volatilityThreshold = threshold;
    this.render();
  }

  setCellMetric(metric) {
    this.cellMetric = metric;
    this.render();
  }

  setSortBy(key) {
    this.sortBy = key;
    this.render();
  }

  render() {
    if (!this.data) return;

    this.chartGroup.selectAll('*').remove();
    const g = this.chartGroup;

    let rows = this.data.filter(e => {
      const sectorOk = this.visibleSectors.has(e.industrySector);
      const volatilityOk = e.volatilityIndex >= this.volatilityThreshold;
      return sectorOk && volatilityOk;
    });

    if (rows.length === 0) {
      g.append('text')
        .attr('x', 0)
        .attr('y', 30)
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '12px')
        .text('No employers match current filters');
      return;
    }

    rows.sort((a, b) => (b[this.sortBy] || 0) - (a[this.sortBy] || 0));

    const actualMonths = rows[0] ? rows[0].months.map(m => m.month) : [];
    const monthCount = actualMonths.length;

    function fmtMonth(raw) {
      const d = new Date(raw + (raw.length <= 7 ? '-01' : ''));
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }

    const tableTop = HEADER_HEIGHT + 10;
    const totalRows = rows.length;
    const tableHeight = totalRows * ROW_HEIGHT + HEADER_HEIGHT + 16;

    const xLabelEnd = LABEL_WIDTH;
    const xSectorEnd = xLabelEnd + SECTOR_WIDTH;
    const xCellsStart = xSectorEnd + 6;
    const xCellsEnd = xCellsStart + monthCount * (CELL_WIDTH + GAP_X);
    const xKpiStart = xCellsEnd + 16;
    const xChartWidth = xKpiStart + 3 * KPI_WIDTH + 8;

    const svgHeight = tableHeight + 20;
    this.svg
      .attr('width', xChartWidth)
      .attr('height', svgHeight)
      .attr('viewBox', [0, 0, xChartWidth, svgHeight])
      .style('width', '100%')
      .style('height', null)
      .style('min-height', null);

    const maxTotal = d3.max(rows, e => d3.max(e.months, m => m.total)) || 1;
    const maxTurnover = d3.max(rows, e => d3.max(e.months, m => m.hires + m.separations)) || 1;

    const headcountScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxTotal]);
    const turnoverScale = d3.scaleSequential(d3.interpolateOranges).domain([0, maxTurnover]);

    const maxKpiTurnover = d3.max(rows, e => e.totalTurnover) || 1;
    const turnoverKpiScale = d3.scaleSequential(d3.interpolateOranges).domain([0, maxKpiTurnover]);
    const maxKpiHc = d3.max(rows, e => e.avgHeadcount) || 1;
    const hcKpiScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxKpiHc]);

    // === HEADER ===
    g.append('text')
      .attr('x', LABEL_WIDTH / 2)
      .attr('y', HEADER_HEIGHT / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', 'var(--foreground)')
      .text('Employer');

    actualMonths.forEach((m, i) => {
      g.append('text')
        .attr('x', xCellsStart + i * (CELL_WIDTH + GAP_X) + CELL_WIDTH / 2)
        .attr('y', HEADER_HEIGHT / 2 + 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', '8px')
        .attr('fill', 'var(--muted-foreground)')
        .text(fmtMonth(m));
    });

    ['Avg HC', 'Turnover', 'Volatility'].forEach((label, i) => {
      g.append('text')
        .attr('x', xKpiStart + i * KPI_WIDTH + KPI_WIDTH / 2)
        .attr('y', HEADER_HEIGHT / 2 + 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', '8px')
        .attr('font-weight', '600')
        .attr('fill', 'var(--foreground)')
        .text(label);
    });

    // horizontal rule
    g.append('line')
      .attr('x1', 0).attr('x2', xChartWidth)
      .attr('y1', HEADER_HEIGHT + 4).attr('y2', HEADER_HEIGHT + 4)
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 0.5);

    // === ROWS ===
    rows.forEach((emp, rowIdx) => {
      const y = tableTop + rowIdx * ROW_HEIGHT;

      g.append('rect')
        .attr('x', 0).attr('y', y)
        .attr('width', xChartWidth)
        .attr('height', ROW_HEIGHT - 2)
        .attr('fill', rowIdx % 2 === 0 ? 'var(--card)' : 'transparent')
        .attr('rx', 2);

      g.append('rect')
        .attr('x', xLabelEnd)
        .attr('y', y + 5)
        .attr('width', SECTOR_WIDTH - 4)
        .attr('height', ROW_HEIGHT - 12)
        .attr('fill', SECTOR_COLORS[emp.industrySector] || '#6b7280')
        .attr('rx', 2);

      g.append('text')
        .attr('x', 6)
        .attr('y', y + ROW_HEIGHT / 2 + 3)
        .attr('font-size', '10px')
        .attr('fill', 'var(--foreground)')
        .text(`#${emp.employerId}`);

      emp.months.forEach((m, mi) => {
        const cx = xCellsStart + mi * (CELL_WIDTH + GAP_X);
        const cellVal = this.cellMetric === 'headcount' ? m.total : (m.hires + m.separations);
        const colorScale = this.cellMetric === 'headcount' ? headcountScale : turnoverScale;
        const fill = cellVal > 0 ? colorScale(cellVal) : 'var(--border)';
        const invertText = cellVal > (this.cellMetric === 'headcount' ? maxTotal : maxTurnover) * 0.6;

        const rect = g.append('rect')
          .attr('x', cx).attr('y', y + 2)
          .attr('width', CELL_WIDTH).attr('height', ROW_HEIGHT - 6)
          .attr('fill', fill).attr('rx', 2)
          .attr('cursor', 'pointer');

        g.append('text')
          .attr('x', cx + CELL_WIDTH / 2)
          .attr('y', y + ROW_HEIGHT / 2 + 2)
          .attr('text-anchor', 'middle')
          .attr('font-size', '8px')
          .attr('fill', invertText ? 'white' : 'var(--foreground)')
          .attr('pointer-events', 'none')
          .text(cellVal > 0 ? cellVal : '');

        rect
          .on('mouseenter', (event) => {
            const sign = m.netGrowth >= 0 ? '+' : '';
            this.tooltip.style('opacity', 1).html(`
              <div style="font-weight:600;font-size:12px;margin-bottom:4px">
                Employer #${emp.employerId} — ${fmtMonth(actualMonths[mi])}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px">
                <div><span style="color:#9ca3af">Headcount:</span></div><div>${m.total}</div>
                <div><span style="color:#9ca3af">Retained:</span></div><div>${m.retained}</div>
                <div><span style="color:#9ca3af">Hires:</span></div><div>${m.hires}</div>
                <div><span style="color:#9ca3af">Separations:</span></div><div>${m.separations}</div>
                <div><span style="color:#9ca3af">Net Growth:</span></div>
                <div style="color:${m.netGrowth >= 0 ? '#22c55e' : '#ef4444'}">${sign}${m.netGrowth}</div>
              </div>
            `);
            const cr = this.container.getBoundingClientRect();
            this.tooltip
              .style('left', `${Math.min(event.offsetX + 12, cr.width - 200)}px`)
              .style('top', `${Math.min(event.offsetY + 12, cr.height - 140)}px`);
          })
          .on('mousemove', (event) => {
            const cr = this.container.getBoundingClientRect();
            this.tooltip
              .style('left', `${Math.min(event.offsetX + 12, cr.width - 200)}px`)
              .style('top', `${Math.min(event.offsetY + 12, cr.height - 140)}px`);
          })
          .on('mouseleave', () => { this.tooltip.style('opacity', 0); });
      });

      // KPI: avgHeadcount
      const hc = emp.avgHeadcount;
      g.append('rect')
        .attr('x', xKpiStart).attr('y', y + 2)
        .attr('width', KPI_WIDTH - 4).attr('height', ROW_HEIGHT - 6)
        .attr('fill', hcKpiScale(hc)).attr('rx', 2);
      g.append('text')
        .attr('x', xKpiStart + (KPI_WIDTH - 4) / 2)
        .attr('y', y + ROW_HEIGHT / 2 + 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('fill', hc > maxKpiHc / 2 ? 'white' : 'var(--foreground)')
        .attr('pointer-events', 'none')
        .text(hc.toFixed(0));

      // KPI: totalTurnover
      const to = emp.totalTurnover;
      g.append('rect')
        .attr('x', xKpiStart + KPI_WIDTH).attr('y', y + 2)
        .attr('width', KPI_WIDTH - 4).attr('height', ROW_HEIGHT - 6)
        .attr('fill', turnoverKpiScale(to)).attr('rx', 2);
      g.append('text')
        .attr('x', xKpiStart + KPI_WIDTH + (KPI_WIDTH - 4) / 2)
        .attr('y', y + ROW_HEIGHT / 2 + 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('fill', to > maxKpiTurnover / 2 ? 'white' : 'var(--foreground)')
        .attr('pointer-events', 'none')
        .text(to);

      // KPI: volatilityIndex with threshold coloring
      const vi = emp.volatilityIndex;
      const viColor = vi > 1.0 ? '#ef4444' : (vi > 0.5 ? '#f59e0b' : '#22c55e');
      const viTextColor = vi > 1.0 ? 'white' : 'var(--foreground)';
      g.append('rect')
        .attr('x', xKpiStart + 2 * KPI_WIDTH).attr('y', y + 2)
        .attr('width', KPI_WIDTH - 4).attr('height', ROW_HEIGHT - 6)
        .attr('fill', viColor).attr('rx', 2)
        .attr('opacity', 0.85);
      g.append('text')
        .attr('x', xKpiStart + 2 * KPI_WIDTH + (KPI_WIDTH - 4) / 2)
        .attr('y', y + ROW_HEIGHT / 2 + 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('font-weight', vi > 1.0 ? '600' : '400')
        .attr('fill', viTextColor)
        .attr('pointer-events', 'none')
        .text(vi.toFixed(2));
    });
  }

  destroy() {
    this.tooltip?.remove();
    d3.select(this.container).selectAll('*').remove();
  }
}
