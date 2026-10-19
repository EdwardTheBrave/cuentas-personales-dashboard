// Genera sample/ejemplo-cuentas.xlsx con datos 100 % inventados y el mismo formato que el Sheet real:
// hojas Expenses, Internal Transfers e Inversiones con sus cabeceras. Es determinista (semilla fija).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let seed = 20240101;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const money = (min, max) => Math.round((min + rnd() * (max - min)) * 100) / 100;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'];
// Fecha como número de serie de Excel, sin depender de la zona horaria.
const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);

const START = { y: 2024, m: 11 };
const N_MONTHS = 24;
const months = [];
for (let i = 0; i < N_MONTHS; i++) {
  const t = START.m - 1 + i;
  months.push({ y: START.y + Math.floor(t / 12), m: (t % 12) + 1 });
}

// ---------- Expenses ----------
const exp = [['ID', 'Date', 'Year', 'Month', 'Concept', 'Account', 'Category', 'Subcategory', 'Type', 'raw_value_input', 'Value']];
let id = 1;
const opening = { 'Nómina': 1500, 'Gastos': 300, 'Hogar': 400, 'Ahorro': 12000, 'Efectivo': 120, 'Imprevistos': 500, 'Inversiones': 3000, 'Plan Pensiones': 4500 };
for (const [acc, v] of Object.entries(opening)) {
  exp.push([id++, null, 1899, 'Dic', 'Inicio Cuenta ' + acc, acc, 'Incomes', 'Additional Income', 'Income', v, v]);
}
const row = (y, m, d, concept, acc, cat, sub, type, raw, value = raw) =>
  exp.push([id++, serial(y, m, d), y, MONTHS[m - 1], concept, acc, cat, sub, type, raw, value]);

const VARIABLE = [
  ['Supermarket', ['Supermercado Barrio', 'Mercado Central', 'Frutería Plaza']], ['Restaurants', ['Cena con amigos', 'Menú del día', 'Cafetería Centro']],
  ['Leisure', ['Cine', 'Concierto', 'Escapada fin de semana']], ['Shopping', ['Ropa', 'Librería', 'Tienda online']],
  ['Transport', ['Abono transporte', 'Taxi', 'Gasolina']], ['Health & Care', ['Farmacia', 'Fisioterapia']], ['Gifts', ['Regalo cumpleaños']]
];
for (const { y, m } of months) {
  row(y, m, 1, 'Nómina Empresa Ejemplo', 'Nómina', 'Incomes', 'Salary', 'Income', 2200);
  row(y, m, 1, 'Gimnasio', 'Nómina', 'Fixed', 'Gym', 'Expense', 39.9);
  row(y, m, 1, 'Plataforma streaming', 'Nómina', 'Fixed', 'Subscriptions', 'Expense', 12.99);
  row(y, m, 1, 'Seguro coche', 'Nómina', 'Fixed', 'Insurance', 'Expense', 32.5);
  // Hogar compartido al 50 %: raw_value_input es el total y Value tu parte.
  row(y, m, 1, 'Alquiler piso', 'Hogar', 'Fixed', 'Housing', 'Expense', 1300, 650);
  const luz = money(70, 140); row(y, m, 1, 'Luz y agua', 'Hogar', 'Fixed', 'Housing', 'Expense', luz, Math.round(luz * 50) / 100);
  const n = 8 + Math.floor(rnd() * 8);
  for (let i = 0; i < n; i++) {
    const [sub, concepts] = pick(VARIABLE);
    const max = sub === 'Supermarket' ? 90 : sub === 'Leisure' ? 120 : 45;
    row(y, m, 1, pick(concepts), rnd() < 0.85 ? 'Gastos' : 'Efectivo', 'Variable', sub, 'Expense', money(3, max));
  }
  if (rnd() < 0.25) row(y, m, 1, 'Reparación imprevista', 'Imprevistos', 'Variable', 'Others', 'Expense', money(60, 400));
  row(y, m, 1, 'Intereses cuenta remunerada', 'Ahorro', 'Incomes', 'Additional Income', 'Income', money(15, 35));
  if (m === 6 || m === 12) row(y, m, 1, 'Paga extra', 'Nómina', 'Incomes', 'Salary', 'Income', 1800);
}

// ---------- Internal Transfers ----------
const trf = [['ID', 'Date', 'Year', 'Month', 'Origin Account', 'Destination Account', 'Value', 'Comments']];
let tid = 1;
const tr = (y, m, d, from, to, v, c = null) => trf.push([tid++, serial(y, m, d), y, MONTHS[m - 1], from, to, v, c]);
for (const { y, m } of months) {
  tr(y, m, 28, 'Nómina', 'Hogar', 700);
  tr(y, m, 28, 'Nómina', 'Gastos', 450);
  tr(y, m, 28, 'Nómina', 'Ahorro', 400);
  tr(y, m, 28, 'Nómina', 'Imprevistos', 50);
  tr(y, m, 28, 'Nómina', 'Inversiones', 150, 'Fondo indexado');
  tr(y, m, 28, 'Nómina', 'Plan Pensiones', 100, 'Aportación mensual');
  tr(y, m, 5, 'Gastos', 'Efectivo', 60);
}

// ---------- Inversiones ----------
const inv = [['ID', 'Date', 'Year', 'Month', 'Concept', 'Platform/Asset', 'Value', 'Investment Category', 'Action', 'P/L', 'Value (Inv. Account)']];
let iid = 1;
const op = (y, m, d, concept, asset, value, cat, action, pl, delta) => inv.push([iid++, serial(y, m, d), y, MONTHS[m - 1], concept, asset, value, cat, action, pl, delta]);
op(2024, 3, 10, 'Compra cripto', 'Exchange_Demo', 1000, 'Cripto', 'Deposit', 'NA', 1000);
op(2024, 6, 15, 'Fondo temático', 'Fondo_Tematico', 2000, 'Fondos', 'Deposit', 'NA', 2000);
op(2025, 2, 20, 'Venta cripto', 'Exchange_Demo', 1340, 'Cripto', 'Withdraw', 340, -1000);
op(2025, 9, 1, 'Rescate fondo temático', 'Fondo_Tematico', 1850, 'Fondos', 'Withdraw', -150, -2000);
op(2025, 4, 1, 'Préstamo participativo', 'Proyecto_Demo', 5000, 'Financiero', 'Deposit', 'NA', 5000);
months.forEach(({ y, m }, i) => {
  op(y, m, 28, 'Aportación fondo indexado', 'Indexado_Global', 150, 'Fondos', 'Deposit', 'NA', 150);
  op(y, m, 28, 'Aportación plan de pensiones', 'PP_Ejemplo', 100, 'Plan Pensiones', 'Deposit', 'NA', 100);
  if (i % 3 === 2) { const v = money(40, 70); op(y, m, 28, 'Intereses préstamo', 'Proyecto_Demo', v, 'Financiero', 'Withdraw', v, 0); }
});
inv.sort((a, b) => (a[0] === 'ID' ? -1 : b[0] === 'ID' ? 1 : a[1] - b[1]));
inv.forEach((r, i) => { if (i) r[0] = i; });

const wb = XLSX.utils.book_new();
const add = (rows, name, dateCol) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 1; r < rows.length; r++) {
    const c = ws[XLSX.utils.encode_cell({ r, c: dateCol })];
    if (c && typeof c.v === 'number') c.z = 'dd/mm/yyyy';
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
};
add(exp, 'Expenses', 1);
add(trf, 'Internal Transfers', 1);
add(inv, 'Inversiones', 1);
// Validations: la estructura del usuario (cuentas con su grupo, subcategorías con su categoría).
const ACC = [['Nómina', 'Operativo'], ['Gastos', 'Operativo'], ['Hogar', 'Operativo'], ['Efectivo', 'Operativo'],
  ['Ahorro', 'Ahorro disponible'], ['Imprevistos', 'Ahorro disponible'], ['Inversiones', 'Inversiones'], ['Plan Pensiones', 'Inversiones']];
const SUB = [['Salary', 'Incomes'], ['Additional Income', 'Incomes'], ['Housing', 'Fixed'], ['Gym', 'Fixed'], ['Subscriptions', 'Fixed'],
  ['Insurance', 'Fixed'], ['Supermarket', 'Variable'], ['Restaurants', 'Variable'], ['Leisure', 'Variable'], ['Shopping', 'Variable'],
  ['Transport', 'Variable'], ['Health & Care', 'Variable'], ['Gifts', 'Variable'], ['Others', 'Variable']];
const INVCAT = ['Fondos', 'Plan Pensiones', 'Cripto', 'Financiero', 'Inmobiliario'];
const val = [['Account', 'Group', null, 'Subcategory', 'Category', null, 'Investment Category']];
for (let i = 0; i < Math.max(ACC.length, SUB.length, INVCAT.length); i++) {
  val.push([ACC[i]?.[0] ?? null, ACC[i]?.[1] ?? null, null, SUB[i]?.[0] ?? null, SUB[i]?.[1] ?? null, null, INVCAT[i] ?? null]);
}
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(val), 'Validations');
mkdirSync(join(ROOT, 'sample'), { recursive: true });
XLSX.writeFile(wb, join(ROOT, 'sample', 'ejemplo-cuentas.xlsx'), { compression: true });
console.log(`sample/ejemplo-cuentas.xlsx: ${exp.length - 1} movimientos, ${trf.length - 1} traspasos, ${inv.length - 1} operaciones de inversión`);
