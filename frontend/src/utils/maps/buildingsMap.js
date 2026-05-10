import * as d3 from 'd3';

const DEFAULT_COLORS = {
  Apartment: '#7EA8F8',
  Commercial: '#581C87',
  Employer: '#9333EA',
  Pub: '#DB2777',
  Residential: '#1A56DB',
  Residental: '#1A56DB',
  Restaurant: '#0891B2',
  School: '#111827',
  Unknown: '#6b7280',
};

const SELECTED_STROKE = '#8b5cf6';
const BRUSH_FILL = 'rgba(139, 92, 246, 0.12)';
const BRUSH_STROKE = '#8b5cf6';

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
    this.onBrushEnd = options.onBrushEnd || null;
    this.selectedBuildings = new Set();
    this.size = { width: 800, height: 500 };
    this.margin = { top: 16, right: 16, bottom: 16, left: 16 };
    this.rotation = options.rotation ?? 'ccw';
    this.useGeoCorrection = options.useGeoCorrection ?? true;
    this.mapPoint = null;
    this.hexbinLayer = null;
    this.buildingsLayer = null;
    this.currentZoomK = 1;
    this.brushOverlay = null;
    this.brushRect = null;
    this.brushActive = false;
    this.brushStart = null;
    this.shiftHeld = false;
    this._keydownHandler = null;
    this._keyupHandler = null;
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

    // brush selection rect (outside zoomLayer so it stays in viewport coords)
    this.brushRect = this.svg.append('rect')
      .attr('class', 'brush-rect')
      .attr('fill', BRUSH_FILL)
      .attr('stroke', BRUSH_STROKE)
      .attr('stroke-dasharray', '4,2')
      .attr('stroke-width', 1.5)
      .attr('rx', 3)
      .style('display', 'none')
      .style('pointer-events', 'none');

    // transparent overlay for intercepting Shift+drag
    this.brushOverlay = this.svg.append('rect')
      .attr('class', 'brush-overlay')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .style('pointer-events', 'none');

    // track Shift key
    this._keydownHandler = (e) => {
      if (e.key === 'Shift') {
        this.shiftHeld = true;
        if (this.brushOverlay) {
          this.brushOverlay.style('pointer-events', 'all');
        }
      }
    };
    this._keyupHandler = (e) => {
      if (e.key === 'Shift') {
        this.shiftHeld = false;
        if (this.brushOverlay) {
          this.brushOverlay.style('pointer-events', 'none');
        }
        this._endBrush();
      }
    };
    document.addEventListener('keydown', this._keydownHandler);
    document.addEventListener('keyup', this._keyupHandler);

    // brush events on overlay
    this.brushOverlay
      .on('mousedown', (event) => {
        if (!this.shiftHeld) return;
        this.brushActive = true;
        const rect = this.svg.node().getBoundingClientRect();
        this.brushStart = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        this.brushRect
          .attr('x', this.brushStart.x)
          .attr('y', this.brushStart.y)
          .attr('width', 0)
          .attr('height', 0)
          .style('display', null);
      })
      .on('mousemove', (event) => {
        if (!this.brushActive || !this.brushStart) return;
        const rect = this.svg.node().getBoundingClientRect();
        const cx = event.clientX - rect.left;
        const cy = event.clientY - rect.top;
        const x = Math.min(this.brushStart.x, cx);
        const y = Math.min(this.brushStart.y, cy);
        this.brushRect
          .attr('x', x)
          .attr('y', y)
          .attr('width', Math.abs(cx - this.brushStart.x))
          .attr('height', Math.abs(cy - this.brushStart.y));
      })
      .on('mouseup', (event) => {
        if (!this.brushActive) return;
        this._completeBrush(event);
      })
      .on('mouseleave', () => {
        if (this.brushActive) {
          this._endBrush();
        }
      });

    this.zoom = d3
      .zoom()
      .scaleExtent([0.3, 15])
      .filter((event) => !event.ctrlKey && !event.button && !event.shiftKey)
      .on('zoom', (event) => {
        this.currentZoomK = event.transform.k;
        this.zoomLayer.attr('transform', event.transform);
        this.updateBuildingStrokeWidth();
      });

    this.svg.call(this.zoom);
  }

  _completeBrush(event) {
    if (!this.brushActive || !this.brushStart) {
      this._endBrush();
      return;
    }

    const rect = this.svg.node().getBoundingClientRect();
    const endX = event.clientX - rect.left;
    const endY = event.clientY - rect.top;

    const left = Math.min(this.brushStart.x, endX);
    const topY = Math.min(this.brushStart.y, endY);
    const right = Math.max(this.brushStart.x, endX);
    const bottom = Math.max(this.brushStart.y, endY);

    const minArea = 4;
    if ((right - left) * (bottom - topY) < minArea) {
      this._endBrush();
      return;
    }

    // convert brush rect to zoomLayer space
    const xf = d3.zoomTransform(this.svg.node());
    const p1 = xf.invert([left, topY]);
    const p2 = xf.invert([right, bottom]);
    const rLeft = Math.min(p1[0], p2[0]), rTop = Math.min(p1[1], p2[1]);
    const rRight = Math.max(p1[0], p2[0]), rBottom = Math.max(p1[1], p2[1]);

    const hitIds = [];
    this.buildingsLayer.selectAll('path.building-polygon').each(function (d) {
      const bbox = this.getBBox();
      if (bbox.x < rRight && bbox.x + bbox.width > rLeft &&
          bbox.y < rBottom && bbox.y + bbox.height > rTop) {
        hitIds.push(d.id);
      }
    });

    // add to selection
    for (const id of hitIds) {
      this.selectedBuildings.add(id);
    }
    this._applySelectionStroke();

    if (this.onBrushEnd) {
      this.onBrushEnd(Array.from(this.selectedBuildings));
    }

    this._endBrush();
  }

  _endBrush() {
    this.brushActive = false;
    this.brushStart = null;
    if (this.brushRect) {
      this.brushRect.style('display', 'none');
    }
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

  setSelectedBuildings(ids) {
    this.selectedBuildings = new Set(ids);
    this._applySelectionStroke();
  }

  clearSelection() {
    this.selectedBuildings.clear();
    this._applySelectionStroke();
    if (this.onBrushEnd) {
      this.onBrushEnd([]);
    }
  }

  update(polygons) {
    if (!this.svg || !this.zoomLayer) return;

    // clean stale selections
    const validIds = new Set(polygons.map(p => p.id));
    for (const id of this.selectedBuildings) {
      if (!validIds.has(id)) {
        this.selectedBuildings.delete(id);
      }
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
      if (this.brushOverlay) {
        this.brushOverlay
          .attr('width', this.size.width)
          .attr('height', this.size.height);
      }
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
        if (event.shiftKey) return;
        if (this.selectedBuildings.has(d.id)) {
          this.selectedBuildings.delete(d.id);
        } else {
          this.selectedBuildings.add(d.id);
        }
        this._applySelectionStroke();
        if (this.onBrushEnd) this.onBrushEnd(Array.from(this.selectedBuildings));
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
      .attr('fill', 'transparent')
      .attr('stroke', (d) => DEFAULT_COLORS[d.type] || DEFAULT_COLORS.Unknown)
      .attr('stroke-width', (d) => this.getZoomStrokeWidth(d))
      .attr('d', pathBuilder)
      .attr('stroke-dasharray', (d) => this.selectedBuildings.has(d.id) ? '6,3' : null);

    this._applySelectionStroke();
  }

  getZoomStrokeWidth(d) {
    const w = Math.max(0.2, Math.min(2, 0.5 * this.currentZoomK));
    if (d && d.id === this.currentSelection) return Math.max(2.5, w + 1);
    if (d && this.selectedBuildings.has(d.id)) return Math.max(2, w + 0.5);
    return w;
  }

  updateBuildingStrokeWidth() {
    if (!this.buildingsLayer) return;
    this.buildingsLayer.selectAll('path.building-polygon')
      .attr('stroke-width', (d) => this.getZoomStrokeWidth(d));
  }

  _applySelectionStroke() {
    if (!this.buildingsLayer) return;
    this.buildingsLayer.selectAll('path.building-polygon')
      .attr('stroke', (d) => (this.selectedBuildings.has(d.id)
        ? SELECTED_STROKE
        : DEFAULT_COLORS[d.type] || DEFAULT_COLORS.Unknown))
      .attr('stroke-width', (d) => this.getZoomStrokeWidth(d))
      .attr('stroke-dasharray', (d) => this.selectedBuildings.has(d.id) ? '6,3' : null);
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
        .attr('fill', 'transparent')
        .attr('stroke', (d) => DEFAULT_COLORS[d.type] || DEFAULT_COLORS.Unknown)
        .attr('stroke-width', (d) => this.getZoomStrokeWidth(d))
        .attr('stroke-dasharray', (d) => this.selectedBuildings.has(d.id) ? '6,3' : null);
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
      .attr('stroke-width', (d) => this.getZoomStrokeWidth(d))
      .attr('stroke-dasharray', (d) => this.selectedBuildings.has(d.id) ? '6,3' : null);
  }

  destroy() {
    document.removeEventListener('keydown', this._keydownHandler);
    document.removeEventListener('keyup', this._keyupHandler);
    this._keydownHandler = null;
    this._keyupHandler = null;
    d3.select(this.el).selectAll('*').remove();
  }
}
