export const formatUtils = {
  currencyFormatter: new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  percentFormatter: new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),

  currency(value: number, moneda: 'PEN' | 'USD' = 'PEN'): string {
    if (isNaN(value)) return 'N/A';
    const symbol = moneda === 'USD' ? '$' : 'S/ ';
    return `${symbol}${this.currencyFormatter.format(value)}`;
  },

  percentage(value: number): string {
    if (isNaN(value)) return 'N/A';
    return `${this.percentFormatter.format(value)}%`;
  },

  compactNumber(value: number, currency: 'PEN' | 'USD' = 'PEN'): string {
    if (isNaN(value)) return 'N/A';
    const abs = Math.abs(value);
    const symbol = currency === 'USD' ? '$' : 'S/ ';
    if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}k`;
    return `${symbol}${value.toFixed(0)}`;
  },

  date(dateString: string): string {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Fecha Inv.';
    return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  },

  dateShort(dateString: string): string {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Fecha Inv.';
    return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  },

  dateForMeta(date: Date): string {
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
};
