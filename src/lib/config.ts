export const DEFAULT_FX_RATE = 3.7;

export const MOVEMENT_TYPES: Record<'PEN'|'USD', { adds: string[]; subs: string[] }> = {
   PEN: {
     adds: ['deposito', 'pago capital', 'interes ganado', 'dolares a soles'],
     subs: ['inversion', 'retiro', 'soles a dolares']
   },
   USD: {
     adds: ['deposito', 'pago capital', 'interes ganado', 'soles a dolares'],
     subs: ['inversion', 'retiro', 'dolares a soles']
   }
};

export const EXTERNAL_CAPITAL = {
  pen: 121000,
  usd: 10820
};

export const PERIODIC_INJECTION = 5700;
export const INJECTION_ITER_LIMIT = 5000;

export const GOAL = 400000;
export const INITIAL_INJECTION = 5700;

export const SLIDER_MIN = GOAL;
export const SLIDER_MAX = 2000000;
export const SLIDER_STEP = 200000;
export const SLIDER_INITIAL = SLIDER_MIN;
