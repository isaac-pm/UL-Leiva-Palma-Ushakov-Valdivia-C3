import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  selectedTimeRange: { year: 2022, month: 3 },
  timeGranularity: 'monthly',
  educationFilter: null,
  interestGroup: null,
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
  },
});

export const { setTimeRange, setTimeGranularity, setEducationFilter, setInterestGroup } = uiSlice.actions;
export default uiSlice.reducer;