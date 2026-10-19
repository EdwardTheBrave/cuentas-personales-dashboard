# Cuentas Personales · dashboard

Dashboard de finanzas personales e inversiones construido a partir de un Google Sheet. Tiene dos paneles, y se pasa de uno a otro con un botón:

- **Finanzas**:
  - patrimonio neto mensual (total, por grupo y por cuenta);
  - saldo por cuenta agrupado;
  - zoom del mes, por cuenta, concepto y subcategoría, comparado con la media de los 3 meses anteriores;
  - evolutivos de ingresos y gastos;
  - matriz mensual;
  - filtros globales.
- **Inversiones**: capital vivo por activo, reparto por categoría, posiciones con P&L realizado, histórico del capital invertido y tabla de operaciones.

Todo se calcula en el navegador. Es un único fichero HTML y no tiene servidor ni base de datos.

## Dos formas de usarlo

### 1. Modo local, sin cuentas ni conectores

```bash
npm install
npm run build
open dist/dashboard.html
```

Arrastra a la página el `.xlsx` exportado de tu Sheet (en Google Sheets: *Archivo → Descargar → Microsoft Excel*). El fichero se lee en tu navegador y no se envía a ningún sitio.

Para probarlo sin datos propios, arrastra `sample/ejemplo-cuentas.xlsx`, que tiene datos inventados.

### 2. Con Claude, que lee tu Sheet en vivo

Cada vez que se abre, el dashboard descarga el Sheet con el conector **Google Drive** de claude.ai, usando tus credenciales.

1. Copia `config.example.js` como `config.local.js` y rellena `sheetId`: es el ID que aparece en la URL del Sheet, entre `/d/` y `/edit`.
2. Ejecuta `npm run build`.
3. Pide a Claude Code que publique `dist/artifact.html` como artifact con esta capacidad:
   ```json
   { "mcp": { "servers": [{ "server": "Google Drive", "tools": ["download_file_content"] }] }, "sample": {} }
   ```
4. Ten el conector Google Drive activo en claude.ai → Ajustes → Conectores. La primera vez, la página te pedirá permiso para usarlo.

### Preguntar a tus datos (solo con Claude)

En el modo Claude aparece el botón **Preguntar a tus datos**. Abre un panel donde puedes hacer preguntas en lenguaje natural, desde las sencillas («¿cuánto gasté en restaurantes en 2025?») hasta otras más elaboradas («con mi ritmo de ahorro histórico, ¿cómo ha afectado al patrimonio no tener ingresos desde agosto, sin contar la cuenta X?»).

- Usa la capacidad `sample` del artifact. Publícalo con `{"sample": {}}` además de `mcp`.
- Claude recibe un resumen mensual por cuenta y un juego de herramientas que calculan en la página (`src/agent.js`): flujos filtrados y agrupados, movimientos, saldos con exclusión de cuentas, traspasos, inversiones y una calculadora exacta. Las cifras salen de la misma lógica que los gráficos.
- Consume tu propio uso de Claude, con el modelo más capaz. Una pregunta compleja tarda entre 30 segundos y 2 minutos.
- En el modo local el botón no aparece.

## Formato del Google Sheet

El dashboard busca las hojas por su nombre y las columnas por el nombre de la cabecera, no por la letra de la columna ni por un rango fijo. Por eso las filas nuevas entran solas y el orden de las columnas da igual. Las filas vacías se ignoran.

**Expenses**: un movimiento por fila.

| Cabecera | Contenido |
|---|---|
| ID | Número de movimiento |
| Date | Fecha (dd/mm/aaaa o fecha de Sheets) |
| Year, Month | Año y mes (Ene … Dic). Solo se usan si falta la fecha |
| Concept | Texto libre |
| Account | Cuenta (Nómina, Gastos, Ahorro…) |
| Category | Incomes / Fixed / Variable |
| Subcategory | Restaurants, Supermarket, Housing… |
| Type | Income o Expense |
| raw_value_input | Importe total (informativo) |
| Value | **Tu parte** del importe; es la columna que se suma |

- Las filas con Year < 2000 (por ejemplo 1899) son los **saldos iniciales** de cada cuenta.
- Los importes deben ser positivos; el signo lo da Type. Si hay un negativo, se respeta tal cual.

**Internal Transfers**: `ID, Date, Year, Month, Origin Account, Destination Account, Value, Comments`. Mueven saldo entre cuentas y no cuentan como ingreso ni como gasto.

**Inversiones** (opcional): `ID, Date, Year, Month, Concept, Platform/Asset, Value, Investment Category, Action, P/L, Value (Inv. Account)`.

| Cabecera | Contenido |
|---|---|
| Action | Deposit (aportación) o Withdraw (retirada, venta, intereses) |
| P/L | Beneficio o pérdida realizada de la operación (NA si no aplica) |
| Value (Inv. Account) | Cambio en el capital invertido: `+importe` al aportar, `−coste` al cerrar, `0` en cobros de intereses |

- **Capital vivo** = suma de Value (Inv. Account) por activo. Es el coste de lo invertido, no su valor de mercado.
- **P&L realizado** = suma de P/L.

**Patrimonio neto** = saldos iniciales + ingresos − gastos ± traspasos, en valor contable.

## Configuración (`config.local.js`)

- `sheetId`: ID del Sheet. Si lo dejas vacío, el dashboard funciona en modo local.
- `title`: título de la página.
- `accountGroups`: grupos de cuentas para los saldos y la vista «Por grupo». Las cuentas sin grupo aparecen en «Otras cuentas».
- `investmentCategoryColors`: color fijo por categoría de inversión (opcional).

## Privacidad

El repositorio no contiene datos personales. Nunca se versionan:
- `config.local.js`, que guarda tu ID de Sheet y tus cuentas;
- hojas de cálculo fuera de `sample/`;
- `dist/`, porque el build lleva la configuración incrustada;
- ficheros `.env`.

Un hook de pre-commit revisa cada commit:

```bash
git config core.hooksPath .githooks   # una vez por clon
npm run check-secrets                 # revisión manual de todo lo versionado
```

Bloquea emails, IDs de Sheet, tokens y claves con formato conocido. También bloquea cualquier término que pongas en `.secret-terms`, un fichero local e ignorado por git con un término por línea: nombres de bancos, proyectos, personas…

## Desarrollo

```bash
npm test          # tests del modelo sobre el Excel de ejemplo
npm run sample    # regenera sample/ejemplo-cuentas.xlsx (datos inventados, semilla fija)
npm run build     # dist/dashboard.html (local) y dist/artifact.html (Claude)
```

- `src/model.js`: lectura de las hojas y cálculos.
- `src/agent.js`: resumen y herramientas del asistente «Preguntar a tus datos».
- `src/app.html`: interfaz, gráficos ([ECharts](https://echarts.apache.org)) y lectura de Excel ([SheetJS](https://sheetjs.com)), ambos desde cdnjs.
