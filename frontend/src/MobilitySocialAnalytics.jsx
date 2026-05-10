import SankeyDiagram from './components/SankeyDiagram';
import NetworkGraph from './components/NetworkGraph';
import TimeSlider from './components/TimeSlider';
import AnalysisHeader from './components/AnalysisHeader';

const MobilitySocialAnalytics = () => {
  return (
    <div className="w-full max-w-full mx-auto px-6 py-6">
      <AnalysisHeader
        overline="Mobility Analysis"
        title="Mobility and Social Network Analysis"
        subtitle="Visualizing travel patterns and social connections with financial outcomes"
      />

      <TimeSlider />

      <div className="flex flex-col gap-6 mt-6">
        <div className="min-h-[450px]">
          <SankeyDiagram height={400} />
        </div>
        <div className="min-h-[450px]">
          <NetworkGraph height={400} />
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
