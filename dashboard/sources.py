"""Entradas del tablero: exportes XLSX, archivo .env y tipo de cambio en vivo."""

import http.client
import json
import math
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree

from . import config

_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
_EXCEL_EPOCH = datetime(1899, 12, 30)
_BUILTIN_DATE_FORMATS = set(range(14, 23)) | {45, 46, 47}


def normalize(text: object) -> str:
    """Minúsculas sin tildes: 'Código de subasta' -> 'codigo de subasta'. Igual que `fold` en web/app.js."""
    decomposed = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).strip().lower()


def read_xlsx(path: Path) -> list[dict[str, object]]:
    """Lee la primera hoja como filas {encabezado normalizado: valor}. Las fechas vuelven como datetime."""
    with zipfile.ZipFile(path) as book:
        names = set(book.namelist())
        shared = _shared_strings(book) if "xl/sharedStrings.xml" in names else []
        date_styles = _date_styles(book) if "xl/styles.xml" in names else set()
        sheet = ElementTree.fromstring(book.read("xl/worksheets/sheet1.xml"))

    rows = []
    for row in sheet.iterfind("m:sheetData/m:row", _NS):
        cells, column = {}, -1
        for cell in row.iterfind("m:c", _NS):
            # La referencia (A1, B1...) es opcional en el formato: sin ella, la celda sigue a la anterior
            ref = re.match(r"[A-Z]+", cell.get("r", ""))
            column = _column_index(ref.group()) if ref else column + 1
            cells[column] = _cell_value(cell, shared, date_styles, path)
        rows.append(cells)
    if not rows:
        raise ValueError(f"{path.name}: la hoja está vacía")

    header, *data = rows
    columns = {column: normalize(name) for column, name in header.items()}
    filled = [row for row in data if any(value not in (None, "") for value in row.values())]
    return [{columns[c]: v for c, v in row.items() if c in columns} for row in filled]


def _column_index(letters: str) -> int:
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - ord("A") + 1
    return index - 1


def _shared_strings(book: zipfile.ZipFile) -> list[str]:
    root = ElementTree.fromstring(book.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in item.iterfind(".//m:t", _NS)) for item in root.iterfind("m:si", _NS)]


def _date_styles(book: zipfile.ZipFile) -> set[str]:
    """Índices de estilo cuyo formato numérico es de fecha u hora."""
    root = ElementTree.fromstring(book.read("xl/styles.xml"))
    custom = {
        fmt.get("numFmtId"): re.sub(r'"[^"]*"|\[[^\]]*\]', "", fmt.get("formatCode", "")).lower()
        for fmt in root.iterfind("m:numFmts/m:numFmt", _NS)
    }
    styles = set()
    for index, xf in enumerate(root.iterfind("m:cellXfs/m:xf", _NS)):
        fmt_id = xf.get("numFmtId", "0")
        if int(fmt_id) in _BUILTIN_DATE_FORMATS or re.search(r"[dmyhs]", custom.get(fmt_id, "")):
            styles.add(str(index))
    return styles


def _cell_value(cell: ElementTree.Element, shared: list[str], date_styles: set[str], path: Path) -> object:
    kind = cell.get("t", "n")
    if kind == "inlineStr":
        return "".join(t.text or "" for t in cell.iterfind(".//m:t", _NS))
    raw = cell.findtext("m:v", namespaces=_NS)
    if raw is None:
        return None
    if kind == "s":
        return shared[int(raw)]
    if kind == "str":
        return raw
    if kind == "b":
        return raw == "1"
    if kind == "d":
        return datetime.fromisoformat(raw)
    if kind == "n":
        number = float(raw)
        return _EXCEL_EPOCH + timedelta(days=number) if cell.get("s") in date_styles else number
    raise ValueError(f"{path.name}: tipo de celda no soportado {kind!r} en {cell.get('r')}")


def load_exports(data_dir: Path = config.DATA_DIR) -> dict[str, list[dict[str, object]]]:
    """Filas crudas de los cinco exportes del portal."""
    groups = {
        "investments": (config.INVESTMENTS_FILE,),
        "earnings": config.EARNINGS_FILES,
        "movements": config.MOVEMENTS_FILES,
    }
    missing = [name for files in groups.values() for name in files if not (data_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Faltan exportes en {data_dir}: {', '.join(missing)}")

    exports = {}
    for group, files in groups.items():
        per_file = {name: read_xlsx(data_dir / name) for name in files}
        if len(per_file) > 1:
            _check_one_currency_per_file(per_file)
        exports[group] = [row for rows in per_file.values() for row in rows]
    return exports


def _check_one_currency_per_file(per_file: dict[str, list[dict]]) -> None:
    """Los pares ganancia/todos traen una moneda por archivo: descargar dos veces la misma duplicaría montos."""
    seen: dict[str, str] = {}
    for name, rows in per_file.items():
        for currency in {normalize(row.get("moneda")).upper() for row in rows} - {""}:
            if currency in seen:
                raise ValueError(f"'{seen[currency]}' y '{name}' traen movimientos en {currency}: "
                                 "cada exporte del par debe ser de una moneda distinta")
            seen[currency] = name


def read_env(path: Path = config.ENV_FILE) -> dict[str, str]:
    """Pares CLAVE=valor de un archivo .env (sin comillas); vacío si no existe."""
    if not path.is_file():
        return {}
    values = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():  # -sig: tolera el BOM del Bloc de notas
        key, sep, value = line.strip().partition("=")
        if sep and key and not key.startswith("#"):
            values[key.strip()] = value.strip().strip("\"'")
    return values


def fetch_fx_rate(api_key: str) -> float:
    """Tasa USD/PEN de Currency Freaks."""
    query = urllib.parse.urlencode({"apikey": api_key, "symbols": "PEN", "base": "USD"})
    url = f"https://api.currencyfreaks.com/v2.0/rates/latest?{query}"
    with urllib.request.urlopen(url, timeout=config.FX_TIMEOUT_SECONDS) as response:
        rate = float(json.load(response)["rates"]["PEN"])
    if not math.isfinite(rate) or rate <= 0:
        raise ValueError(f"tasa inválida: {rate}")
    return rate


def resolve_fx_rate(api_key: str | None) -> tuple[float, bool]:
    """(tasa, es_respaldo). Sin clave o ante cualquier fallo del servicio usa DEFAULT_FX_RATE."""
    if not api_key:
        return config.DEFAULT_FX_RATE, True
    try:
        return fetch_fx_rate(api_key), False
    except (OSError, http.client.HTTPException, ValueError, KeyError, TypeError) as error:
        print(f"[fx] Usando la tasa por defecto ({config.DEFAULT_FX_RATE}): {error}", file=sys.stderr)
        return config.DEFAULT_FX_RATE, True
