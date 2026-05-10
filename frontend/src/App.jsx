import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import MobilitySocialAnalytics from './MobilitySocialAnalytics';
import EmploymentPatternsMap from './EmploymentPatternsMap';
import WorkforceLifecycle from './WorkforceLifecycle';
import BusinessProsperityAnalysis from './BusinessProsperityAnalysis';
import ResidentFinancialHealth from './ResidentFinancialHealth';
import { store } from './store';

const tabs = [
  {
    id: 'business-prosperity',
    label: 'Business Prosperity Analysis',
  },
  {
    id: 'resident-financial-health',
    label: 'Resident Financial Health Over Time',
  },
  {
    id: 'employment-patterns',
    label: 'Employment Patterns Map',
  },
  {
    id: 'mobility-social',
    label: 'Mobility and Social Network Analysis',
  },
  {
    id: 'workforce-lifecycle',
    label: 'Workforce Dynamics Lifecycle',
  },
];

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

function App() {
  const [activeTab, setActiveTab] = useState('business-prosperity');
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <Provider store={store}>
      <div className="flex min-h-screen w-full">
        <aside
          className="sticky top-0 h-screen w-64 shrink-0 border-r border-border/60 bg-background/40"
          aria-label="Analysis sections"
        >
          <div className="flex h-full flex-col gap-2 px-4 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Analysis
            </p>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'bg-accent text-white shadow-md'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            <div className="mt-auto pt-6">
              <button
                type="button"
                className="theme-toggle w-full justify-between"
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
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <div className="w-full">
            <section hidden={activeTab !== 'business-prosperity'}>
              <BusinessProsperityAnalysis />
            </section>
            <section hidden={activeTab !== 'resident-financial-health'}>
              <ResidentFinancialHealth />
            </section>
            <section hidden={activeTab !== 'employment-patterns'}>
              <EmploymentPatternsMap />
            </section>
            <section hidden={activeTab !== 'mobility-social'}>
              <MobilitySocialAnalytics />
            </section>
            <section hidden={activeTab !== 'workforce-lifecycle'}>
              <WorkforceLifecycle />
            </section>
          </div>
        </main>
      </div>
    </Provider>
  );
}

export default App;
