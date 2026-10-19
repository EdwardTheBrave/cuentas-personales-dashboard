/* Modelo de datos: libro xlsx -> movimientos, traspasos y agregados mensuales.
   Lee las hojas por nombre y las columnas por cabecera, hasta la última fila con datos. */
var FinModel = (function () {
  var MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'];
  var MONTH_ALIASES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
    sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_]+/g, ' ');
  }

  function findSheet(wb, name) {
    var target = norm(name);
    for (var i = 0; i < wb.SheetNames.length; i++) {
      if (norm(wb.SheetNames[i]) === target) return wb.Sheets[wb.SheetNames[i]];
    }
    return null;
  }

  function parseAmount(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[€\s ]/g, '');
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s) || s.indexOf('-') !== -1;
    s = s.replace(/[()\-+]/g, '');
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  // Devuelve {y, m, d} o null. Acepta serial de Excel, Date, o texto dd/mm/aaaa.
  function parseDate(v, XLSX) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (v < 1000) return null;
      var p = XLSX && XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
      if (p) return { y: p.y, m: p.m, d: p.d };
      var dt = new Date(Math.round((v - 25569) * 86400000));
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }
    if (v instanceof Date) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
    var m = String(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) {
      var y = +m[3]; if (y < 100) y += 2000;
      return { y: y, m: +m[2], d: +m[1] };
    }
    m = String(v).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    return null;
  }

  function monthFromName(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v >= 1 && v <= 12 ? v : null;
    return MONTH_ALIASES[norm(v).replace(/\.$/, '')] || null;
  }

  function ym(y, m) { return y * 100 + m; }
  function ymLabel(k) { return MONTHS[(k % 100) - 1] + ' ' + String(Math.floor(k / 100)).slice(2); }
  function ymLong(k) {
    var names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return names[(k % 100) - 1] + ' ' + Math.floor(k / 100);
  }
  function nextYm(k) { var y = Math.floor(k / 100), m = k % 100; return m === 12 ? ym(y + 1, 1) : ym(y, m + 1); }

  // Mapa cabecera -> índice de columna a partir de la primera fila con cabeceras reconocibles.
  function headerIndex(rows, wanted) {
    for (var r = 0; r < Math.min(rows.length, 10); r++) {
      var row = rows[r] || [], idx = {}, hits = 0;
      for (var c = 0; c < row.length; c++) {
        var h = norm(row[c]);
        for (var key in wanted) {
          if (idx[key] == null && wanted[key].indexOf(h) !== -1) { idx[key] = c; hits++; }
        }
      }
      if (hits >= 3) return { row: r, idx: idx };
    }
    return null;
  }

  function rowsOf(XLSX, ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  }

  function cell(row, i) { return i == null ? null : row[i]; }
  function str(v) { return v == null ? '' : String(v).trim(); }

  function parseWorkbook(XLSX, wb) {
    var problems = [];
    var wsE = findSheet(wb, 'Expenses');
    var wsT = findSheet(wb, 'Internal Transfers');
    if (!wsE) throw new Error('No encuentro la hoja "Expenses" en el libro.');
    if (!wsT) problems.push('No encuentro la hoja "Internal Transfers": los saldos por cuenta no incluirán traspasos.');

    var eRows = rowsOf(XLSX, wsE);
    var eh = headerIndex(eRows, {
      id: ['id'], date: ['date', 'fecha'], year: ['year', 'ano', 'año'], month: ['month', 'mes'],
      concept: ['concept', 'concepto'], account: ['account', 'cuenta'], category: ['category', 'categoria'],
      sub: ['subcategory', 'subcategoria'], type: ['type', 'tipo'], value: ['value', 'valor', 'importe']
    });
    if (!eh || eh.idx.value == null || eh.idx.account == null || eh.idx.type == null)
      throw new Error('La hoja "Expenses" no tiene las cabeceras esperadas (Account, Type, Value).');

    var tx = [], skipped = 0;
    for (var r = eh.row + 1; r < eRows.length; r++) {
      var row = eRows[r] || [], I = eh.idx;
      var account = str(cell(row, I.account));
      var value = parseAmount(cell(row, I.value));
      var type = norm(cell(row, I.type));
      if (!account && value == null) continue;          // fila vacía o preformateada
      if (!account || value == null || !type) { skipped++; continue; }
      var isIncome = type.indexOf('income') === 0 || type.indexOf('ingreso') === 0;
      var isExpense = type.indexOf('expense') === 0 || type.indexOf('gasto') === 0;
      if (!isIncome && !isExpense) { skipped++; continue; }
      var d = parseDate(cell(row, I.date), XLSX);
      var year = +cell(row, I.year) || null;
      var opening = (year && year < 2000) || (d && d.y < 2000);
      if (!d && !opening) {
        var mm = monthFromName(cell(row, I.month));
        if (year && mm) d = { y: year, m: mm, d: 1 };
      }
      if (!d && !opening) { skipped++; continue; }
      tx.push({
        id: cell(row, I.id), opening: !!opening,
        y: opening ? 0 : d.y, m: opening ? 0 : d.m, d: opening ? 0 : d.d,
        ym: opening ? 0 : ym(d.y, d.m),
        concept: str(cell(row, I.concept)) || '(sin concepto)',
        account: account,
        category: str(cell(row, I.category)) || '(sin categoría)',
        sub: str(cell(row, I.sub)) || '(sin subcategoría)',
        kind: isIncome ? 'Income' : 'Expense',
        // El signo de la hoja se respeta: un gasto negativo (corrección o abono) suma al saldo.
        value: value,
        signed: isIncome ? value : -value
      });
    }

    var tr = [];
    if (wsT) {
      var tRows = rowsOf(XLSX, wsT);
      var th = headerIndex(tRows, {
        id: ['id'], date: ['date', 'fecha'], year: ['year', 'ano', 'año'], month: ['month', 'mes'],
        from: ['origin account', 'origen', 'cuenta origen'], to: ['destination account', 'destino', 'cuenta destino'],
        value: ['value', 'valor', 'importe'], comments: ['comments', 'comentarios']
      });
      if (!th || th.idx.from == null || th.idx.to == null || th.idx.value == null) {
        problems.push('La hoja "Internal Transfers" no tiene las cabeceras esperadas; se ignora.');
      } else {
        for (var q = th.row + 1; q < tRows.length; q++) {
          var t = tRows[q] || [], J = th.idx;
          var from = str(cell(t, J.from)), to = str(cell(t, J.to)), v = parseAmount(cell(t, J.value));
          if (!from && !to && v == null) continue;
          if (!from || !to || v == null) { skipped++; continue; }
          var td = parseDate(cell(t, J.date), XLSX);
          if (!td) {
            var ty = +cell(t, J.year), tm = monthFromName(cell(t, J.month));
            if (ty && tm) td = { y: ty, m: tm, d: 1 };
          }
          if (!td) { skipped++; continue; }
          tr.push({ id: cell(t, J.id), y: td.y, m: td.m, d: td.d, ym: ym(td.y, td.m), from: from, to: to,
            value: Math.abs(v), comments: str(cell(t, J.comments)) });
        }
      }
    }
    if (skipped) problems.push(skipped + ' filas incompletas ignoradas (sin fecha, cuenta, tipo o importe).');
    return { tx: tx, tr: tr, problems: problems };
  }

  // Lista continua de meses desde el primer movimiento hasta max(último movimiento, mes actual).
  function monthRange(data, todayYm) {
    var min = Infinity, max = -Infinity;
    data.tx.forEach(function (t) { if (!t.opening) { if (t.ym < min) min = t.ym; if (t.ym > max) max = t.ym; } });
    data.tr.forEach(function (t) { if (t.ym < min) min = t.ym; if (t.ym > max) max = t.ym; });
    if (!isFinite(min)) return [];
    if (todayYm && todayYm > max && todayYm - max < 200) max = todayYm;
    var out = [];
    for (var k = min; k <= max; k = nextYm(k)) out.push(k);
    return out;
  }

  // Saldo de cada cuenta a fin de cada mes (valor contable). No depende de filtros de flujo.
  function balances(data, months, accountSet) {
    var idx = {}; months.forEach(function (k, i) { idx[k] = i; });
    var delta = {}, opening = {};
    function acc(name) {
      if (!delta[name]) { delta[name] = new Array(months.length).fill(0); opening[name] = 0; }
      return delta[name];
    }
    data.tx.forEach(function (t) {
      if (accountSet && !accountSet.has(t.account)) return;
      var a = acc(t.account);
      if (t.opening) opening[t.account] += t.signed;
      else if (idx[t.ym] != null) a[idx[t.ym]] += t.signed;
    });
    data.tr.forEach(function (t) {
      if (idx[t.ym] == null) return;
      if (!accountSet || accountSet.has(t.from)) acc(t.from)[idx[t.ym]] -= t.value;
      if (!accountSet || accountSet.has(t.to)) acc(t.to)[idx[t.ym]] += t.value;
    });
    var byAccount = {}, total = new Array(months.length).fill(0);
    Object.keys(delta).forEach(function (name) {
      var run = opening[name], arr = [];
      for (var i = 0; i < months.length; i++) { run += delta[name][i]; arr.push(round2(run)); total[i] += run; }
      byAccount[name] = arr;
    });
    return { byAccount: byAccount, total: total.map(round2) };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // Hoja "Inversiones": operaciones de depósito y retirada por activo.
  // Capital vivo = suma de "Value (Inv. Account)"; P&L realizado = suma de "P/L".
  function parseInvestments(XLSX, wb) {
    var ws = findSheet(wb, 'Inversiones');
    if (!ws) return { ops: [], problems: ['No encuentro la hoja "Inversiones".'] };
    var rows = rowsOf(XLSX, ws);
    var h = headerIndex(rows, {
      id: ['id'], date: ['date', 'fecha'], year: ['year', 'ano', 'año'], month: ['month', 'mes'],
      concept: ['concept', 'concepto'], asset: ['platform/asset', 'platform', 'asset', 'activo', 'plataforma'],
      value: ['value', 'valor', 'importe'], category: ['investment category', 'categoria', 'category'],
      action: ['action', 'accion'], pl: ['p/l', 'pl', 'p&l', 'pyg'], inv: ['value (inv. account)', 'value (inv account)', 'capital']
    });
    if (!h || h.idx.asset == null || h.idx.value == null || h.idx.action == null)
      return { ops: [], problems: ['La hoja "Inversiones" no tiene las cabeceras esperadas (Platform/Asset, Value, Action).'] };
    var ops = [], skipped = 0, I = h.idx;
    for (var r = h.row + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var asset = str(cell(row, I.asset)), value = parseAmount(cell(row, I.value));
      if (!asset && value == null) continue;
      var action = norm(cell(row, I.action));
      var isDep = action.indexOf('deposit') === 0 || action.indexOf('aport') === 0 || action.indexOf('compra') === 0;
      var isWd = action.indexOf('withdraw') === 0 || action.indexOf('retir') === 0 || action.indexOf('venta') === 0;
      var d = parseDate(cell(row, I.date), XLSX);
      if (!d) { var y = +cell(row, I.year), mm = monthFromName(cell(row, I.month)); if (y && mm) d = { y: y, m: mm, d: 1 }; }
      if (!asset || value == null || (!isDep && !isWd) || !d) { skipped++; continue; }
      var inv = parseAmount(cell(row, I.inv));
      if (inv == null) inv = isDep ? Math.abs(value) : 0;
      var pl = parseAmount(cell(row, I.pl));
      ops.push({ id: cell(row, I.id), y: d.y, m: d.m, d: d.d, ym: ym(d.y, d.m), date: d.y * 10000 + d.m * 100 + d.d,
        concept: str(cell(row, I.concept)) || '(sin concepto)', asset: asset,
        category: str(cell(row, I.category)) || '(sin categoría)', action: isDep ? 'Deposit' : 'Withdraw',
        value: Math.abs(value), inv: inv, pl: pl == null ? 0 : pl });
    }
    ops.sort(function (a, b) { return a.date - b.date; });
    return { ops: ops, problems: skipped ? [skipped + ' filas de Inversiones incompletas ignoradas.'] : [] };
  }

  // Posiciones por categoría + activo.
  function positions(ops) {
    var map = {};
    ops.forEach(function (o) {
      var k = o.category + '\u0000' + o.asset;
      var p = map[k] = map[k] || { category: o.category, asset: o.asset, deposited: 0, withdrawn: 0, live: 0, pl: 0, n: 0, first: o.date, last: o.date };
      if (o.action === 'Deposit') p.deposited += o.value; else p.withdrawn += o.value;
      p.live += o.inv; p.pl += o.pl; p.n++;
      if (o.date < p.first) p.first = o.date; if (o.date > p.last) p.last = o.date;
    });
    return Object.keys(map).map(function (k) {
      var p = map[k];
      p.live = round2(p.live); p.pl = round2(p.pl); p.deposited = round2(p.deposited); p.withdrawn = round2(p.withdrawn);
      p.active = Math.abs(p.live) > 0.5;
      p.ret = p.deposited > 0 ? p.pl / p.deposited : null;
      return p;
    });
  }

  return {
    MONTHS: MONTHS, parseWorkbook: parseWorkbook, parseInvestments: parseInvestments, positions: positions, monthRange: monthRange, balances: balances,
    ym: ym, ymLabel: ymLabel, ymLong: ymLong, nextYm: nextYm, parseAmount: parseAmount, round2: round2
  };
})();
if (typeof module !== 'undefined') module.exports = FinModel;
