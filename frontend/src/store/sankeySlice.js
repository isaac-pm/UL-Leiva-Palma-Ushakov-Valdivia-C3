import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { customfetch } from '../utils/api';

const MAX_CACHE_SIZE = 3;

const initialState = {
  nodes: [],
  links: [],
  flows: [],
  highlightedGroup: null,
  loading: false,
  error: null,
  errorByYearMonth: {},
  cache: {},
  cacheOrder: [],
};

export const fetchSankeyData = createAsyncThunk(
  'sankey/fetchSankeyData',
  async ({ year, month }) => {
    return customfetch(`/api/visual-analytics/sankey?year=${year}&month=${month}`);
  }
);

const sankeySlice = createSlice({
  name: 'sankey',
  initialState,
  reducers: {
    setHighlightedGroup: (state, action) => {
      state.highlightedGroup = action.payload;
    },
    clearSankeyData: (state) => {
      state.nodes = [];
      state.links = [];
      state.flows = [];
      state.highlightedGroup = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSankeyData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSankeyData.fulfilled, (state, action) => {
        state.loading = false;
        
        const payloadData = action.payload?.data?.data || [];
        if (payloadData.length === 0) {
          state.nodes = [];
          state.links = [];
          state.flows = [];
          return;
        }
        
        const quartileLabels = { 1: 'LowIncome', 2: 'MediumIncome', 3: 'HighIncome', 4: 'VeryHighIncome' };
        
        // Layer 1: Source nodes (left) - sourceFinancialQuartile
        const uniqueSources = [...new Set(payloadData.map(d => d.sourceFinancialQuartile))].sort((a, b) => a - b);
        
        // Layer 2: Middle nodes - travelPurpose
        const uniqueMiddles = [...new Set(payloadData.map(d => d.travelPurpose))].sort();
        
        // Layer 3: Target nodes (right) - targetFinancialQuartile
        const uniqueTargets = [...new Set(payloadData.map(d => d.targetFinancialQuartile))].sort((a, b) => a - b);
        
        // Create nodes array: [sources(0-n), middles(n+1...m), targets(m+1...)]
        const nodesArray = [];
        const sourceIndexMap = {};
        const middleIndexMap = {};
        const targetIndexMap = {};
        
        // Add source nodes (Layer 1 - left)
        uniqueSources.forEach((quartile, i) => {
          nodesArray.push({
            id: `source_${quartile}`,
            name: quartileLabels[quartile] || `Quartile_${quartile}`,
            category: quartileLabels[quartile],
            layer: 1,
          });
          sourceIndexMap[quartile] = i;
        });
        
        // Add middle nodes (Layer 2 - center)
        const sourceCount = uniqueSources.length;
        uniqueMiddles.forEach((purpose, i) => {
          nodesArray.push({
            id: `middle_${purpose}`,
            name: purpose,
            category: purpose,
            layer: 2,
          });
          middleIndexMap[purpose] = sourceCount + i;
        });
        
        // Add target nodes (Layer 3 - right)
        const middleCount = uniqueMiddles.length;
        uniqueTargets.forEach((quartile, i) => {
          nodesArray.push({
            id: `target_${quartile}`,
            name: quartileLabels[quartile] || `Quartile_${quartile}`,
            category: quartileLabels[quartile],
            layer: 3,
          });
          targetIndexMap[quartile] = sourceCount + middleCount + i;
        });
        
        // Create links: Layer 1 → Layer 2
        const layer1Links = [];
        const layer2Links = [];
        
        payloadData.forEach(item => {
          const sourceIdx = sourceIndexMap[item.sourceFinancialQuartile];
          const middleIdx = middleIndexMap[item.travelPurpose];
          const targetIdx = targetIndexMap[item.targetFinancialQuartile];
          
          if (sourceIdx === undefined || middleIdx === undefined || targetIdx === undefined) return;
          
          // Flow from source → middle (Layer 1 → Layer 2)
          layer1Links.push({
            source: sourceIdx,  // index
            target: middleIdx, // index
            sourceLayer: 1,    // PRESERVE ORIGINAL LAYER INFO
            targetLayer: 2,
            value: item.totalStartingBalance || 0,
            width: item.participantCount || 1,
            originalData: item,
          });
          
          // Flow from middle → target (Layer 2 → Layer 3)
          layer2Links.push({
            source: middleIdx,   // index
            target: targetIdx,  // index
            sourceLayer: 2,    // PRESERVE ORIGINAL LAYER INFO
            targetLayer: 3,
            value: item.totalEndingBalance || 0,
            width: item.participantCount || 1,
            originalData: item,
          });
        });
        
        state.nodes = nodesArray;
        state.links = [...layer1Links, ...layer2Links];
        state.flows = payloadData;
        
        const cacheKey = `${action.meta.arg.year}-${action.meta.arg.month}`;
        
        if (state.cacheOrder.length >= MAX_CACHE_SIZE) {
          const oldest = state.cacheOrder.shift();
          delete state.cache[oldest];
        }
        state.cacheOrder.push(cacheKey);
        state.cache[cacheKey] = {
          nodes: state.nodes,
          links: state.links,
          flows: state.flows,
        };
        
        delete state.errorByYearMonth[cacheKey];
      })
      .addCase(fetchSankeyData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        const cacheKey = `${action.meta.arg.year}-${action.meta.arg.month}`;
        state.errorByYearMonth[cacheKey] = action.error.message;
      });
  },
});

export const { setHighlightedGroup, clearSankeyData } = sankeySlice.actions;
export default sankeySlice.reducer;