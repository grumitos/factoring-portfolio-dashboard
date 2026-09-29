"""Rutas del proyecto y parámetros del tablero. Los personales se leen de .env (ver .env.example)."""

import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
WEB_DIR = ROOT / "web"
OUTPUT_FILE = ROOT / "dist" / "index.html"
PUBLIC_OUTPUT_FILE = ROOT / "dist" / "public" / "index.html"  # aparte: generar el privado no la pisa
ENV_FILE = ROOT / ".env"

# Exportes del portal, con el nombre con que se descargan (la moneda va en cada fila)
INVESTMENTS_FILE = "mis-inversiones.xlsx"
EARNINGS_FILES = ("ganancia.xlsx", "ganancia (1).xlsx")
MOVEMENTS_FILES = ("todos.xlsx", "todos (1).xlsx")

DEFAULT_FX_RATE = 3.7
FX_TIMEOUT_SECONDS = 2.5

GOAL_STEP = 200_000  # el deslizador ofrece la meta y 8 pasos de S/ 200K por encima
GOAL_STEP_COUNT = 9
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


@dataclass(frozen=True)
class Settings:
    """Parámetros personales: capital fuera de la plataforma (por moneda), aporte mensual y meta (en soles)."""

    external_capital: dict[str, float]
    monthly_injection: float
    goal: float

    @property
    def goal_steps(self) -> tuple[float, ...]:
        """Valores del deslizador de meta."""
        return tuple(self.goal + GOAL_STEP * i for i in range(GOAL_STEP_COUNT))

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "Settings":
        """Lee los parámetros de `env`. No hay valores por omisión: un capital en 0 por olvido descuadraría los
        saldos sin avisar."""
        goal = _env_number(env, "GOAL_PEN")
        if goal <= 0:  # el avance hacia la meta se divide por ella
            raise ValueError("GOAL_PEN debe ser mayor que 0")
        capital = {currency: _env_number(env, f"EXTERNAL_CAPITAL_{currency}") for currency in MOVEMENT_SIGNS}
        return cls(capital, monthly_injection=_env_number(env, "MONTHLY_INJECTION_PEN"), goal=goal)


def _env_number(env: Mapping[str, str], key: str) -> float:
    try:
        value = float(env.get(key, ""))
    except ValueError:
        raise ValueError(f"{key}: falta en .env o no es un número (ver .env.example)") from None
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{key} debe ser un número mayor o igual que 0")
    return value
