import { useEffect, useMemo, useState } from 'react';
import AnalysisHeader from './components/AnalysisHeader';
import { customfetch } from './utils/api';

const AGGREGATE_ENDPOINT = '/api/financials/resident-health-summary';
const ALL_RESIDENTS = 'All residents';
const AVERAGE_SELECTION = 'average';
const BALANCE_DOMAIN = [-1000, 60000];

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const compactCurrencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 1,
});

const previewRows = [
  ['2022-03', 9400, 3240, 2160, 520, 260, 0.099, 0.18, 1011],
  ['2022-04', 9100, 3255, 2180, 525, 266, 0.088, 0.19, 1011],
  ['2022-05', 8780, 3260, 2195, 532, 270, 0.081, 0.2, 1011],
  ['2022-06', 8520, 3250, 2210, 538, 278, 0.069, 0.22, 1011],
  ['2022-07', 8280, 3250, 2225, 548, 286, 0.059, 0.24, 1011],
  ['2022-08', 8060, 3265, 2240, 555, 290, 0.054, 0.25, 1011],
  ['2022-09', 7820, 3270, 2250, 562, 296, 0.049, 0.27, 1011],
  ['2022-10', 7580, 3275, 2265, 570, 304, 0.043, 0.29, 1011],
  ['2022-11', 7310, 3290, 2285, 578, 312, 0.035, 0.31, 1011],
  ['2022-12', 7040, 3300, 2310, 590, 324, 0.023, 0.33, 1011],
  ['2023-01', 6820, 3315, 2320, 600, 330, 0.02, 0.35, 1011],
  ['2023-02', 6660, 3325, 2335, 606, 336, 0.015, 0.36, 1011],
  ['2023-03', 6480, 3340, 2355, 615, 342, 0.009, 0.38, 1011],
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const firstValue = (row, keys, fallback = 0) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) {
      return row[key];
    }
  }
  return fallback;
};

const normalizeRatio = (value, fallback = 0) => {
  const numeric = toNumber(value, fallback);
  if (Math.abs(numeric) > 1 && Math.abs(numeric) <= 100) return numeric / 100;
  return numeric;
};

const formatMoney = (value) => currencyFormatter.format(toNumber(value));
const formatCompactMoney = (value) => compactCurrencyFormatter.format(toNumber(value));
const formatNumber = (value) => numberFormatter.format(toNumber(value));
const formatPercent = (value) => percentFormatter.format(normalizeRatio(value));

const formatMonth = (month) => {
  if (month === AVERAGE_SELECTION) return 'Average across months';
  if (!month) return 'Unknown month';
  const date = new Date(`${String(month).slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

const COHORT_METRICS = [
  {
    id: 'medianBalance',
    label: 'Median balance',
    axisLabel: 'Median ending balance',
    helper: 'Compares the typical month-end financial cushion by group.',
  },
  {
    id: 'stressShare',
    label: 'Stress share',
    axisLabel: 'Residents crossing stress threshold',
    helper: 'Shows the share of each cohort whose expenses exceed wages or balance is below zero.',
  },
  {
    id: 'savingsRate',
    label: 'Savings rate',
    axisLabel: 'Income left after measured expenses',
    helper: 'Shows the wage margin left after measured living expenses.',
  },
];

const COHORT_METRIC_LOOKUP = Object.fromEntries(COHORT_METRICS.map((metric) => [metric.id, metric]));

const COHORT_COLORS = {
  Graduate: '#06b6d4',
  Bachelors: '#39ff14',
  'High school or college': '#fde047',
  'Low education': '#ff4fd8',
  'Higher wage': '#7c3aed',
  'Middle wage': '#2563eb',
  'Lower wage': '#f97316',
};

const COHORT_PALETTE = ['#7c3aed', '#2563eb', '#f97316', '#16a34a', '#dc2626', '#0891b2'];

const COHORT_ORDER = [
  'Low education',
  'High school or college',
  'Bachelors',
  'Graduate',
  'Lower wage',
  'Middle wage',
  'Higher wage',
];

const COHORT_ORDER_LOOKUP = Object.fromEntries(COHORT_ORDER.map((cohort, index) => [cohort, index]));

const createPreviewData = () => ({
  source: 'fixture',
  warning: 'Development fixture only. Do not use these values for final VAST findings.',
  months: previewRows.map(([
    month,
    medianBalance,
    medianIncome,
    housingCost,
    foodCost,
    recreationCost,
    savingsRate,
    stressShare,
    participantCount,
  ]) => {
    const totalExpenses = housingCost + foodCost + recreationCost + 240;
    return {
      month,
      participantCount,
      medianBalance,
      medianIncome,
      housingCost,
      foodCost,
      recreationCost,
      totalExpenses,
      savingsRate,
      stressShare,
      cohorts: [
        {
          cohort: 'Lower wage',
          participantCount: 338,
          medianBalance: Math.round(medianBalance * 0.42),
          medianIncome: Math.round(medianIncome * 0.72),
          totalExpenses: Math.round(totalExpenses * 0.92),
          savingsRate: clamp(savingsRate - 0.105, -0.18, 0.16),
          stressShare: clamp(stressShare + 0.18, 0, 0.72),
        },
        {
          cohort: 'Middle wage',
          participantCount: 421,
          medianBalance: Math.round(medianBalance * 0.92),
          medianIncome: Math.round(medianIncome * 0.98),
          totalExpenses: Math.round(totalExpenses),
          savingsRate: clamp(savingsRate - 0.015, -0.12, 0.18),
          stressShare: clamp(stressShare + 0.02, 0, 0.62),
        },
        {
          cohort: 'Higher wage',
          participantCount: 252,
          medianBalance: Math.round(medianBalance * 1.8),
          medianIncome: Math.round(medianIncome * 1.35),
          totalExpenses: Math.round(totalExpenses * 1.13),
          savingsRate: clamp(savingsRate + 0.105, -0.05, 0.32),
          stressShare: clamp(stressShare - 0.12, 0.02, 0.42),
        },
      ],
    };
  }),
});

const normalizeCohort = (row) => {
  const cohort = firstValue(row, ['cohort', 'group', 'label', 'name'], null);
  if (!cohort) return null;
  const medianIncome = toNumber(firstValue(row, ['medianIncome', 'median_income', 'income', 'wageIncome'], 0));
  const totalExpenses = toNumber(firstValue(row, ['totalExpenses', 'total_expenses', 'expenses'], 0));
  return {
    cohort: String(cohort),
    participantCount: toNumber(firstValue(row, ['participantCount', 'participant_count', 'residents'], 0)),
    medianBalance: toNumber(firstValue(row, ['medianBalance', 'median_balance', 'balance'], 0)),
    medianIncome,
    housingCost: toNumber(firstValue(row, ['housingCost', 'housing_cost', 'medianHousing', 'shelter'], 0)),
    foodCost: toNumber(firstValue(row, ['foodCost', 'food_cost', 'medianFood', 'food'], 0)),
    recreationCost: toNumber(firstValue(row, ['recreationCost', 'recreation_cost', 'medianRecreation', 'recreation'], 0)),
    totalExpenses,
    savingsRate: normalizeRatio(
      firstValue(row, ['savingsRate', 'savings_rate', 'netSavingsRate'], medianIncome ? (medianIncome - totalExpenses) / medianIncome : 0)
    ),
    stressShare: normalizeRatio(firstValue(row, ['stressShare', 'stress_share', 'financialStressShare'], 0)),
  };
};

const normalizeMonth = (row) => {
  const month = firstValue(row, ['month', 'period', 'date', 'timestamp'], null);
  if (!month) return null;

  const housingCost = toNumber(firstValue(row, ['housingCost', 'housing_cost', 'medianHousing', 'shelter'], 0));
  const foodCost = toNumber(firstValue(row, ['foodCost', 'food_cost', 'medianFood', 'food'], 0));
  const recreationCost = toNumber(firstValue(row, ['recreationCost', 'recreation_cost', 'medianRecreation', 'recreation'], 0));
  const totalExpenses = toNumber(
    firstValue(row, ['totalExpenses', 'total_expenses', 'expenses'], housingCost + foodCost + recreationCost)
  );
  const medianIncome = toNumber(firstValue(row, ['medianIncome', 'median_income', 'medianWages', 'wageIncome'], 0));
  const cohorts = (firstValue(row, ['cohorts', 'cohortBreakdown', 'groups'], []) || [])
    .map(normalizeCohort)
    .filter(Boolean);

  return {
    month: String(month).slice(0, 7),
    participantCount: toNumber(firstValue(row, ['participantCount', 'participant_count', 'residents'], 0)),
    medianBalance: toNumber(firstValue(row, ['medianBalance', 'median_balance', 'balance'], 0)),
    medianIncome,
    housingCost,
    foodCost,
    recreationCost,
    totalExpenses,
    savingsRate: normalizeRatio(
      firstValue(row, ['savingsRate', 'savings_rate', 'netSavingsRate'], medianIncome ? (medianIncome - totalExpenses) / medianIncome : 0)
    ),
    stressShare: normalizeRatio(firstValue(row, ['stressShare', 'stress_share', 'financialStressShare'], 0)),
    cohorts,
  };
};

const unwrapApiData = (response) => response?.data?.data || response?.data || response;

const normalizeDataset = (payload) => {
  const unwrapped = unwrapApiData(payload);
  const rawMonths = Array.isArray(unwrapped)
    ? unwrapped
    : unwrapped?.months || unwrapped?.monthly || unwrapped?.data || [];
  const months = rawMonths
    .map(normalizeMonth)
    .filter(Boolean)
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    source: unwrapped?.source || 'aggregate',
    warning: unwrapped?.warning || null,
    months,
  };
};

const averageRows = (rows) => {
  if (!rows.length) return null;
  const average = (key) => rows.reduce((sum, row) => sum + toNumber(row?.[key], 0), 0) / rows.length;

  return {
    month: AVERAGE_SELECTION,
    participantCount: average('participantCount'),
    medianBalance: average('medianBalance'),
    medianIncome: average('medianIncome'),
    housingCost: average('housingCost'),
    foodCost: average('foodCost'),
    recreationCost: average('recreationCost'),
    totalExpenses: average('totalExpenses'),
    savingsRate: average('savingsRate'),
    stressShare: average('stressShare'),
  };
};

const getComparisonColor = (value, baseline, direction = 'higher') => {
  const numericValue = toNumber(value, 0);
  const numericBaseline = toNumber(baseline, 0);
  const denominator = Math.max(Math.abs(numericBaseline), 0.01);
  const rawDifference = (numericValue - numericBaseline) / denominator;
  const adjustedDifference = direction === 'lower' ? -rawDifference : rawDifference;

  if (adjustedDifference >= 0.15) return '#16a34a';
  if (adjustedDifference <= -0.15) return '#dc2626';
  return '#ca8a04';
};

const buildLinePath = (data, getX, getY) => data
  .map((item, index) => `${index === 0 ? 'M' : 'L'} ${getX(item, index).toFixed(1)} ${getY(item).toFixed(1)}`)
  .join(' ');

const KpiCard = ({ label, value, helper, tone = 'neutral' }) => {
  const toneClass = tone === 'bad'
    ? 'text-red-500'
    : tone === 'good'
      ? 'text-emerald-600'
      : 'text-foreground';

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
};

const ComparedValue = ({ value, baseline, direction = 'higher', formatter = formatMoney }) => (
  <p
    className="font-semibold"
    style={{ color: getComparisonColor(value, baseline, direction) }}
    title={`All-residents average across months baseline: ${formatter(baseline)}`}
  >
    {formatter(value)}
  </p>
);

const StateCard = ({ title, message, action }) => (
  <div className="mt-5 rounded-lg border border-border/60 bg-card p-8 text-center">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{message}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

const WarningBanner = ({ children }) => (
  <div className="mt-5 rounded-lg border border-amber-400/50 bg-amber-100/70 px-4 py-3 text-sm text-amber-900">
    {children}
  </div>
);

const PopulationSelector = ({ cohorts, selectedCohort, onSelect, residentCount, className = '' }) => (
  <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
    <div className="flex flex-wrap gap-2">
      {[ALL_RESIDENTS, ...cohorts].map((cohort) => (
        <button
          key={cohort}
          type="button"
          className={`rounded-md border px-3 py-2 text-sm transition ${
            selectedCohort === cohort
              ? 'border-transparent bg-accent text-white'
              : 'border-border/60 bg-card text-foreground'
          }`}
          onClick={() => onSelect(cohort)}
        >
          {cohort}
        </button>
      ))}
    </div>
    <p className="text-sm text-muted-foreground">
      {formatNumber(residentCount || 0)} residents in latest month
    </p>
  </div>
);

const PeriodSelector = ({ months, selectedMonth, onSelect, className = '' }) => (
  <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-4 ${className}`}>
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Selected comparison value</p>
      <p className="mt-1 text-sm text-foreground">{formatMonth(selectedMonth)}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`rounded-md border px-3 py-2 text-sm transition ${
          selectedMonth === AVERAGE_SELECTION
            ? 'border-transparent bg-accent text-white'
            : 'border-border/60 bg-background text-foreground'
        }`}
        onClick={() => onSelect(AVERAGE_SELECTION)}
      >
        Average across months
      </button>
      <select
        value={selectedMonth === AVERAGE_SELECTION ? '' : selectedMonth || ''}
        onChange={(event) => onSelect(event.target.value || AVERAGE_SELECTION)}
        className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground"
        aria-label="Select specific month"
      >
        <option value="">Specific month</option>
        {months.map((month) => (
          <option key={month.month} value={month.month}>{formatMonth(month.month)}</option>
        ))}
      </select>
    </div>
  </div>
);

const BalanceTrendChart = ({ data, selectedMonth, onSelectMonth }) => {
  if (data.length < 2) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-border/60 bg-background text-sm text-muted-foreground">
        No monthly balance trend available
      </div>
    );
  }

  const width = 760;
  const height = 330;
  const margin = { top: 28, right: 32, bottom: 52, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const [minBalance, maxBalance] = BALANCE_DOMAIN;
  const balanceRange = maxBalance - minBalance || 1;
  const maxStress = Math.max(...data.map((item) => item.stressShare), 0.01);
  const getX = (_item, index) => margin.left + (index / Math.max(data.length - 1, 1)) * plotWidth;
  const getY = (item) => margin.top + ((maxBalance - item.medianBalance) / balanceRange) * plotHeight;
  const path = buildLinePath(data, getX, getY);
  const yTicks = [-1000, 0, 15000, 30000, 45000, 60000];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[23rem] w-full cursor-pointer rounded-lg border border-border/60 bg-background"
      onClick={() => onSelectMonth(AVERAGE_SELECTION)}
    >
      <rect x="16" y="16" width={width - 32} height={height - 32} rx="10" fill="var(--card)" />
      {yTicks.map((tick) => {
        const y = margin.top + ((maxBalance - tick) / balanceRange) * plotHeight;
        return (
          <g key={tick}>
            <line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke="var(--border)" strokeOpacity="0.48" />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
              {formatMoney(tick)}
            </text>
          </g>
        );
      })}
      {data.map((item, index) => {
        const x = getX(item, index);
        const barHeight = Math.max(4, (item.stressShare / maxStress) * 72);
        return (
          <rect
            key={`stress-${item.month}`}
            x={x - 11}
            y={margin.top + plotHeight - barHeight}
            width="22"
            height={barHeight}
            rx="5"
            fill="#d55e00"
            opacity="0.22"
          />
        );
      })}
      <line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" />
      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((item, index) => {
        const selected = item.month === selectedMonth;
        const x = getX(item, index);
        const y = getY(item);
        return (
          <g key={item.month}>
            <circle
              cx={x}
              cy={y}
              r={selected ? 7 : 5}
              fill={selected ? 'var(--accent)' : 'var(--card)'}
              stroke="var(--accent)"
              strokeWidth="3"
              className="cursor-pointer"
              tabIndex="0"
              role="button"
              aria-label={`Select ${formatMonth(item.month)}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectMonth(item.month);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelectMonth(item.month);
              }}
            >
              <title>{`${formatMonth(item.month)}: ${formatMoney(item.medianBalance)} median balance`}</title>
            </circle>
            {(index === 0 || index === data.length - 1 || index % 3 === 0) && (
              <text x={x} y={height - 24} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                {formatMonth(item.month)}
              </text>
            )}
          </g>
        );
      })}
      <text x={margin.left + plotWidth / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
        Month
      </text>
      <text x="22" y={margin.top + plotHeight / 2} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)" transform={`rotate(-90 22 ${margin.top + plotHeight / 2})`}>
        Median ending balance
      </text>
      <text x={margin.left + 8} y={margin.top + 16} fontSize="11" fill="var(--muted-foreground)">
        Purple line = balance; orange bars = financial stress share
      </text>
    </svg>
  );
};

const IncomeExpenseLegend = ({ month }) => {
  if (!month) return null;
  const netCashflow = month.medianIncome - month.totalExpenses;

  return (
    <div className="mb-3 flex flex-wrap gap-3 rounded-lg border border-border/60 bg-background p-3 text-xs">
      <span className="w-full text-muted-foreground">
        Values for selected comparison value: <span className="font-semibold text-foreground">{formatMonth(month.month)}</span>
      </span>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#0072b2]" aria-hidden="true" />
        <span className="font-semibold text-foreground">Median income</span>
        <span className="text-muted-foreground">{formatMoney(month.medianIncome)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#d55e00]" aria-hidden="true" />
        <span className="font-semibold text-foreground">Total expenses</span>
        <span className="text-muted-foreground">{formatMoney(month.totalExpenses)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
        <span className="font-semibold text-foreground">Net cashflow</span>
        <span className={netCashflow >= 0 ? 'text-emerald-600' : 'text-red-500'}>{formatMoney(netCashflow)}</span>
      </div>
    </div>
  );
};

const IncomeExpenseChart = ({ data, selectedMonth, onSelectMonth }) => {
  if (data.length < 2) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-border/60 bg-background text-sm text-muted-foreground">
        No wage and expense trend available
      </div>
    );
  }

  const width = 760;
  const height = 280;
  const margin = { top: 30, right: 34, bottom: 46, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...data.flatMap((item) => [item.medianIncome, item.totalExpenses]), 1) * 1.12;
  const getX = (_item, index) => margin.left + (index / Math.max(data.length - 1, 1)) * plotWidth;
  const getIncomeY = (item) => margin.top + ((maxValue - item.medianIncome) / maxValue) * plotHeight;
  const getExpenseY = (item) => margin.top + ((maxValue - item.totalExpenses) / maxValue) * plotHeight;
  const incomePath = buildLinePath(data, getX, getIncomeY);
  const expensePath = buildLinePath(data, getX, getExpenseY);
  const selectedIndex = data.findIndex((item) => item.month === selectedMonth);
  const selectedX = selectedIndex >= 0 ? getX(data[selectedIndex], selectedIndex) : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-80 w-full cursor-pointer rounded-lg border border-border/60 bg-background"
      onClick={() => onSelectMonth(AVERAGE_SELECTION)}
    >
      <rect x="16" y="16" width={width - 32} height={height - 32} rx="10" fill="var(--card)" />
      {data.map((item, index) => {
        const previousX = index === 0
          ? margin.left
          : margin.left + ((index - 0.5) / Math.max(data.length - 1, 1)) * plotWidth;
        const nextX = index === data.length - 1
          ? margin.left + plotWidth
          : margin.left + ((index + 0.5) / Math.max(data.length - 1, 1)) * plotWidth;
        return (
          <rect
            key={`income-selector-${item.month}`}
            x={previousX}
            y={margin.top}
            width={Math.max(8, nextX - previousX)}
            height={plotHeight}
            fill="transparent"
            className="cursor-pointer"
            onClick={() => onSelectMonth(AVERAGE_SELECTION)}
          >
            <title>Select average across months</title>
          </rect>
        );
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = margin.top + (1 - ratio) * plotHeight;
        const value = maxValue * ratio;
        return (
          <g key={ratio}>
            <line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke="var(--border)" strokeOpacity="0.45" />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
              {formatMoney(value)}
            </text>
          </g>
        );
      })}
      <line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" />
      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" />
      {selectedX !== null && (
        <g>
          <rect x={selectedX - 7} y={margin.top} width="14" height={plotHeight} fill="var(--accent)" opacity="0.08" />
          <line x1={selectedX} y1={margin.top} x2={selectedX} y2={margin.top + plotHeight} stroke="var(--accent)" strokeDasharray="5 5" strokeOpacity="0.75" />
        </g>
      )}
      <path d={incomePath} fill="none" stroke="#0072b2" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={expensePath} fill="none" stroke="#d55e00" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((item, index) => {
        const x = getX(item, index);
        const selected = item.month === selectedMonth;
        return (
          <g key={item.month}>
            <circle
              cx={x}
              cy={getIncomeY(item)}
              r={selected ? 6 : 4}
              fill="#0072b2"
              stroke={selected ? 'var(--card)' : '#0072b2'}
              strokeWidth={selected ? 2 : 0}
              className="cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onSelectMonth(item.month);
              }}
            >
              <title>{`${formatMonth(item.month)} income: ${formatMoney(item.medianIncome)}`}</title>
            </circle>
            <circle
              cx={x}
              cy={getExpenseY(item)}
              r={selected ? 6 : 4}
              fill="#d55e00"
              stroke={selected ? 'var(--card)' : '#d55e00'}
              strokeWidth={selected ? 2 : 0}
              className="cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onSelectMonth(item.month);
              }}
            >
              <title>{`${formatMonth(item.month)} expenses: ${formatMoney(item.totalExpenses)}`}</title>
            </circle>
          </g>
        );
      })}
      <g transform={`translate(${margin.left + 8} ${margin.top})`}>
        <circle cx="0" cy="0" r="5" fill="#0072b2" />
        <text x="10" y="4" fontSize="11" fill="var(--muted-foreground)">Median income</text>
        <circle cx="112" cy="0" r="5" fill="#d55e00" />
        <text x="122" y="4" fontSize="11" fill="var(--muted-foreground)">Total expenses</text>
      </g>
    </svg>
  );
};

const ExpenseComposition = ({ month }) => {
  if (!month) return null;
  const entries = [
    ['Housing', month.housingCost, '#0072b2'],
    ['Food', month.foodCost, '#009e73'],
    ['Recreation', month.recreationCost, '#cc79a7'],
    ['Other', Math.max(0, month.totalExpenses - month.housingCost - month.foodCost - month.recreationCost), '#999999'],
  ];
  const total = Math.max(month.totalExpenses, entries.reduce((sum, [, value]) => sum + value, 0), 1);

  return (
    <div className="space-y-3">
      {entries.map(([label, value, color]) => (
        <div key={label}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground">{label}</span>
            <span className="text-muted-foreground">{formatMoney(value)} - {formatPercent(value / total)}</span>
          </div>
          <div className="mt-1 h-3 rounded-full bg-background">
            <div
              className="h-3 rounded-full"
              style={{ width: `${Math.max(3, (value / total) * 100)}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const getCohortColor = (cohort, index) => COHORT_COLORS[cohort] || COHORT_PALETTE[index % COHORT_PALETTE.length];

const sortCohortNames = (cohorts) => [...cohorts].sort((a, b) => {
  const rankA = COHORT_ORDER_LOOKUP[a] ?? Number.MAX_SAFE_INTEGER;
  const rankB = COHORT_ORDER_LOOKUP[b] ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;
  return a.localeCompare(b);
});

const getCohortMetricValue = (cohort, metricId) => toNumber(cohort?.[metricId], 0);

const formatCohortMetricValue = (metricId, value) => (
  metricId === 'medianBalance' ? formatMoney(value) : formatPercent(value)
);

const formatAxisMetricValue = (metricId, value) => (
  metricId === 'medianBalance' ? formatCompactMoney(value) : formatPercent(value)
);

const getLatestCohort = (data, cohortName) => {
  for (let index = data.length - 1; index >= 0; index -= 1) {
    const cohort = data[index]?.cohorts.find((item) => item.cohort === cohortName);
    if (cohort) return cohort;
  }
  return null;
};

const getCohortForMonth = (data, cohortName, month) => {
  const monthRow = data.find((item) => item.month === month);
  return monthRow?.cohorts.find((cohort) => cohort.cohort === cohortName) || null;
};

const getAverageCohort = (data, cohortName) => {
  const rows = data
    .map((month) => month.cohorts.find((cohort) => cohort.cohort === cohortName))
    .filter(Boolean);
  if (!rows.length) return null;

  return {
    cohort: cohortName,
    ...averageRows(rows),
  };
};

const getCohortForSelection = (data, cohortName, selection) => (
  selection === AVERAGE_SELECTION
    ? getAverageCohort(data, cohortName)
    : getCohortForMonth(data, cohortName, selection)
);

const getMetricDomain = (values, metricId) => {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return metricId === 'medianBalance' ? [0, 1] : [0, 0.02];

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);

  if (metricId === 'medianBalance') {
    return BALANCE_DOMAIN;
  }

  if (metricId === 'stressShare') {
    return [-0.03, 0.12];
  }

  if (metricId === 'savingsRate') {
    return [0, 1];
  }

  const padding = Math.max((max - min) * 0.14, 0.02);
  return [Math.min(0, min - padding), Math.max(0, max + padding)];
};

const CohortMetricChart = ({ data, cohorts, metricId, selectedMonth, onMonthSelect }) => {
  if (!cohorts.length) {
    return (
      <div className="rounded-lg border border-border/60 bg-background p-5 text-sm text-muted-foreground">
        Cohort breakdown is not available in the aggregate response.
      </div>
    );
  }

  const metric = COHORT_METRIC_LOOKUP[metricId] || COHORT_METRIC_LOOKUP.medianBalance;
  const width = 1040;
  const height = 390;
  const margin = { top: 32, right: 178, bottom: 58, left: 86 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const orderedCohorts = cohorts;
  const series = orderedCohorts.map((cohort, cohortIndex) => ({
    cohort,
    color: getCohortColor(cohort, cohortIndex),
    points: data
      .map((month, monthIndex) => {
        const cohortRow = month.cohorts.find((item) => item.cohort === cohort);
        if (!cohortRow) return null;
        return {
          month: month.month,
          monthIndex,
          value: getCohortMetricValue(cohortRow, metric.id),
        };
      })
      .filter(Boolean),
  }));
  const allValues = series.flatMap((item) => item.points.map((point) => point.value));
  const [minValue, maxValue] = getMetricDomain(allValues, metric.id);
  const valueRange = maxValue - minValue || 1;
  const getX = (point) => margin.left + (point.monthIndex / Math.max(data.length - 1, 1)) * plotWidth;
  const getY = (value) => margin.top + ((maxValue - value) / valueRange) * plotHeight;
  const yTicks = Array.from({ length: 6 }, (_, index) => minValue + ((maxValue - minValue) * index) / 5);
  const xTickStep = Math.max(1, Math.ceil(data.length / 7));
  const selectedIndex = data.findIndex((month) => month.month === selectedMonth);
  const selectedX = selectedIndex >= 0
    ? margin.left + (selectedIndex / Math.max(data.length - 1, 1)) * plotWidth
    : null;
  const labelSlots = orderedCohorts.map((cohort, index) => ({
    cohort,
    y: margin.top + ((index + 0.5) / Math.max(orderedCohorts.length, 1)) * plotHeight,
  }));
  const getLabelY = (cohort) => labelSlots.find((slot) => slot.cohort === cohort)?.y ?? margin.top + plotHeight / 2;

  if (!series.some((item) => item.points.length >= 2)) {
    return (
      <div className="rounded-lg border border-border/60 bg-background p-5 text-sm text-muted-foreground">
        Not enough cohort data is available to draw a shared trend chart.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[28rem] w-full cursor-pointer rounded-lg border border-border/60 bg-background"
      onClick={() => onMonthSelect(AVERAGE_SELECTION)}
    >
      <rect x="16" y="16" width={width - 32} height={height - 32} rx="10" fill="var(--card)" />
      {data.map((month, index) => {
        const previousX = index === 0
          ? margin.left
          : margin.left + ((index - 0.5) / Math.max(data.length - 1, 1)) * plotWidth;
        const nextX = index === data.length - 1
          ? margin.left + plotWidth
          : margin.left + ((index + 0.5) / Math.max(data.length - 1, 1)) * plotWidth;
        return (
          <rect
            key={`selector-${month.month}`}
            x={previousX}
            y={margin.top}
            width={Math.max(8, nextX - previousX)}
            height={plotHeight}
            fill="transparent"
            className="cursor-pointer"
            onClick={() => onMonthSelect(AVERAGE_SELECTION)}
          >
            <title>Select average across months</title>
          </rect>
        );
      })}
      {yTicks.map((tick) => {
        const y = getY(tick);
        return (
          <g key={`y-${tick}`}>
            <line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke="var(--border)" strokeOpacity="0.5" />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {formatAxisMetricValue(metric.id, tick)}
            </text>
          </g>
        );
      })}
      {data.map((month, index) => {
        const shouldShow = index === 0 || index === data.length - 1 || index % xTickStep === 0;
        if (!shouldShow) return null;
        const x = margin.left + (index / Math.max(data.length - 1, 1)) * plotWidth;
        return (
          <g key={`x-${month.month}`}>
            <line x1={x} y1={margin.top} x2={x} y2={margin.top + plotHeight} stroke="var(--border)" strokeOpacity="0.22" />
            <text x={x} y={height - 26} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
              {formatMonth(month.month)}
            </text>
          </g>
        );
      })}
      <line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" />
      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" />
      {selectedX !== null && (
        <g>
          <rect x={selectedX - 7} y={margin.top} width="14" height={plotHeight} fill="var(--accent)" opacity="0.08" />
          <line x1={selectedX} y1={margin.top} x2={selectedX} y2={margin.top + plotHeight} stroke="var(--accent)" strokeDasharray="5 5" strokeOpacity="0.75" />
        </g>
      )}
      {series.map((item) => {
        const path = buildLinePath(item.points, getX, (point) => getY(point.value));
        const latest = item.points.at(-1);
        const labelY = getLabelY(item.cohort);
        return (
          <g key={item.cohort}>
            <path d={path} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {item.points.map((point) => (
              <circle
                key={`${item.cohort}-${point.month}`}
                cx={getX(point)}
                cy={getY(point.value)}
                r={point.month === selectedMonth ? 5.5 : 3.5}
                fill={item.color}
                stroke={point.month === selectedMonth ? 'var(--card)' : item.color}
                strokeWidth={point.month === selectedMonth ? 2 : 0}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  onMonthSelect(point.month);
                }}
              >
                <title>{`${item.cohort}, ${formatMonth(point.month)}: ${formatCohortMetricValue(metric.id, point.value)}`}</title>
              </circle>
            ))}
            {latest && (
              <g>
                <text x={margin.left + plotWidth + 24} y={labelY + 4} fontSize="12" fontWeight="700" fill={item.color}>
                  {item.cohort}
                </text>
              </g>
            )}
          </g>
        );
      })}
      <text x={margin.left + plotWidth / 2} y={height - 8} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
        Month
      </text>
      <text x="24" y={margin.top + plotHeight / 2} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)" transform={`rotate(-90 24 ${margin.top + plotHeight / 2})`}>
        {metric.axisLabel}
      </text>
    </svg>
  );
};

const CohortComparisonPanel = ({ data, cohorts, metricId, onMetricChange, selectedMonth, onMonthSelect }) => {
  if (!cohorts.length) {
    return (
      <div className="rounded-lg border border-border/60 bg-background p-5 text-sm text-muted-foreground">
        Cohort breakdown is not available in the aggregate response.
      </div>
    );
  }

  const metric = COHORT_METRIC_LOOKUP[metricId] || COHORT_METRIC_LOOKUP.medianBalance;
  let activeMonth = data.at(-1)?.month;
  if (selectedMonth === AVERAGE_SELECTION || data.some((month) => month.month === selectedMonth)) {
    activeMonth = selectedMonth;
  }
  const orderedCohorts = sortCohortNames(cohorts).reverse();
  const latestRows = orderedCohorts.map((cohort, index) => ({
    cohort,
    color: getCohortColor(cohort, index),
    latest: getLatestCohort(data, cohort),
  })).filter((row) => row.latest);
  const selectedRows = latestRows.map((row) => ({
    ...row,
    selected: getCohortForSelection(data, row.cohort, activeMonth) || row.latest,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{metric.label} by education cohort</h3>
          <p className="text-xs text-muted-foreground">{metric.helper}</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Cohort comparison metric">
          {COHORT_METRICS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                metric.id === option.id
                  ? 'border-transparent bg-accent text-white'
                  : 'border-border/60 bg-background text-foreground'
              }`}
              onClick={() => onMetricChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-border/60 bg-background p-3 text-xs">
        <span className="w-full text-muted-foreground">
          Legend values for selected comparison value: <span className="font-semibold text-foreground">{formatMonth(activeMonth)}</span>
        </span>
        {selectedRows.map((row) => (
          <div key={row.cohort} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
            <span className="font-semibold text-foreground">{row.cohort}</span>
            <span className="text-muted-foreground">{formatCohortMetricValue(metric.id, getCohortMetricValue(row.selected, metric.id))}</span>
          </div>
        ))}
      </div>

      <CohortMetricChart
        data={data}
        cohorts={orderedCohorts}
        metricId={metric.id}
        selectedMonth={activeMonth}
        onMonthSelect={onMonthSelect}
      />

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
        <table className="w-full min-w-[660px] text-left text-sm">
          <thead className="border-b border-border/60 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Cohort</th>
              <th className="px-4 py-3 text-right font-semibold">Residents</th>
              <th className="px-4 py-3 text-right font-semibold">Latest balance</th>
              <th className="px-4 py-3 text-right font-semibold">Latest stress</th>
              <th className="px-4 py-3 text-right font-semibold">Savings rate</th>
            </tr>
          </thead>
          <tbody>
            {latestRows.map((row) => (
              <tr key={row.cohort} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 font-semibold text-foreground">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                  {row.cohort}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatNumber(row.latest.participantCount)}</td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">{formatMoney(row.latest.medianBalance)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatPercent(row.latest.stressShare)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatPercent(row.latest.savingsRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="rounded-lg border border-amber-400/40 bg-amber-100/60 px-4 py-3 text-xs text-amber-900">
        Stress threshold is global: a resident is counted as stressed when monthly measured expenses exceed wage income or month-end balance is below $0. The stress percentage is then recalculated within each cohort and month.
      </p>
    </div>
  );
};

const ResidentFinancialHealth = () => {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCohort, setSelectedCohort] = useState(ALL_RESIDENTS);
  const [selectedMonth, setSelectedMonth] = useState(AVERAGE_SELECTION);
  const [cohortMetric, setCohortMetric] = useState('medianBalance');

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await customfetch(AGGREGATE_ENDPOINT);
        const normalized = normalizeDataset(response);
        if (!isMounted) return;
        setDataset(normalized.months.length ? normalized : null);
        setSelectedMonth(AVERAGE_SELECTION);
        setError(normalized.months.length ? null : 'Aggregate endpoint returned no monthly financial data.');
      } catch (err) {
        if (!isMounted) return;
        setDataset(null);
        setError(err.message || 'Resident financial aggregate endpoint is not available.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const months = useMemo(() => dataset?.months || [], [dataset]);
  const usingFixture = dataset?.source === 'fixture';
  const cohortNames = useMemo(() => {
    return sortCohortNames([...new Set(months.flatMap((month) => month.cohorts.map((cohort) => cohort.cohort)))]);
  }, [months]);

  const allResidentsAverage = useMemo(() => averageRows(months), [months]);

  const selectedSeries = useMemo(() => {
    if (selectedCohort === ALL_RESIDENTS) return months;
    return months.map((month) => {
      const cohort = month.cohorts.find((item) => item.cohort === selectedCohort);
      if (!cohort) return month;
      const totalExpenses = toNumber(cohort.totalExpenses, 0);
      const hasCategoryBreakdown = ['housingCost', 'foodCost', 'recreationCost']
        .some((key) => toNumber(cohort[key], 0) > 0);
      const cityExpenseTotal = Math.max(toNumber(month.totalExpenses, 0), 1);
      const housingCost = hasCategoryBreakdown
        ? cohort.housingCost
        : totalExpenses * (toNumber(month.housingCost, 0) / cityExpenseTotal);
      const foodCost = hasCategoryBreakdown
        ? cohort.foodCost
        : totalExpenses * (toNumber(month.foodCost, 0) / cityExpenseTotal);
      const recreationCost = hasCategoryBreakdown
        ? cohort.recreationCost
        : totalExpenses * (toNumber(month.recreationCost, 0) / cityExpenseTotal);

      return {
        ...month,
        participantCount: cohort.participantCount,
        medianBalance: cohort.medianBalance,
        medianIncome: cohort.medianIncome,
        housingCost,
        foodCost,
        recreationCost,
        totalExpenses,
        savingsRate: cohort.savingsRate,
        stressShare: cohort.stressShare,
      };
    });
  }, [months, selectedCohort]);

  const summary = useMemo(() => {
    const first = selectedSeries[0];
    const latest = selectedSeries[selectedSeries.length - 1];
    const selected = selectedMonth === AVERAGE_SELECTION
      ? averageRows(selectedSeries)
      : selectedSeries.find((month) => month.month === selectedMonth) || latest;
    const worst = selectedSeries.reduce((currentWorst, month) => (
      month.stressShare > currentWorst.stressShare ? month : currentWorst
    ), selectedSeries[0] || { stressShare: 0 });

    return {
      first,
      latest,
      selected,
      worst,
      balanceDelta: latest && first ? latest.medianBalance - first.medianBalance : 0,
      savingsDelta: latest && first ? latest.savingsRate - first.savingsRate : 0,
      stressDelta: latest && first ? latest.stressShare - first.stressShare : 0,
    };
  }, [selectedMonth, selectedSeries]);

  const loadPreview = () => {
    const preview = normalizeDataset(createPreviewData());
    setDataset(preview);
    setSelectedMonth(AVERAGE_SELECTION);
    setSelectedCohort(ALL_RESIDENTS);
    setError(null);
    setLoading(false);
  };

  const dataBadge = dataset ? (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-right text-xs">
      <p className="text-muted-foreground">Data source</p>
      <p className="font-semibold text-foreground">{usingFixture ? 'Development preview' : 'Backend aggregate'}</p>
    </div>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-[90rem] px-6 py-6 text-left">
      <AnalysisHeader
        overline="Challenge 3 - Question 2"
        title="Resident Financial Health Over Time"
        subtitle="Track resident balances, wages, expenses, savings pressure, and cohort-level financial stress across the available months."
        right={dataBadge}
      />

      {loading && (
        <StateCard
          title="Loading resident financial aggregates"
          message="The dashboard is requesting the aggregate monthly financial-health endpoint."
        />
      )}

      {!loading && !dataset && (
        <StateCard
          title="Aggregate financial endpoint is not available"
          message={`The current backend exposes participant-level financial journal endpoints, but this visualization needs a monthly city/cohort aggregate at ${AGGREGATE_ENDPOINT}. ${error || ''}`}
          action={(
            <button
              type="button"
              className="rounded-md border border-transparent bg-accent px-4 py-2 text-sm font-semibold text-white"
              onClick={loadPreview}
            >
              Preview chart layout with fixture data
            </button>
          )}
        />
      )}

      {!loading && dataset && (
        <>
          {usingFixture && (
            <WarningBanner>
              {dataset.warning || 'Development fixture only. Do not use these values for final VAST findings.'}
            </WarningBanner>
          )}

          <PopulationSelector
            className="mt-5"
            cohorts={cohortNames}
            selectedCohort={selectedCohort}
            onSelect={setSelectedCohort}
            residentCount={summary.latest?.participantCount}
          />

          <PeriodSelector
            className="mt-4"
            months={selectedSeries}
            selectedMonth={selectedMonth}
            onSelect={setSelectedMonth}
          />

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Latest median balance"
              value={formatMoney(summary.latest?.medianBalance || 0)}
              helper={`${summary.balanceDelta >= 0 ? '+' : ''}${formatMoney(summary.balanceDelta)} since ${formatMonth(summary.first?.month)}`}
              tone={summary.balanceDelta >= 0 ? 'good' : 'bad'}
            />
            <KpiCard
              label="Latest savings rate"
              value={formatPercent(summary.latest?.savingsRate || 0)}
              helper={`${summary.savingsDelta >= 0 ? '+' : ''}${formatPercent(summary.savingsDelta)} from first month`}
              tone={summary.latest?.savingsRate >= 0 ? 'good' : 'bad'}
            />
            <KpiCard
              label="Financial stress share"
              value={formatPercent(summary.latest?.stressShare || 0)}
              helper={`${summary.stressDelta >= 0 ? '+' : ''}${formatPercent(summary.stressDelta)} from first month`}
              tone={summary.stressDelta > 0 ? 'bad' : 'good'}
            />
            <KpiCard
              label="Worst stress month"
              value={formatMonth(summary.worst?.month)}
               helper={`${formatPercent(summary.worst?.stressShare || 0)} of residents below the stress threshold`}
              tone="bad"
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-border/60 bg-card p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Balance and stress trend</h2>
                  <p className="text-xs text-muted-foreground">
                    Select a point to inspect monthly income, expenses, and stress indicators.
                  </p>
                </div>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-foreground">
                  {selectedCohort}
                </span>
              </div>
              <BalanceTrendChart
                data={selectedSeries}
                selectedMonth={summary.selected?.month}
                onSelectMonth={setSelectedMonth}
              />
            </section>

            <aside className="rounded-lg border border-border/60 bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">Selected comparison value</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatMonth(summary.selected?.month)} financial profile
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <ComparedValue
                    value={summary.selected?.medianBalance || 0}
                    baseline={allResidentsAverage?.medianBalance || 0}
                  />
                </div>
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs text-muted-foreground">Income</p>
                  <ComparedValue
                    value={summary.selected?.medianIncome || 0}
                    baseline={allResidentsAverage?.medianIncome || 0}
                  />
                </div>
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs text-muted-foreground">Expenses</p>
                  <ComparedValue
                    value={summary.selected?.totalExpenses || 0}
                    baseline={allResidentsAverage?.totalExpenses || 0}
                    direction="lower"
                  />
                </div>
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs text-muted-foreground">Stress</p>
                  <ComparedValue
                    value={summary.selected?.stressShare || 0}
                    baseline={allResidentsAverage?.stressShare || 0}
                    direction="lower"
                    formatter={formatPercent}
                  />
                </div>
              </div>
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-foreground">Expense composition</h3>
                <div className="mt-3">
                  <ExpenseComposition month={summary.selected} />
                </div>
              </div>
            </aside>
          </div>

          <PopulationSelector
            className="mt-4 rounded-lg border border-border/60 bg-card p-4"
            cohorts={cohortNames}
            selectedCohort={selectedCohort}
            onSelect={setSelectedCohort}
            residentCount={summary.latest?.participantCount}
          />

          <section className="mt-4 rounded-lg border border-border/60 bg-card p-4">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-foreground">Income versus expenses</h2>
              <p className="text-xs text-muted-foreground">
                Click a month to inspect exact income, expense, and net cashflow values.
              </p>
            </div>
            <IncomeExpenseLegend month={summary.selected} />
            <IncomeExpenseChart
              data={selectedSeries}
              selectedMonth={summary.selected?.month}
              onSelectMonth={setSelectedMonth}
            />
          </section>

          <section className="mt-4 rounded-lg border border-border/60 bg-card p-4">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-foreground">Cohort financial resilience</h2>
              <p className="text-xs text-muted-foreground">
                Shared axes compare whether resident groups move together, diverge, or carry different stress under the same citywide costs.
              </p>
            </div>
            <CohortComparisonPanel
              data={months}
              cohorts={cohortNames}
              metricId={cohortMetric}
              onMetricChange={setCohortMetric}
              selectedMonth={selectedMonth}
              onMonthSelect={setSelectedMonth}
            />
          </section>

          <p className="mt-4 text-xs text-muted-foreground">
            Interpretation note: final VAST claims should use real backend aggregate data. Fixture mode validates layout only.
          </p>
        </>
      )}
    </div>
  );
};

export default ResidentFinancialHealth;
