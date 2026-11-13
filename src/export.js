// Excel（書式付き .xlsx）・CSV の出力
window.AppExport = (function () {
  "use strict";

  var COLORS = {
    month: "FFA4C2F4",
    quarter: "FFD5A6F5",
    half: "FFB4A7D6",
    total: "FF5B3F86",
    target: "FFFFFF99",
    targetSum: "FFFBEEA0", // 目標の行の集計列
    sum: { quarter: "FFF1E8FD", half: "FFE9E4F6", total: "FFE0D9F2" }, // 集計列（四半期・半期・合計）の数字のセル
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
        var kind = columns[Math.floor(i / 2)].kind;
        if (isTarget) x.fill = fill(kind === "month" ? COLORS.target : COLORS.targetSum);
        else if (kind !== "month") x.fill = fill(COLORS.sum[kind]);
        else if (i % 2 === 0) x.fill = fill(COLORS.sales);
        if (kind === "total") x.font = Object.assign({}, x.font || {}, { bold: true });
        if (cell.red) x.font = { color: { argb: COLORS.red } };
        else if (cell.blue) x.font = { color: { argb: COLORS.blue } };
      });
      r++;
    });
    return r;
  }

  function fileBase(view) {
    return "VISORA_Sales_" + view.fromYM.replace("-", "") + "-" + view.toYM.replace("-", "");
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
    ws.getCell(r, 1).value = "VISORA 売上レポート（出力日時 " + new Date().toLocaleString("ja-JP") + "）";
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

    // 担当者別（部・課・チームで絞り込んだときだけ）
    if (result.peopleTeams && result.peopleTeams.length) {
      var ps = wb.addWorksheet("担当者別", { views: [{ state: "frozen", xSplit: 3, ySplit: 3 }] });
      ps.getColumn(1).width = 18;
      ps.getColumn(2).width = 16;
      ps.getColumn(3).width = 14;
      ps.getCell(1, 1).value = "担当者別";
      ps.getCell(1, 1).font = { bold: true, size: 12 };
      ["チーム", "担当者", ""].forEach(function (v, i) {
        ps.mergeCells(2, 1 + i, 3, 1 + i);
        var h = ps.getCell(2, 1 + i);
        h.value = v;
        h.font = { bold: true };
        h.border = BORDER;
      });
      result.columns.forEach(function (col, i) {
        var c = 4 + i * 2;
        ps.getColumn(c).width = 14;
        ps.getColumn(c + 1).width = 14;
        ps.mergeCells(2, c, 2, c + 1);
        var h = ps.getCell(2, c);
        h.value = col.label;
        h.fill = fill(COLORS[col.kind]);
        h.font = { bold: true, color: { argb: col.kind === "total" ? "FFFFFFFF" : "FF000000" } };
        h.alignment = { horizontal: "center" };
        ["売上", "利益"].forEach(function (t, j) {
          var sc = ps.getCell(3, c + j);
          sc.value = t;
          sc.alignment = { horizontal: "center" };
          sc.border = BORDER;
        });
      });
      var lowest = AppAgg.LEVELS.filter(function (l) {
        return levels.indexOf(l) >= 0;
      }).pop();
      var prow = [
        { label: "目標", get: function (c) { return c.target; }, target: true },
        { label: "受注", get: function (c) { return c.cum["受注"]; }, red: true },
      ];
      if (lowest && lowest !== "受注") prow.push({ label: "積上（" + lowest + "まで）", get: function (c) { return c.cum[lowest]; }, red: true });
      prow.push({ label: "受注達成率", rate: true });
      var pr = 4;
      var putPerson = function (team, name, cells, style) {
        prow.forEach(function (row, k) {
          ps.getCell(pr + k, 1).value = k === 0 ? team : "";
          ps.getCell(pr + k, 2).value = k === 0 ? name : "";
          ps.getCell(pr + k, 3).value = row.label;
          for (var cc = 1; cc <= 3 + cells.length * 2; cc++) {
            ps.getCell(pr + k, cc).border = BORDER;
            if (style) ps.getCell(pr + k, cc).fill = fill(style);
          }
          cells.forEach(function (c, i) {
            var kind = result.columns[i].kind;
            [0, 1].forEach(function (j) {
              var cell = ps.getCell(pr + k, 4 + i * 2 + j);
              var key = j === 0 ? "amount" : "profit";
              if (row.rate) {
                cell.value = c.target[key] ? c.cum["受注"][key] / c.target[key] : null;
                cell.numFmt = "0.0%";
              } else {
                var v = row.get(c)[key];
                cell.value = v;
                cell.numFmt = "#,##0";
                if (row.red && c.target[key] && v < c.target[key]) cell.font = { color: { argb: COLORS.red } };
              }
              if (!style) {
                if (row.target) cell.fill = fill(kind === "month" ? COLORS.target : COLORS.targetSum);
                else if (kind !== "month") cell.fill = fill(COLORS.sum[kind]);
              }
            });
          });
        });
        pr += prow.length;
      };
      result.peopleTeams.forEach(function (team) {
        team.people.forEach(function (p) {
          putPerson(team.label, p.user.name + (p.user.title ? "（" + p.user.title + "）" : ""), p.cells);
        });
        putPerson(team.label, "小計", team.subtotal, "FFEEF3FB");
      });
    }

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
