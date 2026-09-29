# Portafolio de factoring

CLI local en Python para generar el tablero estático de un portafolio de factoring a partir de sus
exportes XLSX.

Lee los exportes del portal, calcula saldos, tasa anual y la proyección hacia una meta, y genera
una sola página, `dist/index.html`, que se abre directamente en el navegador.

## Requisitos

- Windows con Python 3.11 o superior en el `PATH` (el código no depende del sistema operativo,
  pero el lanzador incluido es para Windows).
- Sin dependencias externas: solo la biblioteca estándar de Python.
- Opcional: una clave de [Currency Freaks](https://currencyfreaks.com/) para el tipo de cambio
  USD/PEN en vivo. Sin ella, o si el servicio falla, se usa 3.70 y el tablero lo marca como `ref.`

## Instalación y uso

Ejecuta `run.bat` (con doble clic o desde una terminal). La primera vez crea `.env` a partir de
`.env.example` y la carpeta `data`, y se detiene. Después:

1. Completa en `.env` tu capital fuera de la plataforma en cada moneda, tu aporte mensual y tu
   meta.
2. Copia en `data` los cinco exportes del portal, con el nombre con que se descargan:
   `mis-inversiones.xlsx`, `ganancia.xlsx`, `ganancia (1).xlsx`, `todos.xlsx` y `todos (1).xlsx`.
3. Vuelve a ejecutar `run.bat`: genera el tablero y lo abre en el navegador.

Sin el lanzador:

```bat
copy .env.example .env
python -m dashboard --open
```

`run.bat` acepta las mismas opciones que `python -m dashboard` (y siempre añade `--open`):

| Opción | Efecto |
| --- | --- |
| `--open` | abre el tablero al terminar |
| `--fx 3.45` | fija el tipo de cambio sin consultar el servicio |
| `--public` | genera `dist/public/index.html`, sin cifras ni contratos, apta para publicar |

El programa termina con código de salida 1 si algo falla (falta un exporte o un valor de `.env`,
o los datos no cuadran; ver más abajo), y con 0 si el tablero se generó.

## Qué muestra

- **Capital PEN / USD**: saldo de cada moneda en el portal más el capital externo. "Último mes"
  suma lo cobrado desde hace un mes calendario.
- **Tasa anual**: tasa efectiva promedio ponderada por capital. Si un contrato ya se cobró, usa lo
  cobrado; si no, lo pactado. Excluye los rechazados.
- **Meta**: avance del patrimonio total en soles y mes estimado para alcanzarla, aportando cada
  mes. El deslizador cambia la meta del gráfico y de esta cifra, en pasos de S/ 200K.
- **Contratos**: pendientes, pagados y total con su suma. Los días relativos (`+11 d`, `−88 d`) se
  miden contra la fecha de corte, que es el último registro de los exportes.

Si un exporte trae un estado o un tipo de movimiento que el tablero no conoce, si se descarga dos
veces el mismo archivo de una moneda o si falta un valor en `.env`, el generador se detiene con un
mensaje en vez de mostrar cifras incorrectas.

## Privacidad

Los exportes (`data/`), el tablero generado (`dist/`) y `.env` contienen datos privados,
permanecen en local y están fuera de Git. Para publicar, usa solo `dist/public/`, que genera
`--public`; ese modo no lee los exportes ni `.env`.

## Pruebas

Las pruebas usan `unittest` con exportes sintéticos generados en memoria: no leen `data/` ni
`.env` y no consultan el servicio de tipo de cambio.

```bat
python -m unittest
```

## Estructura

```text
dashboard/          paquete de la aplicación
  __main__.py       CLI: lee .env y los exportes, y escribe la página
  config.py         rutas, parámetros del tablero y lectura de los valores de .env
  sources.py        lectura de los XLSX y de .env, y tipo de cambio en vivo
  portfolio.py      modelo del portafolio y sus métricas
  projection.py     proyección del patrimonio hacia la meta
  render.py         arma la página: textos formateados, datos y plantilla
web/                plantilla, estilos y script del navegador (se incrustan en la página)
tests/              pruebas: python -m unittest
.env.example        plantilla de .env
run.bat             lanzador para Windows: crea .env y data la primera vez
```

## Licencia

[MIT](LICENSE).
