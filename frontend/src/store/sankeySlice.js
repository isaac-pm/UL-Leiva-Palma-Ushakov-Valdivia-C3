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
        const nodesArray = [];
        const sourceIndexMap = {};
        const targetIndexMap = {};
        
        // First, create source nodes (income quartiles): indices 0-3
        const uniqueSources = [...new Set(payloadData.map(d => d.sourceFinancialQuartile))].sort();
        uniqueSources.forEach((quartile, i) => {
          const label = quartileLabels[quartile] || `Quartile_${quartile}`;
          nodesArray.push({
            id: `source_${quartile}`,
            name: label,
            category: label,
          });
          sourceIndexMap[quartile] = i;
        });
        
        // Then, create target nodes (travel purposes): indices 4+
        const uniqueTargets = [...new Set(payloadData.map(d => d.travelPurpose))].sort();
        uniqueTargets.forEach((purpose, i) => {
          nodesArray.push({
            id: `target_${purpose}`,
            name: purpose,
            category: purpose,
          });
          targetIndexMap[purpose] = 4 + i;
        });
        
        // Create flows with correct indices
        const flowsArray = [];
        const linksArray = [];
        
        payloadData.forEach(item => {
          const sourceIdx = sourceIndexMap[item.sourceFinancialQuartile];
          const targetIdx = targetIndexMap[item.travelPurpose];
          
          if (sourceIdx === undefined || targetIdx === undefined) return;
          
          flowsArray.push({
            sourceIndex: sourceIdx,
            targetIndex: targetIdx,
            value: item.totalStartingBalance || 0,
            width: item.participantCount || 1,
            sourceCategory: quartileLabels[item.sourceFinancialQuartile],
            targetCategory: item.travelPurpose,
          });
          
          linksArray.push({
            sourceIndex: sourceIdx,
            targetIndex: targetIdx,
            value: item.totalStartingBalance || 0,
            width: item.participantCount || 1,
          });
        });
        
        state.nodes = nodesArray;
        state.links = linksArray;
        state.flows = flowsArray;
        
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