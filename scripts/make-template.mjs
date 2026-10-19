// Genera sample/plantilla-cuentas.xlsx: la hoja vacía para empezar, con la estructura de partida en
// Validations (editable) y unas pocas filas de ejemplo en cada hoja para ver el formato.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
const now = new Date();
const Y = now.getFullYear(), MM = now.getMonth() + 1;
const MON = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'][MM - 1];

const instrucciones = [
  ['Cómo usar esta plantilla'],
  [''],
  ['1. Validations: escribe tus cuentas (columna Account) y, si quieres, el grupo de cada una (Group).'],
  ['   Escribe también tus subcategorías y a qué categoría pertenecen. Borra o añade filas libremente.'],
  ['2. Expenses: una fila por ingreso o gasto. Type = Income o Expense. Value = tu parte del importe (en positivo).'],
  ['   Las filas con Year 1899 son el saldo inicial de cada cuenta: pon ahí lo que tenía cada cuenta al empezar.'],
  ['3. Internal Transfers: cuando mueves dinero entre tus propias cuentas (no es ingreso ni gasto).'],
  ['4. Inversiones (opcional): Action = Deposit al aportar, Withdraw al retirar o cobrar intereses.'],
  ['   Value (Inv. Account) = +importe al aportar, −coste al cerrar la inversión, 0 si solo cobras intereses.'],
  [''],
  ['Borra las filas de ejemplo cuando empieces con tus datos. No cambies los nombres de las cabeceras.'],
  ['Para verlo en el dashboard: Archivo → Descargar → Microsoft Excel (.xlsx) y arrástralo a la página.']
];
const exp = [
  ['ID', 'Date', 'Year', 'Month', 'Concept', 'Account', 'Category', 'Subcategory', 'Type', 'raw_value_input', 'Value'],
  [1, null, 1899, 'Dic', 'Saldo inicial Cuenta corriente', 'Cuenta corriente', 'Incomes', 'Additional Income', 'Income', 1500, 1500],
  [2, null, 1899, 'Dic', 'Saldo inicial Ahorro', 'Ahorro', 'Incomes', 'Additional Income', 'Income', 5000, 5000],
  [3, serial(Y, MM, 1), Y, MON, 'Nómina', 'Cuenta corriente', 'Incomes', 'Salary', 'Income', 2000, 2000],
  [4, serial(Y, MM, 1), Y, MON, 'Supermercado', 'Cuenta corriente', 'Variable', 'Supermarket', 'Expense', 45.3, 45.3],
  [5, serial(Y, MM, 1), Y, MON, 'Alquiler (compartido al 50 %)', 'Cuenta corriente', 'Fixed', 'Housing', 'Expense', 900, 450]
];
const trf = [
  ['ID', 'Date', 'Year', 'Month', 'Origin Account', 'Destination Account', 'Value', 'Comments'],
  [1, serial(Y, MM, 28), Y, MON, 'Cuenta corriente', 'Ahorro', 300, 'Ahorro mensual']
];
const inv = [
  ['ID', 'Date', 'Year', 'Month', 'Concept', 'Platform/Asset', 'Value', 'Investment Category', 'Action', 'P/L', 'Value (Inv. Account)'],
  [1, serial(Y, MM, 28), Y, MON, 'Aportación fondo indexado', 'Fondo_Indexado', 100, 'Fondos', 'Deposit', 'NA', 100]
];
const ACC = [['Cuenta corriente', 'Día a día'], ['Tarjeta', 'Día a día'], ['Efectivo', 'Día a día'], ['Ahorro', 'Ahorro'], ['Inversiones', 'Ahorro']];
const SUB = [['Salary', 'Incomes'], ['Additional Income', 'Incomes'], ['Housing', 'Fixed'], ['Subscriptions', 'Fixed'], ['Insurance', 'Fixed'],
  ['Supermarket', 'Variable'], ['Restaurants', 'Variable'], ['Leisure', 'Variable'], ['Transport', 'Variable'], ['Others', 'Variable']];
const INVCAT = ['Fondos', 'Plan Pensiones', 'Acciones', 'Cripto', 'Inmobiliario'];
const val = [['Account', 'Group', null, 'Subcategory', 'Category', null, 'Investment Category']];
for (let i = 0; i < Math.max(ACC.length, SUB.length, INVCAT.length); i++) {
  val.push([ACC[i]?.[0] ?? null, ACC[i]?.[1] ?? null, null, SUB[i]?.[0] ?? null, SUB[i]?.[1] ?? null, null, INVCAT[i] ?? null]);
}

const wb = XLSX.utils.book_new();
const sheet = (rows, name, dateCol, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (dateCol != null) for (let r = 1; r < rows.length; r++) {
    const c = ws[XLSX.utils.encode_cell({ r, c: dateCol })];
    if (c && typeof c.v === 'number') c.z = 'dd/mm/yyyy';
  }
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, name);
};
sheet(instrucciones, 'Instrucciones', null, [110]);
sheet(exp, 'Expenses', 1, [5, 11, 6, 7, 30, 18, 10, 18, 9, 14, 10]);
sheet(trf, 'Internal Transfers', 1, [5, 11, 6, 7, 18, 20, 10, 20]);
sheet(inv, 'Inversiones', 1, [5, 11, 6, 7, 28, 18, 10, 18, 9, 8, 18]);
sheet(val, 'Validations', null, [18, 14, 3, 18, 10, 3, 20]);
mkdirSync(join(ROOT, 'sample'), { recursive: true });
XLSX.writeFile(wb, join(ROOT, 'sample', 'plantilla-cuentas.xlsx'), { compression: true });
console.log('sample/plantilla-cuentas.xlsx generado');
