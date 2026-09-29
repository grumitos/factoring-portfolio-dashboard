"""Pruebas del generador. Cada una cubre un fallo que cambiaría una cifra del tablero o filtraría datos."""

import io
import json
import tempfile
import unittest
import urllib.error
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from dashboard import config, portfolio, projection, render, sources
from dashboard.portfolio import Earning, Investment, Movement, Portfolio

_MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'


def _write_xlsx(path: Path, shared_strings: str, rows: str) -> None:
    """XLSX mínimo como los del portal: textos compartidos y el estilo 1 con formato de fecha."""
    with zipfile.ZipFile(path, "w") as book:
        book.writestr("xl/sharedStrings.xml", f"<sst {_MAIN}>{shared_strings}</sst>")
        book.writestr("xl/styles.xml", f'<styleSheet {_MAIN}><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs>'
                                       "</styleSheet>")
        book.writestr("xl/worksheets/sheet1.xml", f"<worksheet {_MAIN}><sheetData>{rows}</sheetData></worksheet>")


class XlsxReaderTest(unittest.TestCase):
    def test_reads_export_cells(self):
        shared = "".join(f"<si><t>{s}</t></si>" for s in ("Fecha", "Código de subasta", "Monto", "Moneda"))
        shared += "<si><r><t>AB</t></r><r><t>C1</t></r></si>"  # texto enriquecido en dos tramos
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ganancia.xlsx"
            _write_xlsx(path, shared, (
                '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>'
                '<c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
                '<row r="2"><c r="A2" s="1"><v>45755.20833333333</v></c><c r="B2" t="s"><v>4</v></c>'
                '<c r="C2"><v>209.95</v></c><c r="D2" t="inlineStr"><is><t>PEN</t></is></c></row>'
                '<row r="3"><c r="A3" s="1"/></row>'
            ))
            rows = sources.read_xlsx(path)
        # Encabezado sin tilde, texto enriquecido unido, fecha serial con hora y fila vacía descartada
        expected = {"fecha": datetime(2025, 4, 8, 5, 0), "codigo de subasta": "ABC1", "monto": 209.95, "moneda": "PEN"}
        self.assertEqual(rows, [expected])


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

    def test_unknown_movement_type_fails_instead_of_being_ignored(self):
        with self.assertRaises(ValueError):
            portfolio.net_balances([_movement("bono", 10)])

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
    def test_goal_month_is_first_month_at_or_above_goal(self):
        for goal in config.GOAL_STEPS:
            month = projection.goal_month(280_000, 11.95, config.MONTHLY_INJECTION, goal)
            series = projection.monthly_balances(280_000, 11.95, config.MONTHLY_INJECTION, month)
            self.assertLess(series[month - 1], goal)
            self.assertGreaterEqual(series[month], goal)

    def test_injection_enters_mid_month(self):
        # Sin interés: 100 por mes, la meta de 250 se cruza a los 2.5 meses y el tablero lo muestra en el mes 3
        self.assertEqual(projection.months_to_goal(0, 0, 100, 250), 2.5)
        self.assertEqual(projection.goal_month(0, 0, 100, 250), 3)
        self.assertIsNone(projection.months_to_goal(1_000, 0, 0, 2_000))

    def test_rounds_halves_up_like_javascript(self):
        # round() de Python daría 38 y movería la fecha de la meta un mes
        self.assertEqual(projection.round_half_up(38.5), 39)

    def test_chart_ends_in_january_after_the_crossing(self):
        horizon = projection.chart_horizon(14, start_month=8)
        self.assertGreaterEqual(horizon, 14 + 6)
        self.assertEqual((8 + horizon) % 12, 0)


def _view(client="ACME PRIVADA S.A.C."):
    start = datetime(2025, 1, 10)
    data = Portfolio(
        investments=[Investment("Q1", client, start, datetime(2025, 3, 1), 5_000, "PEN", 1.5, "por cobrar", "A")],
        earnings=[],
        movements=[Movement("deposito", 5_000, "PEN", start)],
    )
    return render.build_view(data, 3.7, False, datetime(2025, 2, 1))


class RenderTest(unittest.TestCase):
    def test_public_page_has_no_private_data(self):
        page = render.render_page(None)
        self.assertNotIn("dashboard-data", page)
        self.assertNotIn("<script", page)
        self.assertIn("Datos privados", page)

    def test_private_page_embeds_data_without_breaking_out_of_the_script(self):
        page = render.render_page(_view(client="</script><script>alert(1)</script>"))
        payload = page.split('<script id="dashboard-data" type="application/json">')[1].split("</script>")[0]
        self.assertEqual(json.loads(payload)["contracts"][0]["client"], "</script><script>alert(1)</script>")

    def test_formats_match_the_browser(self):
        self.assertEqual(render.fixed(0.125), "0.13")  # half-up como Intl; format() daría 0.12
        self.assertEqual(render.pen(3852.14), "S/ 3,852.14")
        self.assertEqual(render.compact(1_200_000), "1.2M")
        self.assertEqual(render.compact(400_000), "400K")
        self.assertEqual(render.short_date(datetime(2025, 9, 7)), "7 set. 2025")
        self.assertEqual(render.month_label(2026, 8 + 14), "nov. 2027")


class FxTest(unittest.TestCase):
    @staticmethod
    def _response(body: bytes):
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(body)
        return response

    def test_live_rate(self):
        with mock.patch("urllib.request.urlopen", return_value=self._response(b'{"rates": {"PEN": "3.4399"}}')):
            self.assertEqual(sources.resolve_fx_rate("key"), (3.4399, False))

    def test_falls_back_on_missing_key_bad_payload_or_network_error(self):
        default = (config.DEFAULT_FX_RATE, True)
        self.assertEqual(sources.resolve_fx_rate(None), default)
        for body in (b"not json", b'{"rates": {}}', b'{"rates": {"PEN": "0"}}'):
            with mock.patch("urllib.request.urlopen", return_value=self._response(body)), mock.patch("sys.stderr"):
                self.assertEqual(sources.resolve_fx_rate("key"), default)
        error = urllib.error.URLError("sin red")
        with mock.patch("urllib.request.urlopen", side_effect=error), mock.patch("sys.stderr"):
            self.assertEqual(sources.resolve_fx_rate("key"), default)


if __name__ == "__main__":
    unittest.main()
