"""Parámetros del portafolio y rutas del proyecto."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
WEB_DIR = ROOT / "web"
OUTPUT_FILE = ROOT / "dist" / "index.html"
ENV_FILE = ROOT / ".env"

# Exportes del portal, con el nombre con que se descargan (la moneda va en cada fila)
INVESTMENTS_FILE = "mis-inversiones.xlsx"
EARNINGS_FILES = ("ganancia.xlsx", "ganancia (1).xlsx")
MOVEMENTS_FILES = ("todos.xlsx", "todos (1).xlsx")

DEFAULT_FX_RATE = 3.7
FX_TIMEOUT_SECONDS = 2.5

# Capital mantenido fuera de la plataforma, sumado al saldo de cada moneda
EXTERNAL_CAPITAL = {"PEN": 121_000.0, "USD": 10_820.0}

MONTHLY_INJECTION = 5_700.0
GOAL = 400_000
GOAL_STEPS = tuple(range(GOAL, 2_000_001, 200_000))  # valores del deslizador de meta
MAX_HALF_STEPS = 5_000  # tope de la búsqueda de la meta (2 500 meses)

# Efecto de cada tipo de movimiento sobre el saldo de su moneda. "inversion" y "pago capital"
# solo mueven dinero entre saldo libre e invertido, así que no cambian el total.
MOVEMENT_SIGNS = {
    "PEN": {
        "deposito": 1, "interes ganado": 1, "dolares a soles": 1,
        "retiro": -1, "soles a dolares": -1,
        "inversion": 0, "pago capital": 0,
    },
    "USD": {
        "deposito": 1, "interes ganado": 1, "soles a dolares": 1,
        "retiro": -1, "dolares a soles": -1,
        "inversion": 0, "pago capital": 0,
    },
}
