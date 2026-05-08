import { useState } from 'react';
import { Provider } from 'react-redux';
import MobilitySocialAnalytics from './MobilitySocialAnalytics';
import EmploymentPatternsMap from './EmploymentPatternsMap';
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
];

const PlaceholderPanel = ({ title }) => {
  return (
    <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 p-10 text-left">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Coming soon
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This section is a placeholder for the upcoming analysis. Keep this tab
        selected while we connect the data and visualizations.
      </p>
    </div>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState('mobility-social');

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
          </div>
        </aside>

        <main className="flex-1">
          <div className="w-full">
            <section hidden={activeTab !== 'business-prosperity'}>
              <PlaceholderPanel title="Business Prosperity Analysis" />
            </section>
            <section hidden={activeTab !== 'resident-financial-health'}>
              <PlaceholderPanel title="Resident Financial Health Over Time" />
            </section>
            <section hidden={activeTab !== 'employment-patterns'}>
              <EmploymentPatternsMap />
            </section>
            <section hidden={activeTab !== 'mobility-social'}>
              <MobilitySocialAnalytics />
            </section>
          </div>
        </main>
      </div>
    </Provider>
  );
}

export default App;
