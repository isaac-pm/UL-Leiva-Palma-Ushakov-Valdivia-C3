import { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import {
  EMPLOYER_EDU_COLORS,
  EMPLOYER_EDU_LABELS,
  EMPLOYER_STABILITY_COLORS,
  EMPLOYER_STABILITY_LABELS,
  EMPLOYER_WAGE_GRADIENT,
} from '../../types/employerMap';

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return '\u2014';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const formatCurrency = (value) => {
  if (!Number.isFinite(value)) return '\u2014';
  return `$${value.toFixed(2)}`;
};

const stabilityLevel = (value, thresholds) => {
  const [t1, t2] = thresholds || [0, 0];
  if (!Number.isFinite(value) || value <= t1) return 'stable';
  if (value <= t2) return 'moderate';
  return 'unstable';
};

function EducationBarChart({ jobs }) {
  const ref = useRef(null);

  const counts = useMemo(() => {
    const map = {};
    for (const job of jobs) {
      const edu = job.educationRequirement || 'Unknown';
      map[edu] = (map[edu] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  useEffect(() => {
    if (!ref.current || counts.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const width = ref.current.clientWidth || 240;
    const height = counts.length * 22 + 8;
    const barHeight = 16;
    const maxCount = Math.max(...counts.map(([, c]) => c), 1);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    counts.forEach(([edu, count], i) => {
      const y = i * 22;
      const barW = (count / maxCount) * (width - 80);

      svg.append('text')
        .attr('x', 0)
        .attr('y', y + barHeight / 2 + 1)
        .attr('font-size', '10')
        .attr('fill', 'var(--muted-foreground)')
        .text(EMPLOYER_EDU_LABELS[edu] || edu);

      svg.append('rect')
        .attr('x', 80)
        .attr('y', y)
        .attr('width', 0)
        .attr('height', barHeight)
        .attr('rx', 3)
        .attr('fill', EMPLOYER_EDU_COLORS[edu] || '#9ca3af')
        .transition()
        .duration(400)
        .attr('width', Math.max(barW, 4));

      svg.append('text')
        .attr('x', 80 + Math.max(barW, 4) + 4)
        .attr('y', y + barHeight / 2 + 1)
        .attr('font-size', '10')
        .attr('fill', 'var(--foreground)')
        .text(count);
    });
  }, [counts]);

  if (counts.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No education data.</p>;
  }

  return (
    <svg
      ref={ref}
      className="w-full"
      style={{ height: counts.length * 22 + 8 }}
    />
  );
}

function StatRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

export default function EmployerDetailPanel({ detail, loading, employerId, onClose }) {
  const { jobs = [], cityAvgWage = 0, participantCount = 0 } = detail || {};

  const employerAvg = useMemo(() => {
    if (jobs.length === 0) return 0;
    const sum = jobs.reduce((acc, j) => acc + (j.hourlyRate || 0), 0);
    return sum / jobs.length;
  }, [jobs]);

  const wageVariance = useMemo(() => {
    if (jobs.length < 2) return 0;
    const mean = employerAvg;
    const sqDiffs = jobs.reduce((acc, j) => acc + ((j.hourlyRate || 0) - mean) ** 2, 0);
    return Math.sqrt(sqDiffs / (jobs.length - 1));
  }, [jobs, employerAvg]);

  const stability = useMemo(() => {
    return stabilityLevel(wageVariance, []);
  }, [wageVariance]);

  const avgShiftHours = useMemo(() => {
    if (jobs.length === 0) return 0;
    const sum = jobs.reduce((acc, j) => acc + (j.shiftHours || 0), 0);
    return sum / jobs.length;
  }, [jobs]);

  const stabilityColor = EMPLOYER_STABILITY_COLORS[stability] || '#9ca3af';

  if (!detail && loading) {
    return (
      <aside className="w-full rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground">
        <h3 className="text-base font-semibold text-foreground">Employer Details</h3>
        <p className="mt-2 text-xs">Loading...</p>
      </aside>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <aside className="w-full rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Employer #{employerId}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        <div className="rounded-lg bg-card/80 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Wage Stats
          </p>
          <div className="mt-1.5 space-y-1">
            <StatRow label="Avg hourly" value={formatCurrency(employerAvg)} />
            <StatRow label="City avg" value={formatCurrency(cityAvgWage)} />
            <StatRow label="Variance (\u03c3)" value={`$${wageVariance.toFixed(2)}`} />
          </div>
        </div>

        <div className="rounded-lg bg-card/80 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Stability
          </p>
          <div className="mt-1.5">
            <StatRow
              label="Wage stability"
              value={EMPLOYER_STABILITY_LABELS[stability] || 'Unknown'}
              color={stabilityColor}
            />
          </div>
        </div>

        <div className="rounded-lg bg-card/80 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Workforce
          </p>
          <div className="mt-1.5 space-y-1">
            <StatRow label="Jobs posted" value={formatNumber(jobs.length)} />
            <StatRow label="Participants" value={formatNumber(participantCount)} />
            <StatRow label="Avg shift" value={`${avgShiftHours.toFixed(1)}h`} />
          </div>
        </div>

        <div className="rounded-lg bg-card/80 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Education Mix
          </p>
          <div className="mt-1.5">
            <EducationBarChart jobs={jobs} />
          </div>
        </div>
      </div>
    </aside>
  );
}
