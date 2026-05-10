import * as d3 from 'd3';

const SECTOR_COLORS = {
  Education: '#16a34a',
  Hospitality: '#db2777',
  Housing: '#1a56db',
  'General Services': '#9333ea',
  Other: '#6b7280',
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (m) => { const p = m?.split('-'); return p ? `${MONTH_NAMES[+p[1]-1]||''} '${p[0].slice(2)}` : m; };

const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 36;
const MODULE_GAP = 30;

export default class WorkforceCompositeChart {
  constructor(container) {
    this.container = container;
    this.data = null;
    this.sectorFilter = null;
    this.svg = null;
    this.tooltip = null;
  }

  create() {
    d3.select(this.container).selectAll('*').remove();

    this.svg = d3.select(this.container)
      .append('svg')
      .style('width', '100%');

    this.tooltip = d3.select(this.container)
      .append('div')
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
      .style('max-width', '280px')
      .style('line-height', '1.5')
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.3)');
  }

  setSectorFilter(sector) {
    this.sectorFilter = sector;
    this.render();
  }

  update(data) {
    this.data = data?.employers || [];
    this.sectors = data?.sectors || [];
    if (!this.sectorFilter && this.sectors.length > 0) {
      this.sectorFilter = this.sectors[0];
    }
    this.render();
  }

  render() {
    if (!this.data) return;

    const { width: containerWidth } = this.container.getBoundingClientRect();
    const w = Math.max(containerWidth, 700);
    const scatterH = 220;
    const slopeH = 340;
    const totalH = scatterH + slopeH + MODULE_GAP + MARGIN_TOP + MARGIN_BOTTOM + 20;

    d3.select(this.container).select('svg').selectAll('*').remove();
    const svg = this.svg;
    svg.attr('width', w).attr('height', totalH).attr('viewBox', [0, 0, w, totalH]);

    const g = svg.append('g').attr('transform', `translate(0,${MARGIN_TOP})`);

    // ---- filter employers ----
    let employers = this.data;
    if (this.sectorFilter) {
      employers = employers.filter(e => e.industrySector === this.sectorFilter);
    }
    if (employers.length === 0) {
      g.append('text')
        .attr('x', w / 2).attr('y', 40)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '12px')
        .text('No employers match the selected sector');
      return;
    }

    // ---- compute monthly aggregates ----
    const monthMap = {};
    employers.forEach(emp => {
      (emp.months || []).forEach(m => {
        if (!monthMap[m.month]) monthMap[m.month] = { churnRates: [], activityRates: [], count: 0 };
        monthMap[m.month].churnRates.push(m.churnRate);
        const activity = m.total > 0 ? (m.hires + m.separations) / m.total : 0;
        monthMap[m.month].activityRates.push(activity);
      });
    });

    const sortedMonths = Object.keys(monthMap).sort();
    const aggPoints = sortedMonths.map(m => {
      const d = monthMap[m];
      return {
        month: m,
        avgTurnoverRate: d3.mean(d.churnRates),
        avgVolatility: d3.mean(d.activityRates),
      };
    });

    // ============================================================
    // MODULE 1 – Connected Scatterplot
    // ============================================================
    const sLeft = 60, sRight = 40, sTop = 10;
    const sInnerW = w - sLeft - sRight;
    const sInnerH = scatterH - sTop - 10;

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(aggPoints, p => p.avgTurnoverRate) * 1.15 || 0.5])
      .range([0, sInnerW]).nice();

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(aggPoints, p => p.avgVolatility) * 1.15 || 0.5])
      .range([sInnerH, 0]).nice();

    // axes
    const xAxis = d3.axisBottom(xScale).ticks(5).tickFormat(d => (d * 100).toFixed(0) + '%');
    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat(d => (d * 100).toFixed(0) + '%');

    g.append('g')
      .attr('transform', `translate(${sLeft},${sTop + sInnerH})`)
      .call(xAxis)
      .selectAll('text').attr('font-size', '9').attr('fill', 'var(--muted-foreground)');

    g.append('g')
      .attr('transform', `translate(${sLeft},${sTop})`)
      .call(yAxis)
      .selectAll('text').attr('font-size', '9').attr('fill', 'var(--muted-foreground)');

    // titles
    g.append('text')
      .attr('x', sLeft + sInnerW / 2).attr('y', sTop + sInnerH + 22)
      .attr('text-anchor', 'middle').attr('font-size', '9').attr('fill', 'var(--foreground)')
      .text('Avg Turnover Rate (Churn Rate)');

    g.append('text')
      .attr('x', -sTop - sInnerH / 2).attr('y', 14)
      .attr('transform', 'rotate(-90)')
      .attr('text-anchor', 'middle').attr('font-size', '9').attr('fill', 'var(--foreground)')
      .text('Avg Volatility (Activity Rate)');

    // module label
    g.append('text')
      .attr('x', 0).attr('y', 0)
      .attr('font-size', '10').attr('font-weight', '600').attr('fill', 'var(--foreground)')
      .text('Macro Trajectory');

    // path
    const lineGen = d3.line()
      .x(d => sLeft + xScale(d.avgTurnoverRate))
      .y(d => sTop + yScale(d.avgVolatility))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(aggPoints)
      .attr('d', lineGen)
      .attr('fill', 'none')
      .attr('stroke', 'var(--foreground)')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.5);

    // arrows along the path
    for (let i = 0; i < aggPoints.length - 1; i++) {
      const p1 = aggPoints[i], p2 = aggPoints[i + 1];
      const x1 = sLeft + xScale(p1.avgTurnoverRate);
      const y1 = sTop + yScale(p1.avgVolatility);
      const x2 = sLeft + xScale(p2.avgTurnoverRate);
      const y2 = sTop + yScale(p2.avgVolatility);
      const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

      g.append('polygon')
        .attr('points', '-5,-3 5,0 -5,3')
        .attr('transform', `translate(${midX},${midY}) rotate(${angle})`)
        .attr('fill', 'var(--foreground)')
        .attr('opacity', 0.5);
    }

    // nodes
    aggPoints.forEach((p) => {
      const cx = sLeft + xScale(p.avgTurnoverRate);
      const cy = sTop + yScale(p.avgVolatility);

      g.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 5)
        .attr('fill', '#8b5cf6')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .attr('cursor', 'pointer');

      // label
      g.append('text')
        .attr('x', cx).attr('y', cy - 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '8')
        .attr('font-weight', '600')
        .attr('fill', 'var(--foreground)')
        .text(monthLabel(p.month));

      // hover
      const monthName = monthLabel(p.month);
      g.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 10)
        .attr('fill', 'transparent')
        .attr('cursor', 'pointer')
        .on('mouseenter', () => {
          this.tooltip.style('opacity', 1).html(`
            <div style="font-weight:600;font-size:12px;margin-bottom:4px">${monthName}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px">
              <div><span style="color:#9ca3af">Avg Turnover Rate:</span></div>
              <div>${(p.avgTurnoverRate * 100).toFixed(1)}%</div>
              <div><span style="color:#9ca3af">Avg Volatility:</span></div>
              <div>${(p.avgVolatility * 100).toFixed(1)}%</div>
              <div><span style="color:#9ca3af">Employers:</span></div>
              <div>${employers.length}</div>
            </div>
          `);
        })
        .on('mousemove', (event) => {
          const cr = this.container.getBoundingClientRect();
          this.tooltip
            .style('left', `${Math.min(event.offsetX + 14, cr.width - 220)}px`)
            .style('top', `${Math.min(event.offsetY + 14, cr.height - 120)}px`);
        })
        .on('mouseleave', () => { this.tooltip.style('opacity', 0); });
    });

    // ============================================================
    // MODULE 2 – Slope Chart
    // ============================================================
    const slopeY = scatterH + MODULE_GAP;

    const slLeft = 110, slRight = 110, slTop = 24;
    const slInnerW = w - slLeft - slRight;
    const slInnerH = slopeH - slTop - 10;

    // module label
    g.append('text')
      .attr('x', 0).attr('y', slopeY + 2)
      .attr('font-size', '10').attr('font-weight', '600').attr('fill', 'var(--foreground)')
      .text('Employer Stability Matrix');

    // sort by startHeadcount descending for visual clarity
    const sorted = [...employers].sort((a, b) => b.startHeadcount - a.startHeadcount);

    const allHc = sorted.flatMap(e => [e.startHeadcount, e.endHeadcount]);
    const minHc = Math.max(0, Math.min(...allHc) * 0.8);
    const maxHc = Math.max(...allHc) * 1.2 || 1;

    const ySlScale = d3.scaleLinear()
      .domain([minHc, maxHc])
      .range([slInnerH, 0]);

    const maxTurnover = d3.max(sorted, e => e.totalTurnover) || 1;
    const bubbleR = d3.scaleSqrt()
      .domain([0, maxTurnover])
      .range([2, 22]);

    // axes
    const yAxisSl = d3.axisLeft(ySlScale).ticks(5).tickFormat(d3.format('d'));
    g.append('g')
      .attr('transform', `translate(${slLeft},${slopeY + slTop})`)
      .call(yAxisSl)
      .selectAll('text').attr('font-size', '10').attr('fill', 'var(--muted-foreground)');

    const yAxisSlR = d3.axisRight(ySlScale).ticks(5).tickFormat(d3.format('d'));
    g.append('g')
      .attr('transform', `translate(${slLeft + slInnerW},${slopeY + slTop})`)
      .call(yAxisSlR)
      .selectAll('text').attr('font-size', '10').attr('fill', 'var(--muted-foreground)');

    // axis labels
    g.append('text')
      .attr('x', slLeft).attr('y', slopeY + slTop - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10').attr('font-weight', '600').attr('fill', 'var(--foreground)')
      .text('Start Headcount');

    g.append('text')
      .attr('x', slLeft + slInnerW).attr('y', slopeY + slTop - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10').attr('font-weight', '600').attr('fill', 'var(--foreground)')
      .text('End Headcount');

    // grid lines
    const gridTicks = ySlScale.ticks(5);
    gridTicks.forEach(y => {
      g.append('line')
        .attr('x1', slLeft).attr('x2', slLeft + slInnerW)
        .attr('y1', slopeY + slTop + ySlScale(y))
        .attr('y2', slopeY + slTop + ySlScale(y))
        .attr('stroke', 'var(--border)')
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '2,2');
    });

    // slope lines
    sorted.forEach(emp => {
      const x1 = slLeft, x2 = slLeft + slInnerW;
      const y1 = slopeY + slTop + ySlScale(emp.startHeadcount);
      const y2 = slopeY + slTop + ySlScale(emp.endHeadcount);
      const ym = (y1 + y2) / 2;
      const color = SECTOR_COLORS[emp.industrySector] || '#6b7280';
      const isDown = emp.endHeadcount < emp.startHeadcount;
      const strokeW = isDown && emp.volatilityIndex > 0.5 ? 2.5 : 1.5;
      const opacity = 0.3 + Math.min(emp.volatilityIndex / 3, 0.7);

      const line = g.append('line')
        .attr('x1', x1).attr('y1', y1)
        .attr('x2', x2).attr('y2', y2)
        .attr('stroke', color)
        .attr('stroke-width', strokeW)
        .attr('stroke-opacity', opacity)
        .style('cursor', 'pointer');

      // bubble
      g.append('circle')
        .attr('cx', (x1 + x2) / 2)
        .attr('cy', ym)
        .attr('r', bubbleR(emp.totalTurnover))
        .attr('fill', color)
        .attr('fill-opacity', opacity * 0.35)
        .attr('stroke', color)
        .attr('stroke-opacity', opacity * 0.6)
        .attr('stroke-width', 0.8)
        .style('pointer-events', 'none');

      // start/end dots
      g.append('circle')
        .attr('cx', x1).attr('cy', y1).attr('r', 3)
        .attr('fill', color).attr('fill-opacity', opacity)
        .style('pointer-events', 'none');
      g.append('circle')
        .attr('cx', x2).attr('cy', y2).attr('r', 3)
        .attr('fill', color).attr('fill-opacity', opacity)
        .style('pointer-events', 'none');

      // hover
      const changeSign = emp.netChange >= 0 ? '+' : '';
      line
        .on('mouseenter', () => {
          line.attr('stroke-width', 4).attr('stroke-opacity', 1);
          this.tooltip.style('opacity', 1).html(`
            <div style="font-weight:600;font-size:12px;margin-bottom:4px">
              Employer #${emp.employerId}
              <span style="color:${color};margin-left:8px;font-weight:400">${emp.industrySector}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px">
              <div><span style="color:#9ca3af">Headcount:</span></div>
              <div>${emp.startHeadcount} → ${emp.endHeadcount}
                <span style="color:${emp.netChange >= 0 ? '#22c55e' : '#ef4444'};margin-left:4px">
                  ${changeSign}${emp.netChange} (${changeSign}${emp.netChangePct}%)
                </span>
              </div>
              <div><span style="color:#9ca3af">Total Turnover:</span></div>
              <div>${emp.totalTurnover}</div>
              <div><span style="color:#9ca3af">Volatility Index:</span></div>
              <div>${emp.volatilityIndex.toFixed(2)}</div>
              <div><span style="color:#9ca3af">Avg Headcount:</span></div>
              <div>${emp.avgHeadcount.toFixed(0)}</div>
            </div>
          `);
        })
        .on('mousemove', (event) => {
          const cr = this.container.getBoundingClientRect();
          this.tooltip
            .style('left', `${Math.min(event.offsetX + 14, cr.width - 240)}px`)
            .style('top', `${Math.min(event.offsetY + 14, cr.height - 160)}px`);
        })
        .on('mouseleave', () => {
          line.attr('stroke-width', strokeW).attr('stroke-opacity', opacity);
          this.tooltip.style('opacity', 0);
        })
        ;
      });
  }

  destroy() {
    this.tooltip?.remove();
    d3.select(this.container).selectAll('*').remove();
  }
}
