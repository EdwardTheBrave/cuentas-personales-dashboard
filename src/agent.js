/* Agente de preguntas: resumen de datos para el prompt y herramientas que Claude puede llamar.
   Todo se calcula aquí, en la página, con el mismo modelo que los gráficos; Claude solo decide qué consultar. */
var FinAgent = (function () {
  var M = typeof FinModel !== 'undefined' ? FinModel : require('./model.js');

  function r2(n) { return Math.round(n * 100) / 100; }
  function ymStr(k) { return Math.floor(k / 100) + '-' + String(k % 100).padStart(2, '0'); }
  function parseYm(v, fallback) {
    if (v == null || v === '') return fallback;
    var s = String(v).trim(), m = s.match(/^(\d{4})[-\/](\d{1,2})$/);
    if (m) return +m[1] * 100 + +m[2];
    m = s.match(/^(\d{4})$/);
    if (m) return null;
    throw new Error('Mes no válido: "' + s + '". Usa el formato AAAA-MM.');
  }
  function range(input, months) {
    var from = parseYm(input.from, months[0]), to = parseYm(input.to, months[months.length - 1]);
    if (input.from && /^\d{4}$/.test(String(input.from).trim())) from = +input.from * 100 + 1;
    if (input.to && /^\d{4}$/.test(String(input.to).trim())) to = +input.to * 100 + 12;
    if (from > to) throw new Error('"from" es posterior a "to".');
    return { from: from, to: to };
  }
  function list(v) {
    if (v == null || v === '') return null;
    var arr = Array.isArray(v) ? v : String(v).split(',');
    arr = arr.map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean);
    return arr.length ? arr : null;
  }
  function inList(val, arr) { return !arr || arr.indexOf(String(val).toLowerCase()) !== -1; }
  function notIn(val, arr) { return !arr || arr.indexOf(String(val).toLowerCase()) === -1; }

  function flowFilter(input, months) {
    var rg = range(input, months);
    var acc = list(input.accounts), exAcc = list(input.exclude_accounts);
    var cat = list(input.categories), sub = list(input.subcategories), exSub = list(input.exclude_subcategories);
    var kind = input.kind === 'income' ? 'Income' : input.kind === 'expense' ? 'Expense' : null;
    var q = input.concept_contains ? String(input.concept_contains).toLowerCase() : null;
    var min = input.min_amount != null ? Number(input.min_amount) : null, max = input.max_amount != null ? Number(input.max_amount) : null;
    return function (t) {
      if (t.opening || t.ym < rg.from || t.ym > rg.to) return false;
      if (!inList(t.account, acc) || !notIn(t.account, exAcc)) return false;
      if (!inList(t.category, cat) || !inList(t.sub, sub) || !notIn(t.sub, exSub)) return false;
      if (kind && t.kind !== kind) return false;
      if (q && t.concept.toLowerCase().indexOf(q) === -1) return false;
      if (min != null && Math.abs(t.value) < min) return false;
      if (max != null && Math.abs(t.value) > max) return false;
      return true;
    };
  }
  function keyOf(t, g) {
    if (g === 'month') return ymStr(t.ym);
    if (g === 'year') return String(Math.floor(t.ym / 100));
    if (g === 'account') return t.account;
    if (g === 'category') return t.category;
    if (g === 'subcategory') return t.sub;
    if (g === 'concept') return t.concept;
    if (g === 'type') return t.kind === 'Income' ? 'ingreso' : 'gasto';
    throw new Error('group_by no válido: ' + g);
  }

  // ---------- Resumen para el prompt ----------
  function digest(ctx) {
    var data = ctx.data, months = ctx.months, groups = ctx.groups || [];
    var lines = [];
    var accounts = {};
    data.tx.forEach(function (t) { accounts[t.account] = 1; });
    data.tr.forEach(function (t) { accounts[t.from] = 1; accounts[t.to] = 1; });
    var subs = {}, cats = {};
    data.tx.forEach(function (t) { if (!t.opening) { subs[t.sub] = t.category; cats[t.category] = 1; } });
    lines.push('Periodo con datos: ' + ymStr(months[0]) + ' a ' + ymStr(months[months.length - 1]) + '.');
    lines.push('Cuentas: ' + Object.keys(accounts).sort().join(', ') + '.');
    if (groups.length) lines.push('Grupos de cuentas: ' + groups.map(function (g) { return g.name + ' (' + g.accounts.join(', ') + ')'; }).join('; ') + '.');
    lines.push('Categorías: ' + Object.keys(cats).join(', ') + '. Subcategorías (categoría): ' + Object.keys(subs).sort().map(function (s) { return s + ' (' + subs[s] + ')'; }).join(', ') + '.');

    // Tabla mensual por cuenta: ingresos, gastos, traspasos y saldo a fin de mes.
    var idx = {}; months.forEach(function (k, i) { idx[k] = i; });
    var cell = {};
    function c(a, i) { var k = a + '|' + i; return cell[k] = cell[k] || { inc: 0, exp: 0, tin: 0, tout: 0 }; }
    data.tx.forEach(function (t) { if (!t.opening && idx[t.ym] != null) { var x = c(t.account, idx[t.ym]); if (t.kind === 'Income') x.inc += t.value; else x.exp += t.value; } });
    data.tr.forEach(function (t) { if (idx[t.ym] == null) return; c(t.from, idx[t.ym]).tout += t.value; c(t.to, idx[t.ym]).tin += t.value; });
    var bal = M.balances(data, months);
    lines.push('');
    lines.push('TABLA_MENSUAL_POR_CUENTA (mes|cuenta|ingresos|gastos|traspasos_entrada|traspasos_salida|saldo_fin_mes; se omiten filas sin movimiento ni saldo):');
    months.forEach(function (k, i) {
      Object.keys(bal.byAccount).sort().forEach(function (a) {
        var x = cell[a + '|' + i] || { inc: 0, exp: 0, tin: 0, tout: 0 }, b = bal.byAccount[a][i];
        if (!x.inc && !x.exp && !x.tin && !x.tout && Math.abs(b) < 0.005) return;
        lines.push([ymStr(k), a, r2(x.inc), r2(x.exp), r2(x.tin), r2(x.tout), r2(b)].join('|'));
      });
    });
    var opening = data.tx.filter(function (t) { return t.opening; });
    lines.push('Saldos iniciales (antes del primer mes): ' + opening.map(function (t) { return t.account + ' ' + r2(t.signed); }).join(', ') + '.');

    // Ingresos por subcategoría y gastos por categoría, por mes.
    var incSub = {}, expCat = {};
    data.tx.forEach(function (t) {
      if (t.opening) return;
      var k = ymStr(t.ym);
      if (t.kind === 'Income') { incSub[k + '|' + t.sub] = (incSub[k + '|' + t.sub] || 0) + t.value; }
      else { expCat[k + '|' + t.category] = (expCat[k + '|' + t.category] || 0) + t.value; }
    });
    lines.push('');
    lines.push('INGRESOS_POR_SUBCATEGORIA (mes|subcategoría|importe):');
    Object.keys(incSub).sort().forEach(function (k) { lines.push(k + '|' + r2(incSub[k])); });
    lines.push('');
    lines.push('GASTOS_POR_CATEGORIA (mes|categoría|importe):');
    Object.keys(expCat).sort().forEach(function (k) { lines.push(k + '|' + r2(expCat[k])); });
    return lines.join('\n');
  }

  // ---------- Herramientas ----------
  function tools(ctx, onProgress) {
    var data = ctx.data, months = ctx.months;
    var say = onProgress || function () {};

    var queryFlows = {
      name: 'query_flows',
      description: 'Suma ingresos y gastos (sin traspasos internos ni saldos iniciales) con filtros y agrupaciones. Devuelve filas {grupo..., ingresos, gastos, neto, n}. Úsala para gastos por subcategoría, por concepto, por año, etc.',
      inputSchema: { type: 'object', properties: {
        from: { type: 'string', description: 'Mes inicial AAAA-MM o año AAAA' }, to: { type: 'string', description: 'Mes final AAAA-MM o año AAAA' },
        group_by: { type: 'array', items: { type: 'string', enum: ['month', 'year', 'account', 'category', 'subcategory', 'concept', 'type'] }, description: 'Hasta 2 dimensiones' },
        accounts: { type: 'array', items: { type: 'string' } }, exclude_accounts: { type: 'array', items: { type: 'string' } },
        categories: { type: 'array', items: { type: 'string' } }, subcategories: { type: 'array', items: { type: 'string' } }, exclude_subcategories: { type: 'array', items: { type: 'string' } },
        kind: { type: 'string', enum: ['income', 'expense'] }, concept_contains: { type: 'string' },
        min_amount: { type: 'number' }, max_amount: { type: 'number' }, top: { type: 'number', description: 'Máximo de filas, por importe; por defecto 60' }
      } },
      execute: function (input) {
        say('Sumando ingresos y gastos');
        var f = flowFilter(input, months), gb = (input.group_by || []).slice(0, 2), map = {};
        data.tx.forEach(function (t) {
          if (!f(t)) return;
          var keys = gb.map(function (g) { return keyOf(t, g); }), k = keys.join('|');
          var row = map[k] = map[k] || { keys: keys, ingresos: 0, gastos: 0, n: 0 };
          if (t.kind === 'Income') row.ingresos += t.value; else row.gastos += t.value;
          row.n++;
        });
        var rows = Object.keys(map).map(function (k) {
          var r = map[k], o = {};
          gb.forEach(function (g, i) { o[g] = r.keys[i]; });
          o.ingresos = r2(r.ingresos); o.gastos = r2(r.gastos); o.neto = r2(r.ingresos - r.gastos); o.n = r.n;
          return o;
        });
        var timeKey = gb[0] === 'month' || gb[0] === 'year';
        rows.sort(timeKey ? function (a, b) { return a[gb[0]] < b[gb[0]] ? -1 : 1; } : function (a, b) { return (b.ingresos + b.gastos) - (a.ingresos + a.gastos); });
        var top = Math.min(Number(input.top) || 60, 200);
        var out = { filas: rows.slice(0, top) };
        if (rows.length > top) out.aviso = 'Hay ' + rows.length + ' filas; se muestran ' + top + '.';
        var tot = rows.reduce(function (s, r) { s.ingresos += r.ingresos; s.gastos += r.gastos; return s; }, { ingresos: 0, gastos: 0 });
        out.total = { ingresos: r2(tot.ingresos), gastos: r2(tot.gastos), neto: r2(tot.ingresos - tot.gastos) };
        return out;
      }
    };

    var listTx = {
      name: 'list_transactions',
      description: 'Lista movimientos individuales (fecha, concepto, cuenta, categoría, subcategoría, tipo, importe) con los mismos filtros que query_flows. Máximo 150 filas.',
      inputSchema: { type: 'object', properties: {
        from: { type: 'string' }, to: { type: 'string' }, accounts: { type: 'array', items: { type: 'string' } }, exclude_accounts: { type: 'array', items: { type: 'string' } },
        categories: { type: 'array', items: { type: 'string' } }, subcategories: { type: 'array', items: { type: 'string' } }, kind: { type: 'string', enum: ['income', 'expense'] },
        concept_contains: { type: 'string' }, min_amount: { type: 'number' }, max_amount: { type: 'number' },
        sort: { type: 'string', enum: ['amount_desc', 'amount_asc', 'date_desc', 'date_asc'] }, limit: { type: 'number' }
      } },
      execute: function (input) {
        say('Buscando movimientos');
        var f = flowFilter(input, months);
        var rows = data.tx.filter(f);
        var s = input.sort || 'amount_desc';
        rows.sort(function (a, b) {
          if (s === 'amount_asc') return a.value - b.value;
          if (s === 'date_desc') return b.ym - a.ym || b.d - a.d;
          if (s === 'date_asc') return a.ym - b.ym || a.d - b.d;
          return b.value - a.value;
        });
        var lim = Math.min(Number(input.limit) || 50, 150);
        return { total_encontrados: rows.length, movimientos: rows.slice(0, lim).map(function (t) {
          return { mes: ymStr(t.ym), concepto: t.concept, cuenta: t.account, categoria: t.category, subcategoria: t.sub, tipo: t.kind === 'Income' ? 'ingreso' : 'gasto', importe: r2(t.value) };
        }) };
      }
    };

    var balances = {
      name: 'balances',
      description: 'Saldo contable a fin de mes. Puede dar el total, por cuenta o por grupo, y excluir cuentas (el patrimonio sin esas cuentas). Devuelve una fila por mes del rango; usa step para muestrear (p. ej. 12 = un mes por año).',
      inputSchema: { type: 'object', properties: {
        from: { type: 'string' }, to: { type: 'string' }, by: { type: 'string', enum: ['total', 'account', 'group'] },
        accounts: { type: 'array', items: { type: 'string' } }, exclude_accounts: { type: 'array', items: { type: 'string' } }, step: { type: 'number' }
      } },
      execute: function (input) {
        say('Calculando saldos');
        var rg = range(input, months), acc = list(input.accounts), ex = list(input.exclude_accounts);
        var set = new Set();
        var b = M.balances(data, months);
        Object.keys(b.byAccount).forEach(function (a) { if (inList(a, acc) && notIn(a, ex)) set.add(a); });
        var by = input.by || 'total', step = Math.max(1, Number(input.step) || 1);
        var groupOf = function (a) {
          var g = (ctx.groups || []).filter(function (x) { return x.accounts.some(function (y) { return y.toLowerCase() === a.toLowerCase(); }); })[0];
          return g ? g.name : 'Otras cuentas';
        };
        var sel = months.map(function (k, i) { return { k: k, i: i }; }).filter(function (x) { return x.k >= rg.from && x.k <= rg.to; });
        sel = sel.filter(function (x, j) { return j % step === 0 || j === sel.length - 1; });
        return { cuentas_incluidas: Array.from(set), filas: sel.map(function (x) {
          var o = { mes: ymStr(x.k) }, total = 0;
          set.forEach(function (a) {
            var v = b.byAccount[a][x.i]; total += v;
            if (by === 'account') o[a] = r2(v);
            else if (by === 'group') { var g = groupOf(a); o[g] = r2((o[g] || 0) + v); }
          });
          o.total = r2(total);
          return o;
        }) };
      }
    };

    var transfers = {
      name: 'transfers',
      description: 'Traspasos internos entre cuentas, agregados por mes o año y por origen→destino. Úsala para saber cuánto dinero entró o salió de una cuenta excluida (p. ej. aportaciones a una cuenta que no quieres contar).',
      inputSchema: { type: 'object', properties: {
        from: { type: 'string' }, to: { type: 'string' }, account: { type: 'string', description: 'Solo traspasos que tocan esta cuenta' },
        group_by: { type: 'string', enum: ['month', 'year', 'none'] }
      } },
      execute: function (input) {
        say('Revisando traspasos');
        var rg = range(input, months), a = input.account ? String(input.account).toLowerCase() : null, g = input.group_by || 'year', map = {};
        data.tr.forEach(function (t) {
          if (t.ym < rg.from || t.ym > rg.to) return;
          if (a && t.from.toLowerCase() !== a && t.to.toLowerCase() !== a) return;
          var p = g === 'month' ? ymStr(t.ym) : g === 'year' ? String(Math.floor(t.ym / 100)) : 'todo';
          var k = p + '|' + t.from + '→' + t.to;
          map[k] = map[k] || { periodo: p, origen: t.from, destino: t.to, importe: 0, n: 0 };
          map[k].importe += t.value; map[k].n++;
        });
        var rows = Object.keys(map).map(function (k) { map[k].importe = r2(map[k].importe); return map[k]; })
          .sort(function (x, y) { return x.periodo < y.periodo ? -1 : x.periodo > y.periodo ? 1 : y.importe - x.importe; });
        return { filas: rows.slice(0, 200), aviso: rows.length > 200 ? 'Recortado a 200 filas' : undefined };
      }
    };

    var investments = {
      name: 'investments',
      description: 'Posiciones de la hoja Inversiones: por activo, aportado, retirado/cobrado, capital vivo (coste, no valor de mercado), P&L realizado y estado. Opcionalmente lista operaciones de un activo.',
      inputSchema: { type: 'object', properties: { category: { type: 'string' }, asset: { type: 'string', description: 'Si se indica, devuelve también sus operaciones' } } },
      execute: function (input) {
        say('Consultando inversiones');
        var ops = (ctx.invOps || []).filter(function (o) { return !input.category || o.category.toLowerCase() === String(input.category).toLowerCase(); });
        var out = { posiciones: M.positions(ops).map(function (p) {
          return { categoria: p.category, activo: p.asset, aportado: p.deposited, retirado_cobrado: p.withdrawn, capital_vivo: p.live, pl_realizado: p.pl, vivo: p.active, desde: ymStr(Math.floor(p.first / 100)), hasta: ymStr(Math.floor(p.last / 100)) };
        }) };
        if (input.asset) {
          var a = String(input.asset).toLowerCase();
          out.operaciones = ops.filter(function (o) { return o.asset.toLowerCase() === a; }).map(function (o) {
            return { mes: ymStr(o.ym), concepto: o.concept, accion: o.action === 'Deposit' ? 'aportación' : 'retirada', importe: r2(o.value), delta_capital: r2(o.inv), pl: r2(o.pl) };
          });
        }
        return out;
      }
    };

    var calc = {
      name: 'calc',
      description: 'Calculadora exacta. Evalúa una expresión aritmética con números, + - * / ( ) y potencias **. Úsala para cualquier cuenta que vayas a dar en la respuesta.',
      inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] },
      execute: function (input) {
        var e = String(input.expression || '').replace(/,/g, '.').replace(/\s+/g, '');
        if (!/^[0-9.+\-*/()]+$/.test(e)) throw new Error('Solo números y + - * / ( ) **');
        var v = Function('"use strict";return (' + e + ')')();
        if (typeof v !== 'number' || !isFinite(v)) throw new Error('Resultado no numérico');
        return { resultado: Math.round(v * 10000) / 10000 };
      }
    };

    return [queryFlows, listTx, balances, transfers, investments, calc];
  }

  function instructions(ctx) {
    return [
      'Eres el analista financiero personal de este dashboard. Respondes en español, con claridad y sin rodeos, a preguntas sobre las finanzas del usuario.',
      'Hoy es ' + ctx.today + '. El mes en curso puede estar incompleto.',
      '',
      'Cómo están los datos:',
      '- Movimientos (hoja Expenses): cada fila es un ingreso o un gasto de una cuenta. "Value" es la parte del usuario.',
      '- Traspasos (hoja Internal Transfers): mueven dinero entre cuentas propias; no son ingreso ni gasto y suman cero en el patrimonio total.',
      '- Patrimonio neto = suma de saldos contables de las cuentas (saldo inicial + ingresos − gastos ± traspasos). Es valor contable, no de mercado.',
      '- Ahorro de un periodo = ingresos − gastos (sin traspasos). Tasa de ahorro = ahorro / ingresos.',
      '- Si el usuario pide ignorar una cuenta: quítala de saldos y de flujos, y trata los traspasos hacia o desde ella como salidas o entradas del resto (consúltalos con la herramienta transfers). Explica cómo lo has tratado.',
      '- Inversiones (hoja Inversiones): capital vivo = coste de lo invertido; P&L = beneficio realizado.',
      '',
      'Cómo trabajar:',
      '- Usa primero el RESUMEN de abajo; llama a las herramientas solo para el detalle que te falte. Haz las consultas necesarias en pocas rondas, pidiendo varias cosas a la vez.',
      '- Haz las cuentas que vayas a citar con la herramienta calc; no calcules de cabeza.',
      '- Si la pregunta es ambigua (fechas, qué cuenta), elige una interpretación razonable y dila en una línea.',
      '- No inventes datos. Si algo no está en los datos, dilo.',
      '',
      'Formato de la respuesta: empieza con la conclusión en una o dos frases (en negrita la idea clave). Después, el razonamiento con las cifras clave (importes en euros con formato español, p. ej. 1.234,56 €), con viñetas o una tabla Markdown corta si ayuda. Termina con los supuestos que has hecho. Sé breve: menos de 250 palabras salvo que pidan detalle. No es asesoramiento financiero; no hace falta decirlo salvo que te pidan una recomendación de inversión.',
      '',
      'RESUMEN DE DATOS',
      digest(ctx)
    ].join('\n');
  }

  return { digest: digest, tools: tools, instructions: instructions };
})();
if (typeof module !== 'undefined') module.exports = FinAgent;
