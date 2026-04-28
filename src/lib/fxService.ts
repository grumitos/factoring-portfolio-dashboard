// Caché en memoria para entorno servidor
let serverCacheRate: number | null = null;
const FX_FETCH_TIMEOUT_MS = 2500;

export async function fetchLatestRate(
  base: string = 'USD',
  symbols: string = 'PEN'
): Promise<number> {
  // --- Caché en memoria (servidor) ---
  if (serverCacheRate !== null) {
    return serverCacheRate;
  }

  // Obtener API key
  const apiKey = import.meta.env.CURRENCY_FREAKS_API_KEY;
  if (!apiKey) {
    throw new Error('CURRENCY_FREAKS_API_KEY no definida en entorno');
  }

  const url = new URL('https://api.currencyfreaks.com/v2.0/rates/latest');
  url.search = new URLSearchParams({
    apikey: apiKey,
    symbols,
    base
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FX_FETCH_TIMEOUT_MS);
  const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    throw new Error(`Error al obtener tasa de Currency API: ${res.status}`);
  }

  const data = await res.json();
  const rateStr = data.rates?.[symbols];
  if (!rateStr) {
    throw new Error('Tasa inválida recibida desde Currency API');
  }

  const parsed = Number.parseFloat(rateStr);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Tasa inválida recibida desde Currency API');
  }

  // Actualizar caché en memoria (servidor)
  serverCacheRate = parsed;

  return parsed;
}
