import * as d3 from 'd3';

const DEFAULT_COLORS = {
  Commercial: '#f97316',
  Residential: '#2563eb',
  Residental: '#2563eb',
  School: '#16a34a',
  Unknown: '#6b7280',
};

const SELECTED_STROKE = '#fef3c7';
const DEFAULT_STROKE = '#111827';

const HEX_RADIUS_DEFAULT = 20;

function hexagonPath(radius) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i - Math.PI / 6;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';
}

function generateHexGrid(points, radius, width, height) {
  const dx = radius * Math.sqrt(3);
  const dy = radius * 1.5;
  const ox = dx / 2;
  const r2 = radius * radius;

  const pad = radius * 2;
  const startCol = Math.floor((0 - pad) / dx) - 1;
  const endCol = Math.ceil((width + pad) / dx) + 1;
  const startRow = Math.floor((0 - pad) / dy) - 1;
  const endRow = Math.ceil((height + pad) / dy) + 1;

  const bins = [];
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const cx = col * dx + (row % 2) * ox;
      const cy = row * dy;
      const members = [];
      for (const p of points) {
        const ddx = p.px - cx;
        const ddy = p.py - cy;
        if (ddx * ddx + ddy * ddy < r2) {
          members.push(p);
        }
      }
      bins.push({ x: cx, y: cy, members });
    }
  }
  return bins;
}

export default class BuildingsMapD3 {
  constructor(el, options = {}) {
    this.el = el;
    this.onSelect = options.onSelect || null;
    this.onHover = options.onHover || null;
    this.currentSelection = null;
    this.size = { width: 800, height: 500 };
    this.margin = { top: 16, right: 16, bottom: 16, left: 16 };
    this.rotation = options.rotation ?? 'ccw';
    this.useGeoCorrection = options.useGeoCorrection ?? true;
    this.mapPoint = null;
    this.hexbinLayer = null;
    this.buildingsLayer = null;
    this.currentZoomK = 1;
  }

  create({ size }) {
    this.size = size || this.size;
    const { width, height } = this.size;

    d3.select(this.el).selectAll('*').remove();

    this.svg = d3
      .select(this.el)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .attr('class', 'buildings-map-svg')
      .style('width', '100%')
      .style('height', '100%');

    this.zoomLayer = this.svg.append('g').attr('class', 'buildings-map-layer');
    this.hexbinLayer = this.zoomLayer.append('g').attr('class', 'hexbin-layer');
    this.buildingsLayer = this.zoomLayer.append('g').attr('class', 'buildings-layer');

    this.zoom = d3
      .zoom()
      .scaleExtent([0.3, 15])
      .filter((event) => !event.ctrlKey && !event.button)
      .on('zoom', (event) => {
        this.currentZoomK = event.transform.k;
        this.zoomLayer.attr('transform', event.transform);
        this.updateBuildingStrokeWidth();
      });

    this.svg.call(this.zoom);
  }

  isGeoCoordinates(polygons) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    polygons.forEach((polygon) => {
      polygon.rings.forEach((ring) => {
        ring.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        });
      });
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return false;
    }

    return minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
  }

  computeBounds(polygons, projectPoint) {
    const min = [Infinity, Infinity];
    const max = [-Infinity, -Infinity];

    polygons.forEach((polygon) => {
      polygon.rings.forEach((ring) => {
        ring.forEach(([x, y]) => {
          const [tx, ty] = projectPoint([x, y]);
          if (tx < min[0]) min[0] = tx;
          if (ty < min[1]) min[1] = ty;
          if (tx > max[0]) max[0] = tx;
          if (ty > max[1]) max[1] = ty;
        });
      });
    });

    if (!Number.isFinite(min[0]) || !Number.isFinite(min[1])) {
      return null;
    }

    return { min, max };
  }

  update(polygons) {
    if (!this.svg || !this.zoomLayer) return;

    if (this.currentSelection && !polygons.some((item) => item.id === this.currentSelection)) {
      this.currentSelection = null;
    }

    if (!polygons || polygons.length === 0) {
      this.buildingsLayer.selectAll('*').remove();
      this.hexbinLayer.selectAll('*').remove();
      return;
    }

    const useGeoCorrection = this.useGeoCorrection && this.isGeoCoordinates(polygons);

    const projectPoint = ([x, y]) => {
      let lon = x;
      let lat = y;
      if (useGeoCorrection) {
        const latRad = (lat * Math.PI) / 180;
        lon = lon * Math.cos(latRad);
      }

      if (this.rotation === 'cw') {
        return [lat, -lon];
      }
      if (this.rotation === 'ccw') {
        return [-lat, lon];
      }
      if (this.rotation === '180') {
        return [-lon, -lat];
      }

      return [lon, lat];
    };

    const bounds = this.computeBounds(polygons, projectPoint);
    if (!bounds) {
      this.buildingsLayer.selectAll('*').remove();
      this.hexbinLayer.selectAll('*').remove();
      return;
    }

    const { min, max } = bounds;
    const dx = max[0] - min[0];
    const dy = max[1] - min[1];
    const containerWidth = this.el?.clientWidth || this.size.width;
    const containerHeight = this.el?.clientHeight || this.size.height;
    let targetWidth = containerWidth;
    let targetHeight = containerHeight;

    if (!containerHeight || containerHeight <= 0) {
      const innerWidth = Math.max(containerWidth - this.margin.left - this.margin.right, 1);
      const ratio = dx && dy ? dy / dx : 1;
      const innerHeight = innerWidth * ratio;
      targetHeight = innerHeight + this.margin.top + this.margin.bottom;
      if (this.el) {
        this.el.style.height = `${targetHeight}px`;
      }
    }

    const widthChanged = Math.abs(targetWidth - this.size.width) > 1;
    const heightChanged = Math.abs(targetHeight - this.size.height) > 1;

    if (widthChanged || heightChanged) {
      this.size = { width: targetWidth, height: targetHeight };
      this.svg
        .attr('width', this.size.width)
        .attr('height', this.size.height)
        .attr('viewBox', [0, 0, this.size.width, this.size.height]);
    }

    const width = this.size.width - this.margin.left - this.margin.right;
    const height = this.size.height - this.margin.top - this.margin.bottom;
    const scale = Math.min(width / (dx || 1), height / (dy || 1));
    const offsetX = this.margin.left + (width - dx * scale) / 2;
    const offsetY = this.margin.top + (height - dy * scale) / 2;

    const extent = [
      [0, 0],
      [this.size.width, this.size.height],
    ];
    const translateExtent = [
      [offsetX, offsetY],
      [offsetX + dx * scale, offsetY + dy * scale],
    ];

    this.zoom.extent(extent).translateExtent(translateExtent);
    this.svg.call(this.zoom);

    const mapPoint = (point) => {
      const [tx, ty] = projectPoint(point);
      const x = offsetX + (tx - min[0]) * scale;
      const y = offsetY + (max[1] - ty) * scale;
      return [x, y];
    };

    this.mapPoint = mapPoint;

    const transform = d3.zoomIdentity;

    this.svg.call(this.zoom.transform, transform);

    const polygonSelection = this.buildingsLayer
      .selectAll('path.building-polygon')
      .data(polygons, (d) => d.id);

    polygonSelection.exit().remove();

    const polygonEnter = polygonSelection
      .enter()
      .append('path')
      .attr('class', 'building-polygon')
      .attr('vector-effect', 'non-scaling-stroke')
      .on('click', (event, d) => {
        this.currentSelection = d.id;
        this.updateSelection();
        if (this.onSelect) this.onSelect(d);
      })
      .on('mousemove', (event, d) => {
        if (this.onHover) this.onHover(event, d);
      })
      .on('mouseleave', () => {
        if (this.onHover) this.onHover(null, null);
      });

    const lineGenerator = d3
      .line()
      .x((point) => mapPoint(point)[0])
      .y((point) => mapPoint(point)[1])
      .curve(d3.curveLinearClosed);

    const pathBuilder = (d) => {
      const segments = d.rings.map((ring) => {
        return lineGenerator(ring);
      });
      return segments.join(' ');
    };

    const merged = polygonEnter.merge(polygonSelection);
    merged
      .attr('fill', 'none')
      .attr('stroke', (d) => DEFAULT_COLORS[d.type] || DEFAULT_COLORS.Unknown)
      .attr('stroke-width', (d) => this.getZoomStrokeWidth(d))
      .attr('d', pathBuilder);

    this.updateSelection();
  }

  getZoomStrokeWidth(d) {
    const w = Math.max(0.2, Math.min(2, 0.5 * this.currentZoomK));
    if (d && d.id === this.currentSelection) return Math.max(2.5, w + 1);
    return w;
  }

  updateBuildingStrokeWidth() {
    if (!this.buildingsLayer) return;
    this.buildingsLayer.selectAll('path.building-polygon')
      .attr('stroke-width', (d) => this.getZoomStrokeWidth(d));
  }

  updateSelection() {
    if (!this.zoomLayer) return;

    this.buildingsLayer.selectAll('path.building-polygon')
      .attr('stroke', (d) => (d.id === this.currentSelection
        ? SELECTED_STROKE
        : DEFAULT_COLORS[d.type] || DEFAULT_COLORS.Unknown))
      .attr('stroke-width', (d) => this.getZoomStrokeWidth(d));
  }

  updateHexbin(employers, layerState, stats, callbacks = {}, hexRadius = HEX_RADIUS_DEFAULT) {
    if (!this.hexbinLayer || !this.mapPoint) return;

    const activeLayer = ['jobConcentration', 'wageGeography', 'employerStability']
      .find(k => layerState[k]);

    if (!activeLayer) {
      this.hexbinLayer.selectAll('*').remove();
      return;
    }

    if ((activeLayer === 'wageGeography' && layerState.wageMode === 'specific') ||
        (activeLayer === 'employerStability' && layerState.stabilityMode === 'specific')) {
      this.hexbinLayer.selectAll('*').remove();
      return;
    }

    const width = this.size.width - this.margin.left - this.margin.right;
    const height = this.size.height - this.margin.top - this.margin.bottom;

    const projected = employers.map(e => {
      const [px, py] = this.mapPoint([e.location.x, e.location.y]);
      return { ...e, px, py };
    });

    const bins = generateHexGrid(projected, hexRadius, width, height);

    let colorFn;

    if (activeLayer === 'jobConcentration') {
      bins.forEach(b => {
        b.value = b.members.reduce((s, m) => s + m.jobCount, 0);
      });
      const maxVal = Math.max(...bins.map(b => b.value), 1);
      colorFn = d3.scaleSequential([0, maxVal], d3.interpolateRdYlGn);
    } else if (activeLayer === 'wageGeography') {
      bins.forEach(b => {
        const valid = b.members.map(m => m.avgHourlyRate).filter(r => r > 0);
        b.value = valid.length > 0 ? d3.mean(valid) : 0;
      });
      const [minV, maxV] = d3.extent(bins.map(b => b.value)) || [0, 1];
      colorFn = d3.scaleSequential([Math.max(0, minV), Math.max(maxV, 1)], d3.interpolateRdYlGn);
    } else if (activeLayer === 'employerStability') {
      bins.forEach(b => {
        const valid = b.members.map(m => m.wageVariance).filter(v => Number.isFinite(v));
        b.value = valid.length > 0 ? d3.mean(valid) : 0;
      });
      const [t1, t2] = (stats && stats.varianceThresholds) || [0, 0];
      colorFn = (v) => {
        if (v <= t1) return '#22c55e';
        if (v <= t2) return '#f59e0b';
        return '#ef4444';
      };
    }

    const hexPath = hexagonPath(hexRadius);
    const selection = this.hexbinLayer
      .selectAll('path.hex-bin')
      .data(bins);

    selection.exit().remove();

    const enter = selection.enter()
      .append('path')
      .attr('class', 'hex-bin')
      .attr('vector-effect', 'non-scaling-stroke')
      .on('mouseover', (event, d) => {
        if (d.members.length > 0 && callbacks.onHover) callbacks.onHover(event, d);
      })
      .on('mouseleave', () => {
        if (callbacks.onHover) callbacks.onHover(null, null);
      })
      .on('click', (event, d) => {
        if (d.members.length > 0 && callbacks.onSelect) callbacks.onSelect(event, d);
      });

    const merged = enter.merge(selection);

    merged
      .attr('d', hexPath)
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .attr('stroke', d => d.members.length === 0 ? '#9ca3af' : '#fff')
      .attr('stroke-width', 0.5)
      .attr('stroke-opacity', d => d.members.length === 0 ? 0.5 : 0.8)
      .attr('fill', d => {
        if (d.members.length === 0) return 'none';
        return colorFn(d.value);
      })
      .attr('fill-opacity', d => d.members.length === 0 ? 0 : 0.7);
  }

  updatePolygonFill(employers, layerState, stats) {
    if (!this.buildingsLayer) return;

    const wageSpecific = layerState.wageGeography && layerState.wageMode === 'specific';
    const stabSpecific = layerState.employerStability && layerState.stabilityMode === 'specific';

    if (!wageSpecific && !stabSpecific) {
      this.buildingsLayer.selectAll('path.building-polygon')
        .attr('fill', 'none')
        .attr('stroke', (d) => DEFAULT_COLORS[d.type] || DEFAULT_COLORS.Unknown)
        .attr('stroke-width', (d) => this.getZoomStrokeWidth(d));
      return;
    }

    const wageLookup = {};
    const varLookup = {};
    employers.forEach(e => {
      if (e.buildingId != null) {
        wageLookup[e.buildingId] = e.avgHourlyRate;
        varLookup[e.buildingId] = e.wageVariance;
      }
    });

    const wages = Object.values(wageLookup).filter(w => w > 0);
    const minWage = wages.length > 0 ? Math.min(...wages) : 0;
    const maxWage = wages.length > 0 ? Math.max(...wages) : 1;
    const wageColor = d3.scaleSequential(
      [Math.max(0, minWage), Math.max(maxWage, 1)],
      d3.interpolateRdYlGn
    );

    const [t1, t2] = (stats && stats.varianceThresholds) || [0, 0];
    const varColor = (v) => {
      if (v <= t1) return '#22c55e';
      if (v <= t2) return '#f59e0b';
      return '#ef4444';
    };

    this.buildingsLayer.selectAll('path.building-polygon')
      .attr('fill', (d) => {
        if (wageSpecific) {
          const w = wageLookup[d.id];
          if (w != null && w > 0) return wageColor(w);
        }
        if (stabSpecific) {
          const v = varLookup[d.id];
          if (v != null && Number.isFinite(v)) return varColor(v);
        }
        return 'none';
      })
      .attr('stroke', (d) => DEFAULT_COLORS[d.type] || DEFAULT_COLORS.Unknown)
      .attr('stroke-width', (d) => this.getZoomStrokeWidth(d));
  }

  destroy() {
    d3.select(this.el).selectAll('*').remove();
  }
}
