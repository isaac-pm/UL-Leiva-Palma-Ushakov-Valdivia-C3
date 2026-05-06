import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { customfetch } from '../utils/api';

const MAX_CACHE_SIZE = 3;

const initialState = {
  nodes: [],
  links: [],
  selectedNodeId: null,
  hoveredClusterId: null,
  highlightedGroup: null,
  loading: false,
  error: null,
  errorByYearMonth: {},
  cache: {},
  cacheOrder: [],
};

export const fetchNetworkData = createAsyncThunk(
  'graph/fetchNetworkData',
  async ({ year, month }) => {
    console.log('[GraphSlice] Fetching network data for', year, month);
    const result = await customfetch(`/api/visual-analytics/network?year=${year}&month=${month}`);
    console.log('[GraphSlice] API result:', result?.data?.data?.length, 'items');
    return result;
  }
);

const graphSlice = createSlice({
  name: 'graph',
  initialState,
  reducers: {
    setSelectedNodeId: (state, action) => {
      state.selectedNodeId = action.payload;
    },
    setHoveredClusterId: (state, action) => {
      state.hoveredClusterId = action.payload;
    },
    setHighlightedGroup: (state, action) => {
      state.highlightedGroup = action.payload;
    },
    clearNetworkData: (state) => {
      state.nodes = [];
      state.links = [];
      state.selectedNodeId = null;
      state.hoveredClusterId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNetworkData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
.addCase(fetchNetworkData.fulfilled, (state, action) => {
        state.loading = false;
        
        const payloadData = action.payload?.data?.data || [];
        console.log('[GraphSlice] Processing', payloadData.length, 'items');
        
        if (payloadData.length === 0) {
          state.nodes = [];
          state.links = [];
          console.log('[GraphSlice] No data - empty state');
          return;
        }
        
        const maxClusterId = Math.max(...payloadData.map(d => Math.max(d.sourceClusterId || 0, d.targetClusterId || 0)));
        const nodesArray = new Array(maxClusterId + 1).fill(null);
        const linksArray = [];
        
        payloadData.forEach(item => {
          const sourceId = item.sourceClusterId;
          const targetId = item.targetClusterId;
          
          // Create node if doesn't exist
          if (!nodesArray[sourceId]) {
            nodesArray[sourceId] = {
              id: `cluster_${sourceId}`,
              clusterId: sourceId,
              category: `Cluster_${sourceId}`,
            };
          }
          if (!nodesArray[targetId]) {
            nodesArray[targetId] = {
              id: `cluster_${targetId}`,
              clusterId: targetId,
              category: `Cluster_${targetId}`,
            };
          }
          
          // Only add links where source !== target (no self-loops)
          if (sourceId !== targetId) {
            linksArray.push({
              source: sourceId,
              target: targetId,
              weight: item.interactionCount || 1,
            });
          }
        });
        
        state.nodes = nodesArray.filter(n => n !== null);
        state.links = linksArray;
        
        const cacheKey = `${action.meta.arg.year}-${action.meta.arg.month}`;
        
        if (state.cacheOrder.length >= MAX_CACHE_SIZE) {
          const oldest = state.cacheOrder.shift();
          delete state.cache[oldest];
        }
        state.cacheOrder.push(cacheKey);
        state.cache[cacheKey] = { nodes: state.nodes, links: state.links };
        
        delete state.errorByYearMonth[cacheKey];
      })
      .addCase(fetchNetworkData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        const cacheKey = `${action.meta.arg.year}-${action.meta.arg.month}`;
        state.errorByYearMonth[cacheKey] = action.error.message;
      });
  },
});

export const { setSelectedNodeId, setHoveredClusterId, setHighlightedGroup, clearNetworkData } = graphSlice.actions;
export default graphSlice.reducer;