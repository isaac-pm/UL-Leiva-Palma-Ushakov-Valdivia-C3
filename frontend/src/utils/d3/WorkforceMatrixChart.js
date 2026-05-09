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

function fmtMonth(raw) {
  const d = new Date(raw + (raw.length <= 7 ? '-01' : ''));
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default class WorkforceMatrixChart {
  constructor(container) {
    this.container = container;
    this.size = { width: 900, height: 550 };
    this.data = null;
    this.visibleSectors = new Set();
    this.volatilityRange = [0, Infinity];
    this.cellMetric = 'headcount';
    this.sortBy = 'avgHeadcount';
    this.svg = null;
    this.chartGroup = null;
    this.tooltip = null;
    this._layoutDirty = false;
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
    this._layoutDirty = true;
    this.render();
  }

  setVisibleSectors(sectors) {
    this.visibleSectors = new Set(sectors);
    this._layoutDirty = true;
    this.render();
  }

  setVolatilityRange(range) {
    this.volatilityRange = range;
    this._layoutDirty = true;
    this.render();
  }

  setCellMetric(metric) {
    this.cellMetric = metric;
    this._updateCellsAndKpis();
  }

  setSortBy(key) {
    this.sortBy = key;
    this._layoutDirty = true;
    this.render();
  }

  _getFilteredSortedRows() {
    let rows = this.data.filter(e => {
      const sectorOk = this.visibleSectors.has(e.industrySector);
      const vi = e.volatilityIndex;
      return sectorOk && vi >= this.volatilityRange[0] && vi <= this.volatilityRange[1];
    });
    rows.sort((a, b) => (b[this.sortBy] || 0) - (a[this.sortBy] || 0));
    return rows;
  }

  _updateCellsAndKpis() {
    if (!this.data || !this.chartGroup) return;
    const rows = this._getFilteredSortedRows();
    if (rows.length === 0) return;

    const maxTotal = d3.max(rows, e => d3.max(e.months, m => m.total)) || 1;
    const maxTurnover = d3.max(rows, e => d3.max(e.months, m => m.hires + m.separations)) || 1;
    const headcountScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxTotal]);
    const turnoverScale = d3.scaleSequential(d3.interpolateOranges).domain([0, maxTurnover]);
    const maxKpiTurnover = d3.max(rows, e => e.totalTurnover) || 1;
    const turnoverKpiScale = d3.scaleSequential(d3.interpolateOranges).domain([0, maxKpiTurnover]);
    const maxKpiHc = d3.max(rows, e => e.avgHeadcount) || 1;
    const hcKpiScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxKpiHc]);
    const self = this;

    this.chartGroup.selectAll('g.row').each(function (emp) {
      const rowEl = d3.select(this);

      emp.months.forEach((m, mi) => {
        const cellVal = self.cellMetric === 'headcount' ? m.total : (m.hires + m.separations);
        const scale = self.cellMetric === 'headcount' ? headcountScale : turnoverScale;
        const fill = cellVal > 0 ? scale(cellVal) : 'var(--border)';
        const maxVal = self.cellMetric === 'headcount' ? maxTotal : maxTurnover;
        const invertText = cellVal > maxVal * 0.6;

        const cellG = rowEl.select(`g.cell-${mi}`);
        cellG.select('rect').attr('fill', fill);
        cellG.select('text')
          .attr('fill', invertText ? 'white' : 'var(--foreground)')
          .text(cellVal > 0 ? cellVal : '');
      });

      const hc = emp.avgHeadcount;
      const to = emp.totalTurnover;
      const vi = emp.volatilityIndex;
      const viColor = vi > 1.0 ? '#ef4444' : (vi > 0.5 ? '#f59e0b' : '#22c55e');
      const viTextColor = vi > 1.0 ? 'white' : 'var(--foreground)';

      const kpis = [
        { ki: 0, val: hc, scale: hcKpiScale, label: hc.toFixed(0), textColor: hc > maxKpiHc / 2 ? 'white' : 'var(--foreground)' },
        { ki: 1, val: to, scale: turnoverKpiScale, label: to, textColor: to > maxKpiTurnover / 2 ? 'white' : 'var(--foreground)' },
        { ki: 2, val: vi, scale: null, label: vi.toFixed(2), color: viColor, textColor: viTextColor },
      ];

      kpis.forEach(({ ki, val, scale, label, color, textColor }) => {
        const kpiG = rowEl.select(`g.kpi-${ki}`);
        const fill = scale ? scale(val) : color;
        const opacity = ki === 2 ? 0.85 : 1;
        kpiG.select('rect').attr('fill', fill).attr('opacity', opacity);
        kpiG.select('text')
          .attr('fill', textColor)
          .attr('font-weight', ki === 2 && vi > 1.0 ? '600' : '400')
          .text(label);
      });
    });
  }

  render() {
    if (!this.data) return;

    const rows = this._getFilteredSortedRows();

    if (rows.length === 0) {
      this.chartGroup.selectAll('*').remove();
      this.chartGroup.append('text')
        .attr('x', 0).attr('y', 30)
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '12px')
        .text('No employers match current filters');
      return;
    }

    this._rows = rows;

    const actualMonths = rows[0].months.map(m => m.month);
    const monthCount = actualMonths.length;
    const totalRows = rows.length;
    const tableTop = HEADER_HEIGHT + 10;

    const xLabelEnd = LABEL_WIDTH;
    const xSectorEnd = xLabelEnd + SECTOR_WIDTH;
    const xCellsStart = xSectorEnd + 6;
    const xCellsEnd = xCellsStart + monthCount * (CELL_WIDTH + GAP_X);
    const xKpiStart = xCellsEnd + 16;
    const xChartWidth = xKpiStart + 3 * KPI_WIDTH + 8;
    const svgHeight = tableTop + totalRows * ROW_HEIGHT + 20;

    this.svg
      .attr('width', xChartWidth)
      .attr('height', svgHeight)
      .attr('viewBox', [0, 0, xChartWidth, svgHeight])
      .style('width', '100%').style('height', null);

    const maxTotal = d3.max(rows, e => d3.max(e.months, m => m.total)) || 1;
    const maxTurnover = d3.max(rows, e => d3.max(e.months, m => m.hires + m.separations)) || 1;
    const headcountScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxTotal]);
    const turnoverScale = d3.scaleSequential(d3.interpolateOranges).domain([0, maxTurnover]);
    const maxKpiTurnover = d3.max(rows, e => e.totalTurnover) || 1;
    const turnoverKpiScale = d3.scaleSequential(d3.interpolateOranges).domain([0, maxKpiTurnover]);
    const maxKpiHc = d3.max(rows, e => e.avgHeadcount) || 1;
    const hcKpiScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxKpiHc]);

    const self = this;

    // ── HEADER (few elements, always rebuild) ──
    this.chartGroup.selectAll('.hdr').remove();

    this.chartGroup.append('text').attr('class', 'hdr')
      .attr('x', LABEL_WIDTH / 2).attr('y', HEADER_HEIGHT / 2 + 4)
      .attr('text-anchor', 'middle').attr('font-size', '10px')
      .attr('font-weight', '600').attr('fill', 'var(--foreground)')
      .text('Employer');

    actualMonths.forEach((m, i) => {
      this.chartGroup.append('text').attr('class', 'hdr')
        .attr('x', xCellsStart + i * (CELL_WIDTH + GAP_X) + CELL_WIDTH / 2)
        .attr('y', HEADER_HEIGHT / 2 + 4)
        .attr('text-anchor', 'middle').attr('font-size', '8px')
        .attr('fill', 'var(--muted-foreground)')
        .text(fmtMonth(m));
    });

    ['Avg HC', 'Turnover', 'Volatility'].forEach((label, i) => {
      this.chartGroup.append('text').attr('class', 'hdr')
        .attr('x', xKpiStart + i * KPI_WIDTH + KPI_WIDTH / 2)
        .attr('y', HEADER_HEIGHT / 2 + 4)
        .attr('text-anchor', 'middle').attr('font-size', '8px')
        .attr('font-weight', '600').attr('fill', 'var(--foreground)')
        .text(label);
    });

    this.chartGroup.append('line').attr('class', 'hdr')
      .attr('x1', 0).attr('x2', xChartWidth)
      .attr('y1', HEADER_HEIGHT + 4).attr('y2', HEADER_HEIGHT + 4)
      .attr('stroke', 'var(--border)').attr('stroke-width', 0.5);

    // ── ROWS (data join — reuse existing DOM) ──
    const rowData = rows.map((d, i) => Object.assign({}, d, { _rowIdx: i }));

    this.chartGroup.selectAll('g.row')
      .data(rowData, d => d.employerId)
      .join(
        enter => {
          const g = enter.append('g').attr('class', 'row');

          g.append('rect').attr('class', 'row-bg');

          g.append('rect').attr('class', 'sector-swatch');

          g.append('text').attr('class', 'emp-label');

          for (let mi = 0; mi < monthCount; mi++) {
            const cg = g.append('g').attr('class', `cell-${mi}`);
            cg.append('rect').attr('cursor', 'pointer');
            cg.append('text').attr('pointer-events', 'none');
          }

          for (let ki = 0; ki < 3; ki++) {
            const kg = g.append('g').attr('class', `kpi-${ki}`);
            kg.append('rect');
            kg.append('text').attr('pointer-events', 'none');
          }

          return g;
        },
        update => update,
        exit => exit.remove()
      )
      .attr('transform', d => `translate(0,${tableTop + d._rowIdx * ROW_HEIGHT})`)
      .call(selection => {
        selection.select('rect.row-bg')
          .attr('x', 0).attr('y', 0)
          .attr('width', xChartWidth)
          .attr('height', ROW_HEIGHT - 2)
          .attr('rx', 2)
          .attr('fill', d => d._rowIdx % 2 === 0 ? 'var(--card)' : 'transparent');

        selection.select('rect.sector-swatch')
          .attr('x', xLabelEnd).attr('y', 5)
          .attr('width', SECTOR_WIDTH - 4)
          .attr('height', ROW_HEIGHT - 12)
          .attr('rx', 2)
          .attr('fill', d => SECTOR_COLORS[d.industrySector] || '#6b7280');

        selection.select('text.emp-label')
          .attr('x', 6).attr('y', ROW_HEIGHT / 2 + 3)
          .attr('font-size', '10px')
          .attr('fill', 'var(--foreground)')
          .text(d => `#${d.employerId}`);

        // Cells — update per-month rects and texts
        selection.each(function (emp) {
          const rowEl = d3.select(this);

          emp.months.forEach((m, mi) => {
            const cellVal = self.cellMetric === 'headcount' ? m.total : (m.hires + m.separations);
            const scale = self.cellMetric === 'headcount' ? headcountScale : turnoverScale;
            const fill = cellVal > 0 ? scale(cellVal) : 'var(--border)';
            const maxVal = self.cellMetric === 'headcount' ? maxTotal : maxTurnover;
            const invertText = cellVal > maxVal * 0.6;

            const cellG = rowEl.select(`g.cell-${mi}`);
            cellG.select('rect')
              .attr('x', xCellsStart + mi * (CELL_WIDTH + GAP_X))
              .attr('y', 2)
              .attr('width', CELL_WIDTH).attr('height', ROW_HEIGHT - 6)
              .attr('rx', 2)
              .attr('fill', fill)
              .on('mouseenter', function (event) {
                const sign = m.netGrowth >= 0 ? '+' : '';
                self.tooltip.style('opacity', 1).html(`
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
                const cr = self.container.getBoundingClientRect();
                self.tooltip
                  .style('left', `${Math.min(event.offsetX + 12, cr.width - 200)}px`)
                  .style('top', `${Math.min(event.offsetY + 12, cr.height - 140)}px`);
              })
              .on('mousemove', function (event) {
                const cr = self.container.getBoundingClientRect();
                self.tooltip
                  .style('left', `${Math.min(event.offsetX + 12, cr.width - 200)}px`)
                  .style('top', `${Math.min(event.offsetY + 12, cr.height - 140)}px`);
              })
              .on('mouseleave', () => { self.tooltip.style('opacity', 0); });

            cellG.select('text')
              .attr('x', xCellsStart + mi * (CELL_WIDTH + GAP_X) + CELL_WIDTH / 2)
              .attr('y', ROW_HEIGHT / 2 + 2)
              .attr('text-anchor', 'middle').attr('font-size', '8px')
              .attr('fill', invertText ? 'white' : 'var(--foreground)')
              .text(cellVal > 0 ? cellVal : '');
          });

          // KPI columns
          const hc = emp.avgHeadcount;
          const to = emp.totalTurnover;
          const vi = emp.volatilityIndex;
          const viColor = vi > 1.0 ? '#ef4444' : (vi > 0.5 ? '#f59e0b' : '#22c55e');
          const viTextColor = vi > 1.0 ? 'white' : 'var(--foreground)';

          const kpiDefs = [
            { ki: 0, val: hc, scale: hcKpiScale, label: hc.toFixed(0), textColor: hc > maxKpiHc / 2 ? 'white' : 'var(--foreground)' },
            { ki: 1, val: to, scale: turnoverKpiScale, label: to, textColor: to > maxKpiTurnover / 2 ? 'white' : 'var(--foreground)' },
            { ki: 2, val: vi, scale: null, label: vi.toFixed(2), color: viColor, textColor: viTextColor },
          ];

          kpiDefs.forEach(({ ki, val, scale, label, color, textColor }) => {
            const kx = xKpiStart + ki * KPI_WIDTH;
            const kpiG = rowEl.select(`g.kpi-${ki}`);
            const fill = scale ? scale(val) : color;
            const opacity = ki === 2 ? 0.85 : 1;

            kpiG.select('rect')
              .attr('x', kx).attr('y', 2)
              .attr('width', KPI_WIDTH - 4).attr('height', ROW_HEIGHT - 6)
              .attr('rx', 2)
              .attr('fill', fill)
              .attr('opacity', opacity);

            kpiG.select('text')
              .attr('x', kx + (KPI_WIDTH - 4) / 2)
              .attr('y', ROW_HEIGHT / 2 + 2)
              .attr('text-anchor', 'middle').attr('font-size', '9px')
              .attr('fill', textColor)
              .attr('font-weight', ki === 2 && vi > 1.0 ? '600' : '400')
              .text(label);
          });
        });
      });
  }

  destroy() {
    this.tooltip?.remove();
    d3.select(this.container).selectAll('*').remove();
  }
}
