export const formatUtils = {
    currencyFormatter: new Intl.NumberFormat('es-PE', { // Use a specific locale for consistency
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    
    percentFormatter: new Intl.NumberFormat('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    
    currency: (value, moneda = "PEN") => {
      const numValue = Number(value);
      if (isNaN(numValue)) return 'N/A';
      const symbol = moneda.toUpperCase() === "USD" ? "$" : "S/";
      return `${symbol}${formatUtils.currencyFormatter.format(numValue)}`;
    },
  
    percentage: (value) => {
      const numValue = Number(value);
      if (isNaN(numValue)) return 'N/A';
      return `${formatUtils.percentFormatter.format(numValue)}%`;
    },
  
    compactNumber: (value, currency = 'PEN') => {
      const numValue = Number(value);
      if (isNaN(numValue)) return 'N/A';
      const symbol = currency.toUpperCase() === 'USD' ? '$' : 'S/';
      if (Math.abs(numValue) >= 1000000) return `${symbol}${(numValue / 1000000).toFixed(1)}M`;
      if (Math.abs(numValue) >= 1000) return `${symbol}${(numValue / 1000).toFixed(0)}k`;
      return `${symbol}${numValue.toFixed(0)}`; // No decimals for compact base numbers
    },
  
    date: (dateString) => {
      if (!dateString) return 'N/A';
      try {
        // Ensure dateString is treated as UTC if no timezone info
        const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00Z');
        if (isNaN(date.getTime())) throw new Error("Invalid date");
        return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
      } catch (e) {
        console.warn("Error formateando fecha:", dateString, e);
        return 'Fecha Inv.';
      }
    },
  
    dateShort: (dateString) => {
      if (!dateString) return 'N/A';
      try {
        const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00Z');
        if (isNaN(date.getTime())) throw new Error("Invalid date");
        return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', timeZone: 'UTC' }); 
      } catch (e) {
        console.warn("Error formateando fecha corta:", dateString, e);
        return 'Fecha Inv.';
      }
    },
  
    dateForMeta: (date) => {
      if (!date || isNaN(date.getTime())) return '';
      // Ensure date is UTC for consistent month/year
      const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      return utcDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
  };