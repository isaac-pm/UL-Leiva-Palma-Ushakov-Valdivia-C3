import { useState, useEffect } from 'react';
import { customfetch } from '../utils/api';

export function useEmployerMapData() {
  const [employers, setEmployers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await customfetch('/api/employers/map-data');
        const data = response?.data?.data || [];
        if (!isMounted) return;

        setEmployers(data);

        const hourlyRates = data
          .map((e) => e.avgHourlyRate)
          .filter((r) => r > 0);
        const variances = data
          .map((e) => e.wageVariance)
          .filter((v) => Number.isFinite(v) && v > 0)
          .sort((a, b) => a - b);

        const maxJobs = Math.max(...data.map((e) => e.jobCount), 1);
        const minWage = hourlyRates.length > 0 ? Math.min(...hourlyRates) : 0;
        const maxWage = hourlyRates.length > 0 ? Math.max(...hourlyRates) : 1;

        const varianceCount = variances.length;
        const t1 = varianceCount > 0 ? variances[Math.floor(varianceCount / 3)] : 0;
        const t2 = varianceCount > 0 ? variances[Math.floor((2 * varianceCount) / 3)] : 0;

        setStats({ maxJobs, minWage, maxWage, varianceThresholds: [t1, t2] });
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Unable to load employer data');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  return { employers, stats, loading, error };
}
