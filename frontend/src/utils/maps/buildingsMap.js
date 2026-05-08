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

    this.zoom = d3
      .zoom()
      .scaleExtent([0.3, 15])
      .filter((event) => !event.ctrlKey && !event.button)
      .on('zoom', (event) => {
        this.zoomLayer.attr('transform', event.transform);
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
      this.zoomLayer.selectAll('*').remove();
      return;
    }

    const { min, max } = bounds;
    const dx = max[0] - min[0];
    const dy = max[1] - min[1];
    const containerWidth = this.el?.clientWidth || this.size.width;
    const innerWidth = Math.max(containerWidth - this.margin.left - this.margin.right, 1);
    const ratio = dx && dy ? dy / dx : 1;
    const innerHeight = innerWidth * ratio;
    const targetHeight = innerHeight + this.margin.top + this.margin.bottom;
    const widthChanged = Math.abs(containerWidth - this.size.width) > 1;
    const heightChanged = Math.abs(targetHeight - this.size.height) > 1;

    if (widthChanged || heightChanged) {
      this.size = { width: containerWidth, height: targetHeight };
      this.svg
        .attr('width', this.size.width)
        .attr('height', this.size.height)
        .attr('viewBox', [0, 0, this.size.width, this.size.height]);
      this.el.style.height = `${targetHeight}px`;
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

    const transform = d3.zoomIdentity;

    this.svg.call(this.zoom.transform, transform);

    const polygonSelection = this.zoomLayer
      .selectAll('path.building-polygon')
      .data(polygons, (d) => d.id);

    polygonSelection.exit().remove();

    const polygonEnter = polygonSelection
      .enter()
      .append('path')
      .attr('class', 'building-polygon')
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('stroke', DEFAULT_STROKE)
      .attr('stroke-width', 0.6)
      .attr('fill-opacity', 0.65)
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
      .attr('fill', (d) => DEFAULT_COLORS[d.type] || DEFAULT_COLORS.Unknown)
      .attr('d', pathBuilder);

    this.updateSelection();
  }

  updateSelection() {
    if (!this.zoomLayer) return;

    this.zoomLayer.selectAll('path.building-polygon')
      .attr('stroke', (d) => (d.id === this.currentSelection ? SELECTED_STROKE : DEFAULT_STROKE))
      .attr('stroke-width', (d) => (d.id === this.currentSelection ? 1.8 : 0.6))
      .attr('fill-opacity', (d) => (d.id === this.currentSelection ? 0.9 : 0.65));
  }

  destroy() {
    d3.select(this.el).selectAll('*').remove();
  }
}
