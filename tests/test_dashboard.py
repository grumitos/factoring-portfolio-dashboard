"""Pruebas del generador con datos sintéticos. Cada una cubre un fallo que cambiaría una cifra o filtraría datos."""

import http.client
import io
import json
import tempfile
import unittest
import urllib.error
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from dashboard import __main__ as cli
from dashboard import config, portfolio, projection, render, sources
from dashboard.portfolio import Earning, Investment, Movement, Portfolio

_MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'


def _write_xlsx(path: Path, headers: list[str], rows: str = "", extra_strings: str = "") -> None:
    """XLSX mínimo como los del portal: textos compartidos (primero los encabezados) y el estilo 1 de fecha."""
    shared = "".join(f"<si><t>{h}</t></si>" for h in headers) + extra_strings
    header_row = "".join(f'<c r="{chr(65 + i)}1" t="s"><v>{i}</v></c>' for i in range(len(headers)))
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("xl/sharedStrings.xml", f"<sst {_MAIN}>{shared}</sst>")
        book.writestr("xl/styles.xml", f'<styleSheet {_MAIN}><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs>'
                                       "</styleSheet>")
        book.writestr("xl/worksheets/sheet1.xml",
                      f'<worksheet {_MAIN}><sheetData><row r="1">{header_row}</row>{rows}</sheetData></worksheet>')


class SourcesTest(unittest.TestCase):
    def test_reads_export_cells(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ganancia.xlsx"
            _write_xlsx(path, ["Fecha", "Código de subasta", "Monto", "Moneda"], (
                '<row r="2"><c r="A2" s="1"><v>45000.5</v></c><c r="B2" t="s"><v>4</v></c>'
                '<c><v>100.25</v></c><c t="inlineStr"><is><t>PEN</t></is></c></row>'  # celdas sin referencia
                '<row r="3"><c r="A3" s="1"/></row>'
            ), extra_strings="<si><r><t>AB</t></r><r><t>C1</t></r></si>")  # texto enriquecido en dos tramos
            rows = sources.read_xlsx(path)
        # Encabezado sin tilde, fecha serial con hora, texto unido, columnas por posición y fila vacía descartada
        expected = {"fecha": datetime(2023, 3, 15, 12), "codigo de subasta": "ABC1", "monto": 100.25, "moneda": "PEN"}
        self.assertEqual(rows, [expected])

    def test_rejects_a_pair_of_exports_in_the_same_currency(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            _write_xlsx(data / config.INVESTMENTS_FILE, ["Fecha"])
            for name in config.MOVEMENTS_FILES:
                _write_xlsx(data / name, ["Fecha"])
            for name in config.EARNINGS_FILES:  # la misma descarga dos veces
                _write_xlsx(data / name, ["Moneda"], '<row r="2"><c r="A2" t="inlineStr"><is><t>PEN</t></is></c></row>')
            with self.assertRaisesRegex(ValueError, "PEN"):
                sources.load_exports(data)

    @staticmethod
    def _response(body: bytes):
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(body)
        return response

    def test_live_fx_rate(self):
        with mock.patch("urllib.request.urlopen", return_value=self._response(b'{"rates": {"PEN": "3.45"}}')):
            self.assertEqual(sources.resolve_fx_rate("key"), (3.45, False))

    def test_fx_falls_back_on_missing_key_bad_payload_or_network_error(self):
        default = (config.DEFAULT_FX_RATE, True)
        self.assertEqual(sources.resolve_fx_rate(None), default)
        failures = [{"return_value": self._response(body)} for body in (b"not json", b'{"rates": {}}',
                                                                         b'{"rates": {"PEN": "0"}}')]
        failures += [{"side_effect": urllib.error.URLError("sin red")},
                     {"side_effect": http.client.IncompleteRead(b"")}]
        for failure in failures:
            with mock.patch("urllib.request.urlopen", **failure), mock.patch("sys.stderr"):
                self.assertEqual(sources.resolve_fx_rate("key"), default)


def _movement(kind, amount, currency="PEN"):
    return Movement(kind, amount, currency, datetime(2025, 1, 1))


class PortfolioTest(unittest.TestCase):
    def test_net_balances_apply_each_movement_type(self):
        movements = [
            _movement("deposito", 1_000), _movement("interes ganado", 50), _movement("dolares a soles", 370),
            _movement("retiro", 200), _movement("soles a dolares", 100),
            _movement("inversion", 900), _movement("pago capital", 900),  # solo mueven entre libre e invertido
            _movement("deposito", 300, "USD"), _movement("dolares a soles", 100, "USD"),
            _movement("soles a dolares", 27, "USD"),
        ]
        net = portfolio.net_balances(movements)
        self.assertAlmostEqual(net["PEN"], config.EXTERNAL_CAPITAL["PEN"] + 1_000 + 50 + 370 - 200 - 100)
        self.assertAlmostEqual(net["USD"], config.EXTERNAL_CAPITAL["USD"] + 300 - 100 + 27)

    def test_unknown_movement_type_or_status_fails_instead_of_being_ignored(self):
        with self.assertRaises(ValueError):
            portfolio.net_balances([_movement("bono", 10)])
        row = dict(_RAW["investments"][0], estado="anulado")
        with self.assertRaisesRegex(ValueError, "anulado"):
            portfolio.parse_exports({"investments": [row], "earnings": [], "movements": []})

    def test_annualized_rate_weights_by_principal(self):
        start = datetime(2025, 1, 1)
        year = start + timedelta(days=portfolio.DAYS_PER_MONTH * 12)
        data = Portfolio(
            investments=[
                # Cobrado: 60 sobre 1 000 en exactamente 12 meses -> 6%; lo cobrado pisa el 5% mensual pactado
                Investment("A", "", start, start + timedelta(days=30), 1_000, "PEN", 5, "cobrado", "A"),
                # Pendiente en USD: 1% mensual compuesto -> 1.01^12 - 1, sobre 100 × 3.5 = 350 PEN
                Investment("B", "", start, start + timedelta(days=61), 100, "USD", 1, "por cobrar", "B"),
                # Rechazado: no pesa
                Investment("C", "", start, year, 1_000_000, "PEN", 9, "rechazado", "C"),
            ],
            earnings=[Earning("A", 20, start + timedelta(days=100), "PEN"), Earning("A", 40, year, "PEN")],
            movements=[],
        )
        expected = (1_000 * 0.06 + 350 * (1.01**12 - 1)) / 1_350 * 100
        self.assertAlmostEqual(portfolio.annualized_rate(data, fx_rate=3.5), expected, places=9)

    def test_last_month_window_and_currencies(self):
        now = datetime(2025, 3, 31, 12)  # un mes antes: 28 feb 12:00 (no 3 de marzo)
        earnings = [
            Earning("x", 1, datetime(2025, 2, 28, 11, 59), "PEN"),
            Earning("x", 10, datetime(2025, 2, 28, 12, 0), "PEN"),
            Earning("x", 100, datetime(2025, 3, 31, 12, 1), "PEN"),
            Earning("x", 5, datetime(2025, 3, 15), "USD"),
        ]
        self.assertEqual(portfolio.last_month_gains(earnings, now), {"PEN": 10, "USD": 5})

    def test_add_months_clamps_to_month_end(self):
        self.assertEqual(portfolio.add_months(datetime(2024, 3, 31, 9), -1), datetime(2024, 2, 29, 9))
        self.assertEqual(portfolio.add_months(datetime(2025, 1, 31), 13), datetime(2026, 2, 28))


class ProjectionTest(unittest.TestCase):
    # Valores esperados de la fórmula cerrada: cada aporte entra a mitad de mes y crece (m - j - 0.5) meses
    def test_compounds_the_annual_rate_monthly(self):
        self.assertAlmostEqual(projection.monthly_balances(1_000, 12, 0, 12)[12], 1_120, places=6)

    def test_goal_month_with_mid_month_injections(self):
        self.assertEqual(projection.months_to_goal(10_000, 12, 1_000, 25_000), 12.5)
        self.assertEqual(projection.goal_month(10_000, 12, 1_000, 25_000), 13)
        self.assertAlmostEqual(projection.monthly_balances(10_000, 12, 1_000, 13)[13], 25_137.93190691546, places=6)
        self.assertIsNone(projection.months_to_goal(1_000, 0, 0, 2_000))

    def test_rounds_halves_up_like_javascript(self):
        # round() de Python daría 38 y movería la fecha de la meta un mes
        self.assertEqual(projection.round_half_up(38.5), 39)

    def test_chart_range(self):
        horizon = projection.chart_horizon(14, start_month=8)
        self.assertGreaterEqual(horizon, 14 + 6)
        self.assertEqual((8 + horizon) % 12, 0)  # termina en enero
        # Sin aportes la meta llega en el mes 201, fuera del gráfico: no se marca
        chart = projection.goal_projection(300_000, 12, 5_700, 2_000_000, start_month=0)
        self.assertEqual(projection.months_to_goal(300_000, 12, 0, 2_000_000), 201)
        self.assertEqual(chart["crossings"], [None, 113])
        self.assertEqual(projection.nice_ticks(100_000, 1_000_000), [0, *range(200_000, 1_200_001, 200_000)])


# Exportes sintéticos ya leídos (como los devuelve sources.load_exports)
_RAW = {
    "investments": [
        {"codigo de subasta": "A1", "cliente": "ALFA S.A.C.", "fecha": "2025-01-01", "hora": "09:00:00",
         "fecha de pago": datetime(2025, 3, 1), "inversion": 1_000.0, "moneda": "PEN",
         "retorno mensual (%)": 2.0, "estado": "cobrado", "riesgo": "A"},
        {"codigo de subasta": "B1", "cliente": "BETA S.A.", "fecha": "2025-02-01", "hora": "10:00:00",
         "fecha de pago": datetime(2025, 4, 15), "inversion": 500.0, "moneda": "USD",
         "retorno mensual (%)": 1.5, "estado": "por cobrar", "riesgo": "B"},
        {"codigo de subasta": "D1", "cliente": "DELTA", "fecha": "2025-01-15", "hora": "08:00:00",
         "fecha de pago": datetime(2025, 3, 1), "inversion": 300.0, "moneda": "PEN",
         "retorno mensual (%)": 1.0, "estado": "pendiente", "riesgo": "C"},
        {"codigo de subasta": "R1", "cliente": "RHO", "fecha": "2025-01-10", "hora": "08:00:00",
         "fecha de pago": datetime(2025, 2, 10), "inversion": 9_000.0, "moneda": "PEN",
         "retorno mensual (%)": 5.0, "estado": "rechazado", "riesgo": "A"},
    ],
    "earnings": [{"codigo de subasta": "A1", "monto": 60.0, "fecha": datetime(2025, 3, 2, 12), "moneda": "PEN"}],
    "movements": [
        {"movimiento": "deposito", "monto": 5_000.0, "moneda": "PEN", "fecha": datetime(2025, 3, 10, 18)},
        {"movimiento": "deposito", "monto": 100.0, "moneda": "USD", "fecha": datetime(2025, 3, 5)},
    ],
}


def _view(raw=_RAW):
    return render.build_view(portfolio.parse_exports(raw), 3.5, False, datetime(2025, 3, 20))


class ViewTest(unittest.TestCase):
    def test_view_from_exports(self):
        view = _view()
        self.assertEqual((view["fx"], view["as_of"]), ("USD/PEN 3.500", "10 mar. 2025"))
        pen, usd, rate, goal = view["kpis"]
        self.assertEqual((pen["value"], pen["note_value"], pen["positive"]), ("126,000.00", "+60.00", True))
        self.assertEqual((usd["value"], usd["note_value"]), ("10,920.00", "0.00"))
        annual = portfolio.annualized_rate(portfolio.parse_exports(_RAW), 3.5)
        start = 126_000 + 10_920 * 3.5
        self.assertEqual(rate["note_value"], f"≈ {render.pen(start * ((1 + annual / 100) ** (1 / 12) - 1), 0)} / mes")
        self.assertEqual((goal["label"], goal["value"]), ("Meta S/ 400K", render.percent(start / 400_000 * 100)))

        contracts = {c["code"]: c for c in view["data"]["contracts"]}
        self.assertEqual(list(contracts), ["A1", "B1", "D1"])  # sin el rechazado
        self.assertEqual((contracts["A1"]["paid"], contracts["A1"]["gain"], contracts["A1"]["days"]), (True, 60, None))
        months = (datetime(2025, 4, 15) - datetime(2025, 2, 1, 10)).total_seconds() / 86_400 / portfolio.DAYS_PER_MONTH
        self.assertAlmostEqual(contracts["B1"]["gain"], 500 * 3.5 * (1.015**months - 1), places=9)  # con la hora
        self.assertEqual((contracts["B1"]["days"], contracts["B1"]["overdue"]), ("+36 d", False))
        self.assertEqual((contracts["D1"]["days"], contracts["D1"]["overdue"], contracts["D1"]["riskTone"]),
                         ("−9 d", True, "c"))

    def test_goal_already_reached(self):
        raw = dict(_RAW, movements=[{"movimiento": "deposito", "monto": 400_000.0, "moneda": "PEN",
                                     "fecha": datetime(2025, 3, 10)}])
        step = _view(raw)["data"]["steps"][0]
        self.assertEqual((step["date"], step["crossings"]), ("Alcanzada", [0, 0]))


class RenderTest(unittest.TestCase):
    def test_private_page_embeds_data_without_breaking_out_of_the_script(self):
        raw = dict(_RAW, investments=[dict(_RAW["investments"][0], cliente="<!--<script></script>")])
        page = render.render_page(_view(raw))
        start = page.index('<script id="dashboard-data" type="application/json">')
        payload = page[start:].split(">", 1)[1].split("</script>", 1)[0]
        self.assertNotIn("<", payload)
        self.assertEqual(json.loads(payload)["contracts"][0]["client"], "<!--<script></script>")

    def test_formats_match_the_browser(self):
        self.assertEqual(render.fixed(0.125), "0.13")  # half-up como Intl; format() daría 0.12
        self.assertEqual(render.pen(3852.14), "S/ 3,852.14")
        self.assertEqual([render.compact(v) for v in (400_000, 1_200_000, 1_250_000, 2_000_000)],
                         ["400K", "1.2M", "1.25M", "2M"])
        self.assertEqual(render.short_date(datetime(2024, 9, 3)), "3 set. 2024")
        self.assertEqual(render.month_label(2024, 13), "feb. 2025")


class CliTest(unittest.TestCase):
    def test_public_page_never_reads_the_exports(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(config, "OUTPUT_FILE", Path(tmp) / "index.html"), \
                mock.patch.object(config, "PUBLIC_OUTPUT_FILE", Path(tmp) / "public" / "index.html"), \
                mock.patch("dashboard.sources.load_exports") as load_exports, mock.patch("sys.stdout"):
            self.assertEqual(cli.main(["--public"]), 0)
            page = (Path(tmp) / "public" / "index.html").read_text(encoding="utf-8")
            self.assertFalse((Path(tmp) / "index.html").exists())
        load_exports.assert_not_called()
        self.assertNotIn("<script", page)
        self.assertNotIn("400K", page)

    def test_rejects_an_invalid_exchange_rate(self):
        for value in ("0", "-1", "nan", "inf"):
            with self.assertRaises(SystemExit), mock.patch("sys.stderr"):
                cli.main(["--fx", value])


if __name__ == "__main__":
    unittest.main()
