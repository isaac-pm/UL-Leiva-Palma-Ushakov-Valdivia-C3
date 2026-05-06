import { useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setTimeRange, setTimeGranularity } from '../store/uiSlice';

const TimeSlider = () => {
  const dispatch = useDispatch();
  const { selectedTimeRange, timeGranularity } = useSelector((state) => state.ui);

  const months = useMemo(() => [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ], []);

  const currentIndex = useMemo(() => {
    return (selectedTimeRange.year - 2022) * 12 + selectedTimeRange.month - 1;
  }, [selectedTimeRange]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      dispatch(setTimeRange({
        year: 2022 + Math.floor(newIndex / 12),
        month: (newIndex % 12) + 1
      }));
    }
  }, [currentIndex, dispatch]);

  const handleNext = useCallback(() => {
    if (currentIndex < 23) {
      const newIndex = currentIndex + 1;
      dispatch(setTimeRange({
        year: 2022 + Math.floor(newIndex / 12),
        month: (newIndex % 12) + 1
      }));
    }
  }, [currentIndex, dispatch]);

  const handleMonthClick = useCallback((index) => {
    dispatch(setTimeRange({
      year: 2022 + Math.floor(index / 12),
      month: (index % 12) + 1
    }));
  }, [dispatch]);

  return (
    <div className="p-4 bg-card rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="px-3 py-1 rounded border border-border hover:bg-accent hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ←
        </button>
        
        <div className="text-center">
          <span className="text-lg font-semibold">
            {months[selectedTimeRange.month - 1]} {selectedTimeRange.year}
          </span>
        </div>
        
        <button
          onClick={handleNext}
          disabled={currentIndex >= 23}
          className="px-3 py-1 rounded border border-border hover:bg-accent hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          →
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2">
        {months.map((month, index) => {
          const year = 2022 + Math.floor(index / 12);
          const monthNum = (index % 12) + 1;
          const isSelected = selectedTimeRange.year === year && selectedTimeRange.month === monthNum;

          return (
            <button
              key={month}
              onClick={() => handleMonthClick(index)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                isSelected
                  ? 'bg-accent text-white'
                  : 'bg-background hover:bg-accent/10'
              }`}
            >
              {month}
            </button>
          );
        })}
      </div>

      <div className="flex gap-4 mt-3 pt-3 border-t border-border">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="granularity"
            checked={timeGranularity === 'monthly'}
            onChange={() => dispatch(setTimeGranularity('monthly'))}
            className="accent-accent"
          />
          Monthly
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="granularity"
            checked={timeGranularity === 'daily'}
            onChange={() => dispatch(setTimeGranularity('daily'))}
            className="accent-accent"
          />
          Daily
        </label>
      </div>
    </div>
  );
};

export default TimeSlider;