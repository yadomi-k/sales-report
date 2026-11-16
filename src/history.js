// 変更履歴（週次）：商談の「売上金額」「案件ステージ」の変更を読み取り、集計する
//
// データの元：商談の項目履歴（OpportunityFieldHistory）。Salesforceで2項目の「項目履歴管理」をオンにしておく
//
// 返すデータの形（デモも同じ）
//   users:   Salesタブと同じユーザ一覧
//   opps:    { 商談ID: { id, name, account, ownerId, stage, amount, possibility } }  … 今の値
//   changes: [{ id, oppId, at（Date）, field: "stage" | "amount", oldValue, newValue, editor }]
window.AppHistory = (function () {
  "use strict";

  function cfg() {
    return window.AppConfig;
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  // 日本時間の日付の始まり・終わり
  function startOf(day) {
    return new Date(day + "T00:00:00+09:00");
  }
  function endOf(day) {
    return new Date(day + "T23:59:59.999+09:00");
  }
  function todayJST() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  function addDays(day, n) {
    var d = new Date(day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  function fmtAt(at) {
    var d = new Date(at.getTime() + 9 * 3600 * 1000);
    return d.getUTCFullYear() + "/" + pad2(d.getUTCMonth() + 1) + "/" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
  }

  // ---------------------------------------------------------------
  // Salesforceから読む（期間の始まり〜今日まで。期間の終わり以降の変更は、終わりの時点の値を戻すのに使う）
  // ---------------------------------------------------------------
  function load(fromDay, toDay, mode) {
    if (mode === "demo") return demoLoad(fromDay);
    var o = cfg().opportunity;
    var amt = o.salesAmount;
    var fields = [
      "Id",
      "OpportunityId",
      "Field",
      "OldValue",
      "NewValue",
      "CreatedDate",
      "CreatedBy.Name",
      "Opportunity.Name",
      "Opportunity.Account.Name",
      "Opportunity.OwnerId",
      "Opportunity.StageName",
      "Opportunity." + amt,
      "Opportunity." + o.salesDate,
    ];
    if (o.confidence) fields.push("Opportunity." + o.confidence);
    var rts = (o.actualRecordTypeIds || []).map(AppSSO.soqlString);
    var soql =
      "SELECT " + fields.join(", ") + " FROM OpportunityFieldHistory" +
      " WHERE Field IN ('StageName', " + AppSSO.soqlString(amt) + ")" +
      " AND CreatedDate >= " + fromDay + "T00:00:00+09:00" +
      (rts.length ? " AND Opportunity.RecordTypeId IN (" + rts.join(", ") + ")" : "") +
      " ORDER BY CreatedDate";
    return Promise.all([AppSF.loadUsers(), AppSSO.query(soql)]).then(function (r) {
      var opps = {};
      var changes = [];
      r[1].forEach(function (h) {
        var op = h.Opportunity || {};
        if (!opps[h.OpportunityId])
          opps[h.OpportunityId] = {
            id: h.OpportunityId,
            name: op.Name || "",
            account: (op.Account && op.Account.Name) || "",
            ownerId: op.OwnerId,
            stage: op.StageName || "",
            amount: num(op[amt]),
            possibility: (o.confidence && op[o.confidence]) || "",
            salesDate: String(op[o.salesDate] || "").slice(0, 10),
          };
        var isStage = h.Field === "StageName";
        // 金額の履歴は、値が同じ（書式だけの変更）なら除く
        if (!isStage && num(h.OldValue) === num(h.NewValue)) return;
        changes.push({
          id: h.Id,
          oppId: h.OpportunityId,
          at: new Date(h.CreatedDate),
          field: isStage ? "stage" : "amount",
          oldValue: isStage ? h.OldValue || "" : num(h.OldValue),
          newValue: isStage ? h.NewValue || "" : num(h.NewValue),
          editor: (h.CreatedBy && h.CreatedBy.Name) || "",
        });
      });
      return { users: r[0], opps: opps, changes: changes };
    });
  }

  // ---------------------------------------------------------------
  // デモデータ：デモの商談の一部に、ここ数週間の変更があったことにする
  // ---------------------------------------------------------------
  function demoLoad(fromDay) {
    var y = new Date().getFullYear();
    return Promise.all([AppDemo.loadUsers(), AppDemo.load(y + "-01", y + "-12")]).then(function (r) {
      var users = r[0];
      var groups = cfg().history.groups;
      var info = groups[0].stages;
      var s = 20261116;
      var rnd = function () {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
      var opps = {};
      r[1].splits.forEach(function (sp) {
        var op = opps[sp.oppId];
        if (!op || sp.pct > op._pct)
          opps[sp.oppId] = {
            id: sp.oppId,
            name: sp.oppName,
            account: sp.accountName,
            ownerId: sp.ownerId,
            stage: sp.stage,
            amount: sp.oppAmount,
            possibility: sp.level === "その他" ? "" : sp.level,
            salesDate: sp.salesDate,
            _pct: sp.pct,
          };
      });
      var today = todayJST();
      var changes = [];
      var n = 0;
      var editors = users.slice(0, 12).map(function (u) {
        return u.name;
      });
      Object.keys(opps).forEach(function (id) {
        var op = opps[id];
        if (rnd() > 0.16) return;
        // 変更した日時（今日から20日前まで）
        var when = function () {
          var day = addDays(today, -Math.floor(rnd() * 20));
          return new Date(day + "T" + pad2(9 + Math.floor(rnd() * 10)) + ":" + pad2(Math.floor(rnd() * 60)) + ":00+09:00");
        };
        var list = [];
        var stageChanged = op.stage !== info[0] && rnd() < 0.7;
        var amountChanged = rnd() < 0.55 || !stageChanged;
        if (stageChanged) {
          var before = info.indexOf(op.stage) > 0 ? info[info.indexOf(op.stage) - 1] : info[1 + Math.floor(rnd() * 3)];
          list.push({ field: "stage", oldValue: before, newValue: op.stage, at: when() });
        }
        if (amountChanged) {
          var f = 0.6 + rnd() * 0.8;
          var old = Math.round((op.amount * f) / 1e4) * 1e4;
          if (old !== op.amount) list.push({ field: "amount", oldValue: old, newValue: op.amount, at: when() });
        }
        list.forEach(function (c) {
          n++;
          changes.push(Object.assign({ id: "HIS" + n, oppId: id, editor: editors[Math.floor(rnd() * editors.length)] }, c));
        });
      });
      changes.sort(function (a, b) {
        return a.at - b.at;
      });
      return { users: users, opps: opps, changes: changes };
    });
  }

  // ---------------------------------------------------------------
  // 集計
  // f: { from, to（"YYYY-MM-DD"）, salesFrom, salesTo（売上日の月 "YYYY-MM"。空欄は指定なし）,
  //      honbu, dept, section, team, owner, kind: "all"|"amount"|"stage", group: ""|"info"|"won"|"lost" }
  // ---------------------------------------------------------------
  function groupOf(stage) {
    var g = cfg().history.groups.filter(function (x) {
      return x.stages.indexOf(stage) >= 0;
    })[0];
    return g ? g.key : "other";
  }

  function build(data, f) {
    var startT = startOf(f.from);
    var endT = endOf(f.to);
    var aff = (function () {
      var byId = {};
      data.users.forEach(function (u) {
        byId[u.id] = Object.assign({}, u, { honbu: AppAgg.honbuOf(u.dept) });
      });
      return function (id) {
        return byId[id] || { id: id, name: "（不明なユーザ）", honbu: "", dept: "", section: "", team: "", title: "" };
      };
    })();
    var orgOk = function (u) {
      if (!AppAgg.isTargetOrg(u)) return false;
      if (f.honbu && u.honbu !== f.honbu) return false;
      if (f.dept && u.dept !== f.dept) return false;
      if (f.section && u.section !== f.section) return false;
      if (f.team && u.team !== f.team) return false;
      if (f.owner && u.id !== f.owner) return false;
      return true;
    };

    // 商談ごとに変更をまとめ、期間の始まり・終わりの時点の値を今の値から戻して求める
    var byOpp = {};
    data.changes.forEach(function (c) {
      (byOpp[c.oppId] = byOpp[c.oppId] || []).push(c);
    });
    var summaries = [];
    Object.keys(byOpp).forEach(function (id) {
      var op = data.opps[id];
      if (!op) return;
      var list = byOpp[id].slice().sort(function (a, b) {
        return b.at - a.at; // 新しい順
      });
      var state = { stage: op.stage, amount: op.amount };
      var inWindow = [];
      var end = null;
      list.forEach(function (c) {
        if (c.at > endT) {
          // 期間の終わりより後の変更は、戻して「終わりの時点の値」にする
          state[c.field] = c.oldValue;
          return;
        }
        if (!end) end = { stage: state.stage, amount: state.amount };
        if (c.at < startT) return;
        // 変更した時点の、変更後の金額（ステージの変更行に出す）
        inWindow.push(Object.assign({}, c, { amountAt: state.amount, stageAt: state.stage }));
        state[c.field] = c.oldValue;
      });
      if (!inWindow.length) return;
      if (!end) end = { stage: state.stage, amount: state.amount };
      var start = { stage: state.stage, amount: state.amount };
      var owner = aff(op.ownerId);
      summaries.push({ opp: op, owner: owner, start: start, end: end, gStart: groupOf(start.stage), gEnd: groupOf(end.stage), changes: inWindow });
    });

    // 売上日（月）の条件
    var salesOk = function (op) {
      var ym = String(op.salesDate || "").slice(0, 7);
      if (f.salesFrom && (!ym || ym < f.salesFrom)) return false;
      if (f.salesTo && (!ym || ym > f.salesTo)) return false;
      return true;
    };
    var scoped = summaries.filter(function (s) {
      return orgOk(s.owner) && salesOk(s.opp);
    });

    // 上部の集計：区分ごとに、期間中に増えた・減った金額（終わりの時点 − 始まりの時点）
    var tiles = cfg().history.groups.map(function (g) {
      var t = { key: g.key, label: g.label, stages: g.stages, delta: 0, inCount: 0, outCount: 0, amountUp: 0, amountDown: 0 };
      scoped.forEach(function (s) {
        var a = s.gStart === g.key ? s.start.amount : 0;
        var b = s.gEnd === g.key ? s.end.amount : 0;
        t.delta += b - a;
        if (s.gStart !== g.key && s.gEnd === g.key) t.inCount++;
        if (s.gStart === g.key && s.gEnd !== g.key) t.outCount++;
      });
      return t;
    });

    // 明細：区分を選んでいれば、その区分に入った・出た・中で変わった商談だけ
    var selected = scoped.filter(function (s) {
      return !f.group || s.gStart === f.group || s.gEnd === f.group;
    });
    var rows = [];
    selected.forEach(function (s) {
      s.changes.forEach(function (c) {
        if (f.kind === "amount" && c.field !== "amount") return;
        if (f.kind === "stage" && c.field !== "stage") return;
        var row = {
          id: c.id,
          at: c.at,
          atText: fmtAt(c.at),
          opp: s.opp,
          owner: s.owner,
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          editor: c.editor,
          possibility: s.opp.possibility,
        };
        if (c.field === "amount") {
          row.diff = c.newValue - c.oldValue;
          row.tone = row.diff > 0 ? "up" : row.diff < 0 ? "down" : "";
        } else {
          row.amount = c.amountAt;
          var go = groupOf(c.oldValue);
          var gn = groupOf(c.newValue);
          row.fromGroup = go;
          row.toGroup = gn;
          // 受注になった → 緑、失注などになった → 赤
          row.tone = gn === "won" && go !== "won" ? "up" : gn === "lost" && go !== "lost" ? "down" : "";
          row.toWon = gn === "won" && go !== "won" ? c.amountAt : 0;
          row.toLost = gn === "lost" && go !== "lost" ? c.amountAt : 0;
        }
        rows.push(row);
      });
    });

    // 担当者（商談所有者）ごとにまとめる：所属 → チーム → 役職 → 作成日の順。担当者の中は編集日の新しい順
    var byOwner = {};
    rows.forEach(function (r) {
      var g = byOwner[r.owner.id] || (byOwner[r.owner.id] = { owner: r.owner, rows: [] });
      g.rows.push(r);
    });
    var sumOf = function (list) {
      return list.reduce(
        function (a, r) {
          return {
            count: a.count + 1,
            diff: a.diff + (r.diff || 0),
            toWon: a.toWon + (r.toWon || 0),
            toLost: a.toLost + (r.toLost || 0),
          };
        },
        { count: 0, diff: 0, toWon: 0, toLost: 0 }
      );
    };
    var owners = Object.keys(byOwner)
      .map(function (k) {
        var g = byOwner[k];
        g.rows.sort(function (a, b) {
          return b.at - a.at;
        });
        g.subtotal = sumOf(g.rows);
        return g;
      })
      .sort(function (a, b) {
        var ua = a.owner, ub = b.owner;
        return (
          AppAgg.orgRank(ua.honbu) - AppAgg.orgRank(ub.honbu) ||
          AppAgg.orgRank(ua.dept) - AppAgg.orgRank(ub.dept) ||
          String(ua.section || "").localeCompare(String(ub.section || ""), "ja") ||
          String(ua.team || "").localeCompare(String(ub.team || ""), "ja") ||
          AppAgg.comparePeople(ua, ub)
        );
      });

    // 検索条件の選択肢（変更があった担当者の所属から）
    var people = summaries.map(function (s) {
      return s.owner;
    });
    return {
      from: f.from,
      to: f.to,
      tiles: tiles,
      owners: owners,
      total: sumOf(rows),
      rowCount: rows.length,
      oppCount: selected.length,
      people: people,
    };
  }

  function defaultRange() {
    var to = todayJST();
    return { from: addDays(to, -(cfg().history.days || 7)), to: to };
  }

  return { load: load, build: build, defaultRange: defaultRange, addDays: addDays, todayJST: todayJST, groupOf: groupOf };
})();
