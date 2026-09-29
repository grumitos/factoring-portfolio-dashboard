"""Genera el tablero a partir de los exportes en data/.

    python -m dashboard            dist/index.html, con los datos
    python -m dashboard --public   dist/public/index.html, sin cifras ni contratos (apto para publicar)
"""

import argparse
import math
import os
import sys
import webbrowser
import zipfile
from datetime import datetime

from . import config, render, sources
from .portfolio import parse_exports

API_KEY = "CURRENCY_FREAKS_API_KEY"


def _fx_rate(text: str) -> float:
    rate = float(text)
    if not math.isfinite(rate) or rate <= 0:
        raise argparse.ArgumentTypeError(f"debe ser un número positivo: {text}")
    return rate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m dashboard", description="Genera el tablero del portafolio.")
    parser.add_argument("--public", action="store_true", help="omite cifras y contratos (dist/public/)")
    parser.add_argument("--open", action="store_true", help="abre el tablero en el navegador")
    parser.add_argument("--fx", type=_fx_rate, metavar="TASA",
                        help="tipo de cambio USD/PEN fijo (no consulta el servicio)")
    args = parser.parse_args(argv)

    output = config.PUBLIC_OUTPUT_FILE if args.public else config.OUTPUT_FILE
    try:
        view = None
        if not args.public:
            data = parse_exports(sources.load_exports())
            if args.fx is not None:
                fx_rate, fx_fallback = args.fx, False
            else:
                api_key = os.environ.get(API_KEY) or sources.read_env().get(API_KEY)
                fx_rate, fx_fallback = sources.resolve_fx_rate(api_key)
            view = render.build_view(data, fx_rate, fx_fallback, datetime.now())
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render.render_page(view), encoding="utf-8")
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    print(f"Tablero generado: {output}")
    if args.open:
        webbrowser.open(output.as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
