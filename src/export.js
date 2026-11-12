// Excel（書式付き .xlsx）・CSV の出力
window.AppExport = (function () {
  "use strict";

  var COLORS = {
    month: "FFA4C2F4",
    quarter: "FFD5A6F5",
    half: "FFB4A7D6",
    total: "FF5B3F86",
    target: "FFFFFF99",
    block: "FF666666",
    label: "FFF3F3F3",
    sales: "FFDCE6F8",
    red: "FFE00000",
    blue: "FF1E6FD9",
    border: "FFB7B7B7",
  };

  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function fill(argb) {
    return { type: "pattern", pattern: "solid", fgColor: { argb: argb } };
  }
  var thin = { style: "thin", color: { argb: COLORS.border } };
  var BORDER = { top: thin, left: thin, bottom: thin, right: thin };

  function numFmt(kind) {
    return kind === "pct" ? "0.0%" : "#,##0";
  }

  function writeTable(ws, startRow, title, cells, columns, levels) {
    var r = startRow;
    ws.getCell(r, 1).value = title;
    ws.getCell(r, 1).font = { bold: true, size: 12 };
    r++;
    // 見出し（1行目：列名、2行目：売上／利益）
    columns.forEach(function (col, i) {
      var c = 3 + i * 2;
      ws.mergeCells(r, c, r, c + 1);
      var h = ws.getCell(r, c);
      h.value = col.label;
      h.alignment = { horizontal: "center", vertical: "middle" };
      h.fill = fill(COLORS[col.kind]);
      h.font = { bold: true, color: { argb: col.kind === "total" ? "FFFFFFFF" : "FF000000" } };
      ["売上", "利益"].forEach(function (t, j) {
        var s = ws.getCell(r + 1, c + j);
        s.value = t;
        s.alignment = { horizontal: "center" };
      });
      for (var k = 0; k < 2; k++) {
        ws.getCell(r, c + k).border = BORDER;
        ws.getCell(r + 1, c + k).border = BORDER;
      }
    });
    r += 2;
    var rows = AppAgg.tableRows(cells, levels);
    rows.forEach(function (row) {
      var isTarget = row.type === "target";
      var bc = ws.getCell(r, 1);
      if (isTarget || row.blockFirst) {
        bc.value = row.block;
        if (!isTarget && row.blockSize > 1) ws.mergeCells(r, 1, r + row.blockSize - 1, 1);
      }
      bc.fill = fill(COLORS.block);
      bc.font = { bold: true, color: { argb: "FFFFFFFF" } };
      bc.alignment = { horizontal: "center", vertical: "middle" };
      bc.border = BORDER;
      var lc = ws.getCell(r, 2);
      lc.value = row.label;
      lc.fill = fill(isTarget ? COLORS.target : COLORS.label);
      lc.alignment = { horizontal: "center" };
      lc.border = BORDER;
      row.cells.forEach(function (cell, i) {
        var x = ws.getCell(r, 3 + i);
        x.value = cell.v == null || (cell.kind === "count" && !cell.v) ? null : cell.v;
        x.numFmt = numFmt(cell.kind);
        x.border = BORDER;
        if (isTarget) x.fill = fill(COLORS.target);
        else if (i % 2 === 0) x.fill = fill(COLORS.sales);
        if (cell.red) x.font = { color: { argb: COLORS.red } };
        else if (cell.blue) x.font = { color: { argb: COLORS.blue } };
      });
      r++;
    });
    return r;
  }

  function fileBase(view) {
    return "売上レポート_" + view.fromYM.replace("-", "") + "-" + view.toYM.replace("-", "");
  }

  function conditionLines(summary) {
    return summary.map(function (s) {
      return s[0] + "：" + s[1];
    });
  }

  function excel(result, view, levels, conditions) {
    if (!window.ExcelJS) return Promise.reject(new Error("Excel出力の部品を読み込めませんでした。ネットワークを確認してください。"));
    var wb = new ExcelJS.Workbook();
    wb.created = new Date();
    var ws = wb.addWorksheet("レポート", { views: [{ state: "frozen", xSplit: 2 }] });
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 13;
    for (var i = 0; i < result.columns.length * 2; i++) ws.getColumn(3 + i).width = 15;
    var r = 1;
    ws.getCell(r, 1).value = "売上レポート（出力日時 " + new Date().toLocaleString("ja-JP") + "）";
    ws.getCell(r, 1).font = { bold: true, size: 14 };
    r++;
    conditionLines(conditions).forEach(function (line) {
      ws.getCell(r, 1).value = line;
      ws.getCell(r, 1).font = { color: { argb: "FF555555" } };
      r++;
    });
    r++;
    r = writeTable(ws, r, result.total.label, result.total.cells, result.columns, levels) + 1;
    result.groups.forEach(function (g) {
      r = writeTable(ws, r, g.label, g.cells, result.columns, levels) + 1;
    });

    var ds = wb.addWorksheet("明細", { views: [{ state: "frozen", ySplit: 1 }] });
    ds.columns = [
      { header: "売上日", key: "date", width: 12 },
      { header: "商談名", key: "name", width: 36 },
      { header: "取引先", key: "account", width: 22 },
      { header: "担当者", key: "owner", width: 14 },
      { header: "部", key: "dept", width: 14 },
      { header: "課", key: "section", width: 12 },
      { header: "チーム", key: "team", width: 12 },
      { header: "ステージ", key: "stage", width: 12 },
      { header: "受注確度", key: "level", width: 10 },
      { header: "分割％", key: "pct", width: 9, style: { numFmt: "0%" } },
      { header: "分割の金額", key: "amount", width: 15, style: { numFmt: "#,##0" } },
      { header: "分割の利益額", key: "profit", width: 15, style: { numFmt: "#,##0" } },
      { header: "コンペ区分", key: "compe", width: 12 },
      { header: "タグ", key: "tags", width: 20 },
      { header: "営業種別", key: "salesType", width: 10 },
    ];
    ds.getRow(1).font = { bold: true };
    ds.getRow(1).fill = fill(COLORS.month);
    result.details.forEach(function (s) {
      var u = result.aff(s.ownerId, s.salesDate);
      ds.addRow({
        date: s.salesDate,
        name: s.oppName,
        account: s.accountName,
        owner: u.name,
        dept: u.dept,
        section: u.section,
        team: u.team,
        stage: s.stage,
        level: s.level === "その他" ? "" : s.level,
        pct: s.pct,
        amount: Math.round(s.amount),
        profit: Math.round(s.profit),
        compe: s.competition,
        tags: s.tags.join("、"),
        salesType: s.salesType,
      });
    });
    return wb.xlsx.writeBuffer().then(function (buf) {
      download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileBase(view) + ".xlsx");
    });
  }

  function csvEscape(v) {
    var s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csv(result, view, levels, conditions) {
    var lines = [];
    conditionLines(conditions).forEach(function (l) {
      lines.push([l]);
    });
    lines.push([]);
    var tables = [result.total].concat(result.groups);
    tables.forEach(function (t) {
      lines.push([t.label]);
      var h1 = ["", ""];
      var h2 = ["", ""];
      result.columns.forEach(function (c) {
        h1.push(c.label, "");
        h2.push("売上", "利益");
      });
      lines.push(h1, h2);
      AppAgg.tableRows(t.cells, levels).forEach(function (row) {
        var line = [row.type === "target" || row.blockFirst ? row.block : "", row.label];
        row.cells.forEach(function (c) {
          line.push(c.v == null ? "" : c.kind === "pct" ? (c.v * 100).toFixed(1) + "%" : c.kind === "count" ? c.v || "" : Math.round(c.v));
        });
        lines.push(line);
      });
      lines.push([]);
    });
    var text = "﻿" + lines.map(function (l) { return l.map(csvEscape).join(","); }).join("\r\n");
    download(new Blob([text], { type: "text/csv;charset=utf-8" }), fileBase(view) + ".csv");
  }

  return { excel: excel, csv: csv };
})();
