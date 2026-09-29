# Portafolio de factoring

Tablero de un portafolio de inversiones en factoring. Lee los exportes XLSX del portal, calcula saldos, tasa anual y la proyección hacia una meta, y genera una sola página, `dist/index.html`, que se abre directamente en el navegador.

> Proyecto archivado: no recibirá más cambios.

## Requisitos

Python 3.11 o superior. No usa dependencias externas.

## Uso

1. Copia los cinco exportes del portal en `data/`, con el nombre con que se descargan:
   `mis-inversiones.xlsx`, `ganancia.xlsx`, `ganancia (1).xlsx`, `todos.xlsx` y `todos (1).xlsx`.
2. Copia `.env.example` como `.env` y completa tu capital fuera de la plataforma en cada moneda, tu aporte mensual y tu meta.
   La clave de Currency Freaks es opcional: sin ella, o si el servicio falla, se usa 3.70 y el tablero lo marca como `ref.`
3. Ejecuta `python -m dashboard --open`. En Windows basta con abrir `run.bat`.

| Opción | Efecto |
| --- | --- |
| `--open` | abre el tablero al terminar |
| `--fx 3.45` | fija el tipo de cambio sin consultar el servicio |
| `--public` | genera `dist/public/index.html`, sin cifras ni contratos, apta para publicar |

## Qué muestra

- **Capital PEN / USD**: saldo de cada moneda en el portal más el capital externo. "Último mes" suma lo cobrado desde hace un mes calendario.
- **Tasa anual**: tasa efectiva promedio ponderada por capital. Si un contrato ya se cobró, usa lo cobrado; si no, lo pactado. Excluye los rechazados.
- **Meta**: avance del patrimonio total en soles y mes estimado para alcanzarla, aportando cada mes. El deslizador cambia la meta del gráfico y de esta cifra, en pasos de S/ 200K.
- **Contratos**: pendientes, pagados y total con su suma. Los días relativos (`+11 d`, `−88 d`) se miden contra la fecha de corte, que es el último registro de los exportes.

## Privacidad

Los exportes (`data/`), el tablero generado (`dist/`) y `.env` contienen datos privados y están fuera de git. Para publicar, usa solo `dist/public/`, que genera `--public`; ese modo no lee los exportes ni `.env`.

Si un exporte trae un estado o un tipo de movimiento que el tablero no conoce, si se descarga dos veces el mismo archivo de una moneda o si falta un valor en `.env`, el generador se detiene con un mensaje en vez de mostrar cifras incorrectas.

## Estructura

```text
dashboard/     generador: lectura de XLSX, métricas, proyección y HTML
web/           plantilla, estilos y script del navegador (se incrustan en la página)
tests/         pruebas: python -m unittest
.env.example   plantilla de .env
run.bat        atajo de Windows
```
