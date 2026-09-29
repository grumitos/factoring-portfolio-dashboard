const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

// Caché en memoria para entorno servidor
let serverCache: { rate: number; fetchedAt: number } | null = null;

export async function fetchLatestRate(
  base: string = 'USD',
  symbols: string = 'PEN'
): Promise<number> {
  if (serverCache && Date.now() - serverCache.fetchedAt < CACHE_TTL_MS) {
    return serverCache.rate;
  }

  const apiKey = import.meta.env.CURRENCY_FREAKS_API_KEY;
  if (!apiKey) {
    throw new Error('CURRENCY_FREAKS_API_KEY no definida en entorno');
  }

  const url = `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}&symbols=${symbols}&base=${base}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Error al obtener tasa de Currency API: ${res.status}`);
  }

  const data = await res.json();
  const rate = Number.parseFloat(data.rates?.[symbols]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Tasa inválida recibida desde Currency API');
  }

  serverCache = { rate, fetchedAt: Date.now() };
  return rate;
}
