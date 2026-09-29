"""Proyección del patrimonio hacia la meta.

Se simula en pasos de medio mes: el saldo crece medio mes y el aporte mensual entra a mitad de mes.
"""

import math

from . import config

MAX_CHART_MONTHS = 600
MAX_GOAL_MULTIPLE = 2.5  # el gráfico no se extiende más allá de 2.5 veces la meta: la meta sigue legible


def round_half_up(value: float) -> int:
    """Redondeo como Math.round de JavaScript (13.5 -> 14, 38.5 -> 39); round() de Python redondea a par."""
    return math.floor(value + 0.5)


def _half_month_factor(annual_pct: float) -> float:
    monthly = (1 + annual_pct / 100) ** (1 / 12) - 1
    return (1 + monthly) ** 0.5


def months_to_goal(
    start: float, annual_pct: float, injection: float, goal: float, max_half_steps: int = config.MAX_HALF_STEPS
) -> float | None:
    """Meses (múltiplos de 0.5) hasta alcanzar la meta, o None si no se alcanza."""
    factor = _half_month_factor(annual_pct)
    balance, k = start, 0
    while balance < goal and k < max_half_steps:
        k += 1
        balance *= factor
        if k % 2 == 1:
            balance += injection
    return k / 2 if balance >= goal else None


def monthly_balances(start: float, annual_pct: float, injection: float, months: int) -> list[float]:
    """Saldo al cierre de cada mes: índice 0 = hoy, índice n = dentro de n meses."""
    factor = _half_month_factor(annual_pct)
    balances, balance = [start], start
    for k in range(1, 2 * months + 1):
        balance *= factor
        if k % 2 == 1:
            balance += injection
        else:
            balances.append(balance)
    return balances


def chart_horizon(crossing: int | None, start_month: int) -> int:
    """Meses a mostrar: pasa el cruce de la meta con margen y termina en un enero."""
    if crossing is None:
        return MAX_CHART_MONTHS
    padded = crossing + max(6, round_half_up(crossing * 0.25))
    to_january = (12 - (start_month + padded) % 12) % 12
    return min(MAX_CHART_MONTHS, max(12, padded + to_january))


def nice_ticks(low: float, high: float, max_ticks: int = 6) -> list[float]:
    """Marcas redondas del eje Y (pasos de 1, 2, 2.5 o 5 × 10^n) con 5% de holgura arriba y abajo."""
    grace = (high - low) * 0.05 or abs(high) * 0.05 or 1.0
    low, high = low - grace, high + grace
    raw = (high - low) / (max_ticks - 1)
    magnitude = 10 ** math.floor(math.log10(raw))
    step = next(m * magnitude for m in (1, 2, 2.5, 5, 10) if m * magnitude >= raw)
    first, last = math.floor(low / step) * step, math.ceil(high / step) * step
    return [first + i * step for i in range(round((last - first) / step) + 1)]


def goal_month(start: float, annual_pct: float, injection: float, goal: float) -> int | None:
    """Primer mes (desde hoy) cuyo saldo de cierre alcanza la meta."""
    months = months_to_goal(start, annual_pct, injection, goal)
    return None if months is None else round_half_up(months)


def goal_projection(start: float, annual_pct: float, injection: float, goal: float, start_month: int) -> dict:
    """Para el gráfico: series sin y con aportes, mes de cruce de cada una (None si no cae en el gráfico),
    marcas del eje Y y el mes en que se alcanza la meta con aportes (None si nunca)."""
    with_month = goal_month(start, annual_pct, injection, goal)
    without_month = goal_month(start, annual_pct, 0, goal)

    horizon = chart_horizon(with_month, start_month)
    if with_month is not None and without_month is not None and without_month > with_month:
        extended = chart_horizon(without_month, start_month)
        balances = monthly_balances(start, annual_pct, injection, extended)
        overflow = next((i for i, value in enumerate(balances) if value > goal * MAX_GOAL_MULTIPLE), None)
        horizon = extended if overflow is None else max(horizon, min(extended, overflow))

    series = [
        [round_half_up(v) for v in monthly_balances(start, annual_pct, 0, horizon)],
        [round_half_up(v) for v in monthly_balances(start, annual_pct, injection, horizon)],
    ]
    values = series[0] + series[1]
    return {
        "series": series,
        "crossings": [m if m is not None and m <= horizon else None for m in (without_month, with_month)],
        "ticks": nice_ticks(min(values), max(values)),
        "month": with_month,
    }
