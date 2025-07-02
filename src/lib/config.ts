export const DEFAULT_FX_RATE = 3.7;

export const MOVEMENT_TYPES = {
  PEN: {
    adds: ['deposito', 'pago capital', 'interes ganado', 'dolares a soles'],
    subs: ['inversion', 'retiro', 'soles a dolares']
  },
  USD: {
    adds: ['deposito', 'pago capital', 'interes ganado', 'soles a dolares'],
    subs: ['inversion', 'retiro', 'dolares a soles']
  }
} as const;

export const EXTERNAL_CAPITAL = {
  pen: 5068 + 6336 + 100000,
  usd: 1728 + 568
};

export const PERIODIC_INJECTION = 6000;
export const INJECTION_ITER_LIMIT = 5000;

export const GOAL_DEFAULT = 300_000;
export const INITIAL_INJECTION = 5700;

export const SLIDER_MIN = 200000;
export const SLIDER_MAX = 2000000;
export const SLIDER_STEP = 200000;
export const SLIDER_INITIAL = 200000;
