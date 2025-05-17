// Caché en memoria para entorno servidor
let serverCacheRate: number | null = null;

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

  try {
    const url = `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}&symbols=${symbols}&base=${base}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error al obtener tasa de Currency API: ${res.status}`);
    }
    const data = await res.json();
    const rateStr = data.rates?.[symbols];
    if (!rateStr) {
      throw new Error('Tasa inválida recibida desde Currency API');
    }
    const parsed = parseFloat(rateStr);

    // Actualizar caché en memoria (servidor)
    serverCacheRate = parsed;

    return parsed;
  } catch (err) {
    // No actualizar cache en caso de error y propagar
    throw err;
  }
}