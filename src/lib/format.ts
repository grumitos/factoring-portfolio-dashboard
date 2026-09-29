// Formateadores compartidos entre el servidor (SSR) y los scripts del cliente.
// Sin dependencias para no arrastrar librerías al bundle del navegador.

const LOCALE = 'es-PE';

const PEN = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'PEN' });
const PEN_INTEGER = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
const AMOUNT = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const MONTH_YEAR_SHORT = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' });
const SHORT_DATE = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatPen = (value: number): string => PEN.format(value);
export const formatPenInteger = (value: number): string => PEN_INTEGER.format(value);
/** Monto con dos decimales y sin símbolo, para cuando la moneda ya está en la etiqueta */
export const formatAmount = (value: number): string => AMOUNT.format(value);
export const formatPercent = (value: number): string => `${value.toFixed(2)}%`;
export const formatMonthYearShort = (date: Date): string => MONTH_YEAR_SHORT.format(date);
export const formatShortDate = (date: Date): string => SHORT_DATE.format(date);

/** Formato compacto para ejes y etiquetas: 1500 -> "1.5K", 2000000 -> "2M" */
export const formatCompact = (num: number): string => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1) + 'K';
  return INTEGER.format(num);
};
