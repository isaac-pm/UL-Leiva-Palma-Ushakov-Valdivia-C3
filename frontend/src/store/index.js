import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './uiSlice';
import graphReducer from './graphSlice';
import sankeyReducer from './sankeySlice';
import { fetchNetworkData } from './graphSlice';
import { fetchSankeyData } from './sankeySlice';

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    graph: graphReducer,
    sankey: sankeyReducer,
  },
});

let previousTimeRange = null;
let initialFetchDone = false;

store.subscribe(() => {
  const state = store.getState();
  const { selectedTimeRange } = state.ui;
  const cacheKey = `${selectedTimeRange.year}-${selectedTimeRange.month}`;
  
  const hasNetworkData = state.graph.cache[cacheKey] !== undefined;
  const hasSankeyData = state.sankey.cache[cacheKey] !== undefined;
  
  const networkError = state.graph.errorByYearMonth[cacheKey];
  const sankeyError = state.sankey.errorByYearMonth[cacheKey];
  
  const hasNetworkError = !!networkError;
  const hasSankeyError = !!sankeyError;
  
  if (initialFetchDone && selectedTimeRange === previousTimeRange) {
    return;
  }
  
  initialFetchDone = true;
  previousTimeRange = selectedTimeRange;
  
  if (!hasNetworkData && !hasNetworkError && !state.graph.loading) {
    store.dispatch(fetchNetworkData(selectedTimeRange));
  }
  
  if (!hasSankeyData && !hasSankeyError && !state.sankey.loading) {
    store.dispatch(fetchSankeyData(selectedTimeRange));
  }
});