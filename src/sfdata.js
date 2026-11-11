// Salesforceからレポート用のデータを読み取る（読み取りのみ）
//
// 読み取るもの
//   ユーザ（User）              … 氏名・部・課・チーム
//   商談分割（OpportunitySplit） … 分割担当者・％、商談の売上日・売上金額・最終利益額・ステージ・受注確度など
//   商談（レコードタイプ「目標」）… 所有者・売上日・目標売上金額・目標利益金額
//
// 返すデータの形（デモデータ src/demo.js も同じ形で返す）
//   users:   [{ id, name, dept, section, team, active }]
//   splits:  [{ oppId, oppName, accountName, salesDate, ym, ownerId, pct, amount, profit,
//               stage, level, competition, tags, salesType }]
//            amount = 商談分割の金額、profit = 商談分割の利益額、level = "受注" | "高" | "中" | "低"
//   targets: [{ oppId, ownerId, ym, amount, profit }]
window.AppSF = (function () {
  "use strict";

  function cfg() {
    return window.AppConfig;
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function lastDay(ym) {
    var p = ym.split("-").map(Number);
    var d = new Date(p[0], p[1], 0).getDate();
    return ym + "-" + pad2(d);
  }

  // ステージ・検索用受注確度から「受注・高・中・低」を決める。どれにもあたらないもの（失注など）は null
  function classify(stage, confidenceValue) {
    var o = cfg().opportunity;
    if (stage && (o.wonStages || []).indexOf(stage) >= 0) return "受注";
    if ((o.openStages || []).length && (o.openStages || []).indexOf(stage) < 0) return null;
    var v = confidenceValue == null ? "" : String(confidenceValue);
    var map = o.confidenceValues || {};
    var levels = ["受注", "高", "中", "低"];
    for (var i = 0; i < levels.length; i++) {
      if ((map[levels[i]] || []).indexOf(v) >= 0) return levels[i];
    }
    return null;
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function loadUsers() {
    var u = cfg().user;
    var fields = ["Id", "Name", "IsActive"];
    [u.department, u.section, u.team].forEach(function (f) {
      if (f && fields.indexOf(f) < 0) fields.push(f);
    });
    // 退職者・無効ユーザの過去実績も集計できるよう、無効ユーザも含めて取得する
    var soql = "SELECT " + fields.join(", ") + " FROM User WHERE UserType = 'Standard'";
    return AppSSO.query(soql).then(function (rows) {
      return rows.map(function (r) {
        return {
          id: r.Id,
          name: r.Name,
          dept: (u.department && r[u.department]) || "",
          section: (u.section && r[u.section]) || "",
          team: (u.team && r[u.team]) || "",
          active: !!r.IsActive,
        };
      });
    });
  }

  function idList(ids) {
    return "(" + ids.map(AppSSO.soqlString).join(", ") + ")";
  }

  function loadSplits(fromYM, toYM, onProgress) {
    var o = cfg().opportunity;
    var t = cfg().target;
    var s = cfg().split;
    var oppFields = ["Id", "Name", "StageName", "Account.Name", o.salesDate];
    [o.confidence, o.competition, o.tags, o.salesType].forEach(function (f) {
      if (f) oppFields.push(f);
    });
    var select = ["Id", "SplitOwnerId", "SplitPercentage", s.amount, s.profit].concat(
      oppFields.map(function (f) {
        return "Opportunity." + f;
      })
    );
    var where = ["Opportunity." + o.salesDate + " >= " + fromYM + "-01", "Opportunity." + o.salesDate + " <= " + lastDay(toYM)];
    if ((o.actualRecordTypeIds || []).length) where.push("Opportunity.RecordTypeId IN " + idList(o.actualRecordTypeIds));
    else where.push("Opportunity.RecordTypeId != " + AppSSO.soqlString(t.recordTypeId));
    if (s.onlyActiveSplitType) where.push("SplitType.IsActive = true");
    if (s.splitTypeDeveloperName) where.push("SplitType.DeveloperName = " + AppSSO.soqlString(s.splitTypeDeveloperName));
    var soql = "SELECT " + select.join(", ") + " FROM OpportunitySplit WHERE " + where.join(" AND ");
    return AppSSO.query(soql, onProgress).then(function (rows) {
      var out = [];
      var skipped = {};
      rows.forEach(function (r) {
        var opp = r.Opportunity || {};
        var conf = o.confidence ? opp[o.confidence] : null;
        var level = classify(opp.StageName, conf);
        if (!level) {
          var key = (opp.StageName || "（ステージなし）") + (o.openStages.indexOf(opp.StageName) >= 0 ? "／確度「" + (conf == null ? "空欄" : conf) + "」" : "");
          skipped[key] = (skipped[key] || 0) + 1;
          return;
        }
        var date = String(opp[o.salesDate] || "").slice(0, 10);
        out.push({
          oppId: opp.Id,
          oppName: opp.Name || "",
          accountName: (opp.Account && opp.Account.Name) || "",
          salesDate: date,
          ym: date.slice(0, 7),
          ownerId: r.SplitOwnerId,
          pct: num(r.SplitPercentage) / 100,
          amount: num(r[s.amount]),
          profit: num(r[s.profit]),
          stage: opp.StageName || "",
          level: level,
          competition: (o.competition && opp[o.competition]) || "",
          tags: o.tags && opp[o.tags] ? String(opp[o.tags]).split(";").filter(Boolean) : [],
          salesType: (o.salesType && opp[o.salesType]) || "",
        });
      });
      return { splits: out, skipped: skipped };
    });
  }

  function loadTargets(fromYM, toYM) {
    var o = cfg().opportunity;
    var t = cfg().target;
    var soql =
      "SELECT Id, OwnerId, " +
      o.salesDate +
      ", " +
      t.salesAmount +
      ", " +
      t.profitAmount +
      " FROM Opportunity WHERE RecordTypeId = " +
      AppSSO.soqlString(t.recordTypeId) +
      " AND " +
      o.salesDate +
      " >= " +
      fromYM +
      "-01 AND " +
      o.salesDate +
      " <= " +
      lastDay(toYM);
    return AppSSO.query(soql).then(function (rows) {
      return rows.map(function (r) {
        var date = String(r[o.salesDate] || "").slice(0, 10);
        return { oppId: r.Id, ownerId: r.OwnerId, ym: date.slice(0, 7), amount: num(r[t.salesAmount]), profit: num(r[t.profitAmount]) };
      });
    });
  }

  // 期間（"YYYY-MM"〜"YYYY-MM"）のデータをまとめて読み込む
  function load(fromYM, toYM, onProgress) {
    return Promise.all([loadUsers(), loadSplits(fromYM, toYM, onProgress), loadTargets(fromYM, toYM)]).then(function (r) {
      return { users: r[0], splits: r[1].splits, skipped: r[1].skipped, targets: r[2] };
    });
  }

  return { load: load, classify: classify };
})();
