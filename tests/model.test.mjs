import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const M = require('../src/model.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sample = () => XLSX.read(readFileSync(join(ROOT, 'sample', 'ejemplo-cuentas.xlsx')), { type: 'buffer' });

test('lee el Excel de ejemplo sin filas descartadas', () => {
  const d = M.parseWorkbook(XLSX, sample());
  assert.ok(d.tx.length > 300);
  assert.ok(d.tr.length > 100);
  assert.deepEqual(d.problems, []);
  assert.equal(d.tx.filter((t) => t.opening).length, 8);
});

test('el patrimonio final = saldos iniciales + ingresos − gastos (los traspasos suman cero)', () => {
  const d = M.parseWorkbook(XLSX, sample());
  const months = M.monthRange(d);
  const b = M.balances(d, months);
  const expected = d.tx.reduce((s, t) => s + t.signed, 0);
  assert.equal(b.total[b.total.length - 1], M.round2(expected));
  const perAccount = Object.values(b.byAccount).reduce((s, arr) => s + arr[arr.length - 1], 0);
  assert.equal(M.round2(perAccount), M.round2(expected));
});

test('usa la columna Value (tu parte) y no raw_value_input', () => {
  const d = M.parseWorkbook(XLSX, sample());
  const rent = d.tx.find((t) => t.concept === 'Alquiler piso');
  assert.equal(rent.value, 650);
});

function book(expRows, trRows = [['ID', 'Date', 'Year', 'Month', 'Origin Account', 'Destination Account', 'Value', 'Comments']]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'Expenses');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trRows), 'Internal Transfers');
  return wb;
}

test('respeta el signo de la hoja: un gasto negativo suma al saldo', () => {
  const d = M.parseWorkbook(XLSX, book([
    ['ID', 'Date', 'Year', 'Month', 'Concept', 'Account', 'Category', 'Subcategory', 'Type', 'raw_value_input', 'Value'],
    [1, '01/09/2026', 2026, 'Sept', 'Compra', 'Gastos', 'Variable', 'Shopping', 'Expense', 10, 10],
    [2, '01/09/2026', 2026, 'Sept', 'Abono', 'Gastos', 'Variable', 'Shopping', 'Expense', -0.03, -0.03]
  ]));
  const b = M.balances(d, M.monthRange(d));
  assert.equal(b.byAccount.Gastos[0], -9.97);
});

test('lee por cabecera: columnas reordenadas y filas nuevas al final', () => {
  const d = M.parseWorkbook(XLSX, book([
    ['Value', 'Type', 'Account', 'Concept', 'Date', 'Category', 'Subcategory', 'Year', 'Month', 'ID'],
    ['€1.212,17', 'Income', 'Nómina', 'Nómina', '01/01/2026', 'Incomes', 'Salary', 2026, 'Ene', 1],
    ['€12,50', 'Expense', 'Gastos', 'Café', '01/02/2026', 'Variable', 'Restaurants', 2026, 'Feb', 2],
    [null, null, null, null, null, null, null, null, null, null]
  ]));
  assert.equal(d.tx.length, 2);
  assert.equal(d.tx[0].value, 1212.17);
  assert.equal(d.tx[1].ym, 202602);
});

test('inversiones: capital vivo y P&L realizado por posición', () => {
  const r = M.parseInvestments(XLSX, sample());
  assert.deepEqual(r.problems, []);
  const pos = Object.fromEntries(M.positions(r.ops).map((p) => [p.asset, p]));
  assert.equal(pos.Exchange_Demo.live, 0);
  assert.equal(pos.Exchange_Demo.pl, 340);
  assert.equal(pos.Exchange_Demo.active, false);
  assert.equal(pos.Fondo_Tematico.pl, -150);
  assert.equal(pos.Proyecto_Demo.live, 5000);
  assert.equal(pos.Indexado_Global.live, 150 * 24);
});

test('agente: el resumen cabe en el prompt y las herramientas responden', () => {
  const A = require('../src/agent.js');
  const wb = sample();
  const data = M.parseWorkbook(XLSX, wb);
  const ctx = { data, months: M.monthRange(data), groups: [{ name: 'Operativo', accounts: ['Nómina', 'Gastos', 'Hogar'] }], invOps: M.parseInvestments(XLSX, wb).ops, today: '1 de enero de 2027' };
  const prompt = A.instructions(ctx);
  assert.ok(Buffer.byteLength(prompt) < 150 * 1024);
  const T = Object.fromEntries(A.tools(ctx).map((t) => [t.name, t]));
  assert.deepEqual(Object.keys(T).sort(), ['balances', 'calc', 'investments', 'list_transactions', 'query_flows', 'transfers']);
  const sal = T.query_flows.execute({ subcategories: ['Salary'], group_by: ['year'] });
  assert.ok(sal.filas.length >= 2 && sal.total.ingresos > 0);
  const all = T.balances.execute({ by: 'total' }), ex = T.balances.execute({ exclude_accounts: ['Inversiones'] });
  assert.ok(ex.filas.at(-1).total < all.filas.at(-1).total);
  assert.ok(!ex.cuentas_incluidas.includes('Inversiones'));
  assert.equal(T.calc.execute({ expression: '(1000-250)/3' }).resultado, 250);
  assert.throws(() => T.calc.execute({ expression: 'alert(1)' }));
  assert.ok(T.transfers.execute({ account: 'Inversiones', group_by: 'year' }).filas.length > 0);
});
