"""Modelo del portafolio y sus métricas. Funciones puras: reciben datos y devuelven resultados."""

import calendar
from dataclasses import dataclass
from datetime import date, datetime, time

from . import config
from .sources import normalize

STATUS_PAID = "cobrado"
STATUS_REJECTED = "rechazado"
STATUSES = {STATUS_PAID, STATUS_REJECTED, "por cobrar", "pendiente"}  # los que usa el portal
DAYS_PER_MONTH = 30.4375


@dataclass(frozen=True)
class Investment:
    code: str
    client: str
    start: datetime
    payment: datetime
    amount: float
    currency: str
    monthly_pct: float
    status: str
    risk: str


@dataclass(frozen=True)
class Earning:
    code: str
    amount: float
    date: datetime
    currency: str


@dataclass(frozen=True)
class Movement:
    kind: str
    amount: float
    currency: str
    date: datetime


@dataclass(frozen=True)
class Portfolio:
    investments: list[Investment]
    earnings: list[Earning]
    movements: list[Movement]


@dataclass(frozen=True)
class Contract:
    code: str
    client: str
    payment: datetime
    paid: bool
    gain_pen: float
    risk: str


# ── Lectura de filas ─────────────────────────────────────────


def _field(row: dict, key: str) -> object:
    value = row.get(key)
    if value in (None, ""):
        raise ValueError(f"Falta '{key}' en una fila (columnas: {', '.join(row)})")
    return value


def _status(row: dict) -> str:
    """Estado conocido: uno nuevo o renombrado movería contratos entre pendientes, cobrados y rechazados."""
    status = normalize(_field(row, "estado"))
    if status not in STATUSES:
        raise ValueError(f"Estado desconocido: {status!r}")
    return status


def _as_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time())
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return datetime.strptime(text, "%d/%m/%Y")


def _as_time(value: object) -> time:
    if isinstance(value, datetime):
        return value.time()
    return value if isinstance(value, time) else time.fromisoformat(str(value).strip())


def _currency(row: dict) -> str:
    currency = str(_field(row, "moneda")).strip().upper()
    if currency not in config.MOVEMENT_SIGNS:
        raise ValueError(f"Moneda desconocida: {currency!r}")
    return currency


def parse_exports(raw: dict[str, list[dict]]) -> Portfolio:
    """Convierte las filas de los exportes (ver sources.load_exports) en el modelo del portafolio."""
    investments = [
        Investment(
            code=str(_field(row, "codigo de subasta")),
            client=str(row.get("cliente") or ""),
            start=datetime.combine(
                _as_datetime(_field(row, "fecha")).date(),
                _as_time(row["hora"]) if row.get("hora") else time(),
            ),
            payment=_as_datetime(_field(row, "fecha de pago")),
            amount=float(_field(row, "inversion")),
            currency=_currency(row),
            monthly_pct=float(_field(row, "retorno mensual (%)")),
            status=_status(row),
            risk=str(row.get("riesgo") or "").strip(),
        )
        for row in raw["investments"]
    ]
    earnings = [
        Earning(
            code=str(_field(row, "codigo de subasta")),
            amount=float(_field(row, "monto")),
            date=_as_datetime(_field(row, "fecha")),
            currency=_currency(row),
        )
        for row in raw["earnings"]
    ]
    movements = [
        Movement(
            kind=normalize(_field(row, "movimiento")),
            amount=float(_field(row, "monto")),
            currency=_currency(row),
            date=_as_datetime(_field(row, "fecha")),
        )
        for row in raw["movements"]
    ]
    return Portfolio(investments, earnings, movements)


# ── Métricas ─────────────────────────────────────────────────


def to_pen(amount: float, currency: str, fx_rate: float) -> float:
    return amount * fx_rate if currency == "USD" else amount


def add_months(moment: datetime, months: int) -> datetime:
    """Mismo día del mes desplazado, ajustado al último día si no existe (31 mar - 1 = 28/29 feb)."""
    index = moment.month - 1 + months
    year, month = moment.year + index // 12, index % 12 + 1
    return moment.replace(year=year, month=month, day=min(moment.day, calendar.monthrange(year, month)[1]))


def months_between(start: datetime, end: datetime) -> float:
    return (end - start).total_seconds() / 86_400 / DAYS_PER_MONTH


def expected_gain(principal: float, monthly_pct: float, start: datetime, end: datetime) -> float:
    """Ganancia compuesta pactada entre dos fechas; 0 si el plazo no es positivo."""
    months = months_between(start, end)
    return principal * ((1 + monthly_pct / 100) ** months - 1) if months > 0 else 0.0


def _annual_rate(principal: float, gain: float, start: datetime, end: datetime) -> float:
    months = months_between(start, end)
    final = principal + gain
    if principal <= 0 or months <= 0 or final <= 0:
        return 0.0
    try:
        return (final / principal) ** (12 / months) - 1
    except OverflowError:  # plazos de horas con ganancia: tasa no representable
        return 0.0


def _realized_by_code(earnings: list[Earning], fx_rate: float) -> dict[str, tuple[float, datetime]]:
    """Ganancia cobrada en PEN y fecha del último cobro, por código de subasta."""
    realized: dict[str, tuple[float, datetime]] = {}
    for earning in earnings:
        total, latest = realized.get(earning.code, (0.0, earning.date))
        realized[earning.code] = (total + to_pen(earning.amount, earning.currency, fx_rate), max(latest, earning.date))
    return realized


def net_balances(movements: list[Movement]) -> dict[str, float]:
    """Saldo de cada moneda: movimientos del portal más el capital externo."""
    totals = dict(config.EXTERNAL_CAPITAL)
    for movement in movements:
        signs = config.MOVEMENT_SIGNS[movement.currency]
        if movement.kind not in signs:
            raise ValueError(f"Tipo de movimiento desconocido: {movement.kind!r} ({movement.currency})")
        totals[movement.currency] += signs[movement.kind] * movement.amount
    return totals


def annualized_rate(portfolio: Portfolio, fx_rate: float) -> float:
    """Tasa anual efectiva promedio, ponderada por capital (en %). Omite rechazados; lo cobrado pisa lo pactado."""
    realized = _realized_by_code(portfolio.earnings, fx_rate)
    weighted = total = 0.0
    for inv in portfolio.investments:
        if inv.status == STATUS_REJECTED:
            continue
        principal = to_pen(inv.amount, inv.currency, fx_rate)
        if inv.code in realized:
            gain, end = realized[inv.code]
        else:
            gain, end = expected_gain(principal, inv.monthly_pct, inv.start, inv.payment), inv.payment
        weighted += principal * _annual_rate(principal, gain, inv.start, end)
        total += principal
    return weighted / total * 100 if total > 0 else 0.0


def last_month_gains(earnings: list[Earning], now: datetime) -> dict[str, float]:
    """Ganancias cobradas desde hace un mes calendario hasta `now`, cada una en su moneda."""
    since = add_months(now, -1)
    gains = {currency: 0.0 for currency in config.MOVEMENT_SIGNS}
    for earning in earnings:
        if since <= earning.date <= now:
            gains[earning.currency] += earning.amount
    return gains


def contracts(portfolio: Portfolio, fx_rate: float) -> list[Contract]:
    """Contratos no rechazados con su ganancia en PEN: la cobrada si existe, si no la pactada."""
    realized = _realized_by_code(portfolio.earnings, fx_rate)
    result = []
    for inv in portfolio.investments:
        if inv.status == STATUS_REJECTED:
            continue
        principal = to_pen(inv.amount, inv.currency, fx_rate)
        gain = realized[inv.code][0] if inv.code in realized else expected_gain(
            principal, inv.monthly_pct, inv.start, inv.payment
        )
        result.append(Contract(inv.code, inv.client, inv.payment, inv.status == STATUS_PAID, gain, inv.risk))
    return result


def data_as_of(portfolio: Portfolio) -> datetime | None:
    """Fecha del registro más reciente: referencia de los días relativos."""
    dates = [i.start for i in portfolio.investments] + [e.date for e in portfolio.earnings]
    dates += [m.date for m in portfolio.movements]
    return max(dates, default=None)
