export const SUB_MODE_GENERAL = 'general';
export const SUB_MODE_SPECIFIC = 'specific';

export const DEFAULT_LAYER_STATE = {
  jobConcentration: false,
  wageGeography: false,
  educationClusters: false,
  employerStability: false,
  wageMode: SUB_MODE_GENERAL,
  stabilityMode: SUB_MODE_GENERAL,
};

export const EMPLOYER_WAGE_GRADIENT = ['#d73027', '#1a9850'];

export const EMPLOYER_EDU_COLORS = {
  Low: '#f97316',
  HighSchoolOrCollege: '#f59e0b',
  Bachelors: '#2563eb',
  Graduate: '#a855f7',
};

export const EMPLOYER_EDU_LABELS = {
  Low: 'Low',
  HighSchoolOrCollege: 'High School',
  Bachelors: 'Bachelors',
  Graduate: 'Graduate',
};

export const EMPLOYER_STABILITY_COLORS = {
  stable: '#22c55e',
  moderate: '#f59e0b',
  unstable: '#ef4444',
};

export const EMPLOYER_STABILITY_DASH = {
  stable: 'none',
  moderate: '5,3',
  unstable: '2,2',
};

export const EMPLOYER_STABILITY_LABELS = {
  stable: 'Stable',
  moderate: 'Moderate',
  unstable: 'Unstable',
};

export const EMPLOYER_FILL_DEFAULT = '#f8f7fb';
export const EMPLOYER_STROKE_DEFAULT = '#374151';
