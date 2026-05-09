import { useMemo } from 'react';
import {
  EMPLOYER_STABILITY_COLORS,
  EMPLOYER_STABILITY_LABELS,
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

      </div>
    </aside>
  );
}
