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

const stdDev = (values, mean) => {
  if (values.length < 2) return 0;
  const sqDiffs = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.sqrt(sqDiffs / (values.length - 1));
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

export default function EmployerDetailPanel({ detail, loading, employerId, onClose, stats }) {
  const { jobs = [], cityAvgWage = 0, participantCount = 0 } = detail || {};

  const employerAvg = useMemo(() => {
    if (jobs.length === 0) return 0;
    const sum = jobs.reduce((acc, j) => acc + (j.hourlyRate || 0), 0);
    return sum / jobs.length;
  }, [jobs]);

  const wageStdDev = useMemo(() => {
    const rates = jobs.map(j => j.hourlyRate).filter(r => r != null);
    return rates.length < 2 ? 0 : stdDev(rates, employerAvg);
  }, [jobs, employerAvg]);

  const avgShiftHours = useMemo(() => {
    if (jobs.length === 0) return 0;
    const sum = jobs.reduce((acc, j) => acc + (j.shiftHours || 0), 0);
    return sum / jobs.length;
  }, [jobs]);

  const shiftStdDev = useMemo(() => {
    const hours = jobs.map(j => j.shiftHours).filter(h => h != null && h > 0);
    if (hours.length < 2) return 0;
    const mean = hours.reduce((s, h) => s + h, 0) / hours.length;
    return stdDev(hours, mean);
  }, [jobs]);

  const eduCount = useMemo(() => {
    const levels = new Set(jobs.map(j => j.educationRequirement).filter(Boolean));
    return levels.size;
  }, [jobs]);

  const instabilityScore = useMemo(() => {
    const wageCV = employerAvg > 0 ? wageStdDev / Math.max(employerAvg, 1) : 0;
    const shiftCV = avgShiftHours > 0 ? shiftStdDev / Math.max(avgShiftHours, 1) : 0;
    const eduDiscount = 1 / (1 + eduCount * 0.25);
    return (wageCV * 0.6 + shiftCV * 0.4) * eduDiscount;
  }, [wageStdDev, employerAvg, shiftStdDev, avgShiftHours, eduCount]);

  const thresholds = useMemo(() => (stats && stats.varianceThresholds) || [0, 0], [stats]);
  const stability = useMemo(() => {
    return stabilityLevel(instabilityScore, thresholds);
  }, [instabilityScore, thresholds]);

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
            <StatRow label="Wage \u03c3" value={`$${wageStdDev.toFixed(2)}`} />
          </div>
        </div>

        <div className="rounded-lg bg-card/80 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Stability
          </p>
          <div className="mt-1.5">
            <StatRow
              label="Stability"
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
