"""Arma dist/index.html: textos ya formateados, datos para el navegador y la plantilla de web/."""

import json
import urllib.parse
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from html import escape
from string import Template

from . import config, portfolio, projection
from .sources import normalize

MONTHS = ("ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic.")  # es-PE


# ── Formato: mismo resultado que Intl es-PE en el navegador ──


def fixed(value: float, places: int = 2, grouping: bool = True) -> str:
    """Redondeo half-up sobre el valor exacto (como Intl y toFixed), no half-even como format()."""
    rounded = Decimal(value).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return f"{rounded:{',' if grouping else ''}.{places}f}"


def pen(value: float, places: int = 2) -> str:
    return f"{'-' if value < 0 else ''}S/ {fixed(abs(value), places)}"


def percent(value: float) -> str:
    return f"{fixed(value, grouping=False)}%"


def signed(value: float) -> str:
    return f"+{fixed(value)}" if value > 0 else fixed(value)


def compact(value: float) -> str:
    """400000 -> '400K', 1200000 -> '1.2M', 1250000 -> '1.25M' (hasta dos decimales, sin ceros de más)."""
    for size, suffix in ((1_000_000, "M"), (1_000, "K")):
        if value >= size:
            return fixed(value / size, grouping=False).rstrip("0").rstrip(".") + suffix
    return fixed(value, 0)


def month_label(year: int, month_index: int) -> str:
    """Mes `month_index` contado desde enero de `year` (admite desbordes): 'nov. 2027'."""
    return f"{MONTHS[month_index % 12]} {year + month_index // 12}"


def short_date(moment: datetime) -> str:
    return f"{moment.day} {MONTHS[moment.month - 1]} {moment.year}"


def numeric_date(moment: datetime) -> str:
    return f"{moment.day}/{moment.month}/{moment.year}"


# ── Modelo de la vista ───────────────────────────────────────


def build_view(data: portfolio.Portfolio, fx_rate: float, fx_fallback: bool, now: datetime) -> dict:
    """Todo lo que muestra el tablero, calculado y formateado."""
    net = portfolio.net_balances(data.movements)
    rate = portfolio.annualized_rate(data, fx_rate)
    last_month = portfolio.last_month_gains(data.earnings, now)
    as_of = portfolio.data_as_of(data)
    start = net["PEN"] + net["USD"] * fx_rate
    first_month = now.month - 1

    steps = []
    for goal in config.GOAL_STEPS:
        chart = projection.goal_projection(start, rate, config.MONTHLY_INJECTION, goal, first_month)
        month = chart["month"]
        progress = start / goal * 100
        steps.append({
            "target": goal,
            "goal": f"S/ {compact(goal)}",
            "label": f"Meta S/ {compact(goal)}",
            "value": percent(progress),
            "progress": min(100.0, max(0.0, progress)),
            "date": ("Fuera de alcance" if month is None else "Alcanzada" if month == 0
                     else month_label(now.year, first_month + month)),
            "series": chart["series"],
            "crossings": chart["crossings"],
            "ticks": chart["ticks"],
            "tickLabels": [compact(tick) for tick in chart["ticks"]],
        })

    horizon = max(len(step["series"][0]) for step in steps)
    first_january = (12 - first_month) % 12
    monthly_yield = start * ((1 + rate / 100) ** (1 / 12) - 1)
    return {
        "fx": f"USD/PEN {fixed(fx_rate, 3, grouping=False)}{' ref.' if fx_fallback else ''}",
        "fx_fallback": fx_fallback,
        "as_of": short_date(as_of) if as_of else None,
        "kpis": [
            _money_kpi("Capital PEN", net["PEN"], last_month["PEN"]),
            _money_kpi("Capital USD", net["USD"], last_month["USD"]),
            {"label": "Tasa anual", "value": percent(rate), "note_value": f"≈ {pen(monthly_yield, 0)} / mes"},
            {"label": steps[0]["label"], "value": steps[0]["value"], "progress": steps[0]["progress"],
             "note_value": steps[0]["date"], "name": "goal"},
        ],
        "injection": pen(config.MONTHLY_INJECTION, 0),
        "data": {
            "months": [month_label(now.year, first_month + i) for i in range(horizon)],
            "firstJanuary": first_january,
            "firstYear": now.year + (first_month + first_january) // 12,
            "steps": steps,
            "contracts": [_contract(c, as_of) for c in portfolio.contracts(data, fx_rate)],
            "daysTitle": f"Días respecto al corte del {short_date(as_of)}" if as_of else "",
        },
    }


def _money_kpi(label: str, value: float, last_month: float) -> dict:
    return {"label": label, "value": fixed(value), "note": "Último mes", "note_value": signed(last_month),
            "positive": last_month > 0}


def _contract(contract: portfolio.Contract, as_of: datetime | None) -> dict:
    days = None if contract.paid or as_of is None else (contract.payment.date() - as_of.date()).days
    risk = contract.risk.lower()
    return {
        "client": contract.client,
        "code": contract.code,
        "key": normalize(f"{contract.client}\n{contract.code}"),
        "risk": contract.risk,
        "riskTone": risk if risk in ("b", "c") else "a",
        "paid": contract.paid,
        "t": (contract.payment - datetime(1970, 1, 1)).total_seconds(),
        "date": numeric_date(contract.payment),
        "days": None if days is None else f"{'+' if days > 0 else '−' if days < 0 else ''}{abs(days)} d",
        "overdue": days is not None and days < 0,
        "gain": contract.gain_pen,
        "gainLabel": fixed(contract.gain_pen),
    }


# ── HTML ─────────────────────────────────────────────────────


def render_page(view: dict | None) -> str:
    """Página completa. Sin `view` (modo público) no incluye cifras, contratos ni scripts."""
    web = config.WEB_DIR
    favicon = "data:image/svg+xml," + urllib.parse.quote((web / "favicon.svg").read_text(encoding="utf-8").strip())

    if view is None:
        kpis = [{"label": label, "value": "—"} for label in ("Capital PEN", "Capital USD", "Tasa anual", "Meta")]
        meta, scripts = "", ""
        panels = "\n".join(f'<section class="panel panel-note" aria-label="{name}">Datos privados</section>'
                           for name in ("Proyección", "Contratos de factoring"))
    else:
        kpis = view["kpis"]
        fx_class = ' class="is-fallback"' if view["fx_fallback"] else ""
        as_of = f"<span>Corte {view['as_of']}</span>" if view["as_of"] else ""
        meta = f'<p class="data-meta num"><span{fx_class}>{view["fx"]}</span>{as_of}</p>'
        panels = _chart_panel(view["injection"], len(config.GOAL_STEPS)) + _contracts_panel()
        # Todo "<" escapado: ningún texto de los datos puede cerrar ni reabrir la etiqueta <script>
        payload = json.dumps(view["data"], ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        payload = payload.replace("<", "\\u003c")
        app = (web / "app.js").read_text(encoding="utf-8")
        scripts = (f'<script id="dashboard-data" type="application/json">{payload}</script>\n'
                   f'<script type="module">\n{app}</script>')

    return Template((web / "index.html").read_text(encoding="utf-8")).substitute(
        favicon=favicon,
        styles=(web / "styles.css").read_text(encoding="utf-8"),
        meta=meta,
        kpis="\n".join(_kpi(**kpi) for kpi in kpis),
        workspace_class="workspace" if view else "workspace is-private",
        panels=panels,
        scripts=scripts,
    )


def _kpi(label: str, value: str, note: str = "", note_value: str = "", positive: bool = False,
         progress: float | None = None, name: str | None = None) -> str:
    name_attr = f' data-kpi="{name}"' if name else ""
    parts = [f'<div class="kpi"{name_attr}>',
             f'<p class="kpi-label">{escape(label)}</p>',
             f'<p class="kpi-value num">{escape(value)}</p>']
    if progress is not None:
        parts.append(
            f'<div class="kpi-progress" role="progressbar" aria-label="{escape(label)}" aria-valuemin="0" '
            f'aria-valuemax="100" aria-valuenow="{projection.round_half_up(progress)}">'
            f'<span style="width: {progress:.4f}%"></span></div>'
        )
    if note or note_value:
        note_html = f"<span>{escape(note)}</span>" if note else ""
        tone = " is-positive" if positive else ""
        parts.append(f'<p class="kpi-note">{note_html}<span class="num{tone}">{escape(note_value)}</span></p>')
    return "".join(parts) + "</div>"


def _chart_panel(injection: str, steps: int) -> str:
    return f"""<section class="panel chart-panel" aria-label="Proyección">
  <div class="chart-bar">
    <div class="chart-legend" role="group" aria-label="Series">
      <button type="button" class="legend-toggle" data-series="1" aria-pressed="true">
        <span class="swatch is-with" aria-hidden="true"></span>Con aportes <span class="num">{injection}/mes</span>
      </button>
      <button type="button" class="legend-toggle" data-series="0" aria-pressed="true">
        <span class="swatch is-without" aria-hidden="true"></span>Sin aportes
      </button>
    </div>
    <div class="goal-slider">
      <label for="goal-range">Meta</label>
      <input id="goal-range" type="range" min="0" max="{steps - 1}" step="1" value="0" style="--fill: 0%" />
      <output id="goal-value" for="goal-range" class="num"></output>
    </div>
  </div>
  <div id="chart" class="chart" role="img" aria-label="Proyección del patrimonio con y sin aportes"></div>
</section>
"""


def _contracts_panel() -> str:
    segments = "".join(
        f'<button type="button" class="segment" data-tab="{tab}" aria-pressed="false">'
        f'<span class="segment-label">{label} <span class="num" data-count></span></span>'
        f'<span class="segment-value num" data-sum></span></button>'
        for tab, label in (("pending", "Pendientes"), ("paid", "Pagados"), ("all", "Total"))
    )
    return f"""<section class="panel contracts" aria-label="Contratos de factoring">
  <div class="segments" role="group" aria-label="Estado">{segments}</div>
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th scope="col" class="filter-cell">
            <span class="sr-only">Cliente</span>
            <input type="search" id="contract-filter" class="filter-input" placeholder="Cliente"
              aria-label="Filtrar por cliente o código" autocomplete="off" spellcheck="false" />
            <button type="button" id="clear-filter" class="clear-filter" aria-label="Limpiar filtro"
              hidden>&times;</button>
          </th>
          <th scope="col">Pago</th>
          <th scope="col" class="align-right">Ganancia (S/)</th>
        </tr>
      </thead>
      <tbody id="contract-rows"></tbody>
    </table>
  </div>
</section>
"""
