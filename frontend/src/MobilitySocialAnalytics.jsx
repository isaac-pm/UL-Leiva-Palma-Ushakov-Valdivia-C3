import { useEffect, useState } from 'react';
import SankeyDiagram from './components/SankeyDiagram';
import NetworkGraph from './components/NetworkGraph';
import TimeSlider from './components/TimeSlider';

const getInitialTheme = () => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

const MobilitySocialAnalytics = () => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="w-full max-w-[90rem] mx-auto px-6 py-6">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Mobility and Social Network Analysis
          </h1>
          <p className="text-muted-foreground">
            Visualizing travel patterns and social connections with financial outcomes
          </p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() =>
            setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
          }
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span className="theme-toggle__label">
            {theme === 'dark' ? 'Dark mode' : 'Light mode'}
          </span>
          <span className="theme-toggle__track" aria-hidden="true">
            <span className="theme-toggle__thumb" />
          </span>
        </button>
      </header>

      <TimeSlider />

      <div className="flex flex-col gap-6 mt-6">
        <div className="min-h-[450px]">
          <SankeyDiagram width={1000} height={400} />
        </div>
        <div className="min-h-[450px]">
          <NetworkGraph width={1000} height={400} />
        </div>
      </div>

      <div className="mt-6 p-4 bg-card rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-3">Visualization Guide</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500 mt-0.5" />
            <div>
              <span className="font-medium">High Income</span>
              <p className="text-xs text-muted-foreground">Above median wage</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-4 h-4 rounded bg-blue-500 mt-0.5" />
            <div>
              <span className="font-medium">Medium Income</span>
              <p className="text-xs text-muted-foreground">Near median wage</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-4 h-4 rounded bg-amber-500 mt-0.5" />
            <div>
              <span className="font-medium">Low Income</span>
              <p className="text-xs text-muted-foreground">Below median wage</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-4 h-4 rounded bg-cyan-500 mt-0.5" />
            <div>
              <span className="font-medium">Stable Employment</span>
              <p className="text-xs text-muted-foreground">Low turnover</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-accent/5 rounded-lg border border-accent/20">
        <h4 className="font-medium mb-2">Interaction Hints</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Click on Sankey flows to highlight related network connections</li>
          <li>• Click on Network nodes to highlight related spending flows</li>
          <li>• Use the time slider to explore temporal patterns</li>
          <li>• Monthly aggregation shows seasonal trends by default</li>
        </ul>
      </div>
    </div>
  );
};

export default MobilitySocialAnalytics;
