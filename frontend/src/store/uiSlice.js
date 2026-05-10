import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  selectedTimeRange: { year: 2022, month: 3 },
  timeGranularity: 'monthly',
  educationFilter: null,
  interestGroup: null,
  selectedBuildings: [],
  buildingToEmployerIds: {},
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTimeRange: (state, action) => {
      state.selectedTimeRange = action.payload;
    },
    setTimeGranularity: (state, action) => {
      state.timeGranularity = action.payload;
    },
    setEducationFilter: (state, action) => {
      state.educationFilter = action.payload;
    },
    setInterestGroup: (state, action) => {
      state.interestGroup = action.payload;
    },
    setSelectedBuildings: (state, action) => {
      state.selectedBuildings = action.payload;
    },
    toggleSelectedBuilding: (state, action) => {
      const id = action.payload;
      const idx = state.selectedBuildings.indexOf(id);
      if (idx >= 0) {
        state.selectedBuildings = state.selectedBuildings.filter(x => x !== id);
      } else {
        state.selectedBuildings = [...state.selectedBuildings, id];
      }
    },
    clearSelectedBuildings: (state) => {
      state.selectedBuildings = [];
    },
    setBuildingToEmployerIds: (state, action) => {
      state.buildingToEmployerIds = action.payload;
    },
  },
});

export const { setTimeRange, setTimeGranularity, setEducationFilter, setInterestGroup, setSelectedBuildings, toggleSelectedBuilding, clearSelectedBuildings, setBuildingToEmployerIds } = uiSlice.actions;
export default uiSlice.reducer;