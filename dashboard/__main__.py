"""Genera dist/index.html a partir de los exportes en data/.

    python -m dashboard            tablero con los datos
    python -m dashboard --public   sin cifras ni contratos, apto para publicar
"""

import argparse
import os
import sys
import webbrowser
import zipfile
from datetime import datetime

from . import config, render, sources
from .portfolio import parse_exports


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m dashboard", description="Genera el tablero del portafolio.")
    parser.add_argument("--public", action="store_true", help="omite cifras y contratos")
    parser.add_argument("--open", action="store_true", help="abre el tablero en el navegador")
    parser.add_argument("--fx", type=float, metavar="TASA",
                        help="tipo de cambio USD/PEN fijo (no consulta el servicio)")
    args = parser.parse_args(argv)

    view = None
    if not args.public:
        try:
            data = parse_exports(sources.load_exports())
        except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
            print(f"Error: {error}", file=sys.stderr)
            return 1
        if args.fx:
            fx_rate, fx_fallback = args.fx, False
        else:
            api_key = os.environ.get("CURRENCY_FREAKS_API_KEY") or sources.read_env().get("CURRENCY_FREAKS_API_KEY")
            fx_rate, fx_fallback = sources.resolve_fx_rate(api_key)
        view = render.build_view(data, fx_rate, fx_fallback, datetime.now())

    config.OUTPUT_FILE.parent.mkdir(exist_ok=True)
    config.OUTPUT_FILE.write_text(render.render_page(view), encoding="utf-8")
    print(f"Tablero generado: {config.OUTPUT_FILE}")
    if args.open:
        webbrowser.open(config.OUTPUT_FILE.as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
