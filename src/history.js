// Weekly Business Review：商談の「売上金額」「案件ステージ」の変更を読み取り、集計する
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
    var poss = cfg().history.possibility || o.confidence; // 受注確度の項目
    if (poss) fields.push("Opportunity." + poss);
    var rts = (o.actualRecordTypeIds || []).map(AppSSO.soqlString);
    var soql =
      "SELECT " + fields.join(", ") + " FROM OpportunityFieldHistory" +
      " WHERE Field IN ('StageName', " + AppSSO.soqlString(amt) + ")" +
      " AND CreatedDate >= " + fromDay + "T00:00:00+09:00" +
      (rts.length ? " AND Opportunity.RecordTypeId IN (" + rts.join(", ") + ")" : "") +
      " ORDER BY CreatedDate";
    // 期間中に新規登録された商談（登録時の値は変更履歴に残らないため、商談から直接読む）
    var oppFields = ["Id", "Name", "Account.Name", "OwnerId", "StageName", amt, o.salesDate, "CreatedDate", "CreatedBy.Name"];
    if (poss) oppFields.push(poss);
    var soqlNew =
      "SELECT " + oppFields.join(", ") + " FROM Opportunity" +
      " WHERE CreatedDate >= " + fromDay + "T00:00:00+09:00" +
      (rts.length ? " AND RecordTypeId IN (" + rts.join(", ") + ")" : "") +
      " AND StageName != " + AppSSO.soqlString(cfg().target.stageName || "目標");
    return Promise.all([AppSF.loadUsers(), AppSSO.query(soql), AppSSO.query(soqlNew)]).then(function (r) {
      var opps = {};
      var changes = [];
      r[2].forEach(function (op) {
        opps[op.Id] = {
          id: op.Id,
          name: op.Name || "",
          account: (op.Account && op.Account.Name) || "",
          ownerId: op.OwnerId,
          stage: op.StageName || "",
          amount: num(op[amt]),
          possibility: (poss && op[poss]) || "",
          salesDate: String(op[o.salesDate] || "").slice(0, 10),
          createdAt: new Date(op.CreatedDate),
          createdBy: (op.CreatedBy && op.CreatedBy.Name) || "",
        };
      });
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
            possibility: (poss && op[poss]) || "",
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
            // デモ：受注確度の項目の値（受注済みの商談も、受注前の確度が残っている想定）
            possibility: sp.level === "受注" ? "高" : sp.level === "その他" ? "低" : sp.level,
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
        // 一部の商談は、ここ数週間に新規登録されたことにする（最初から受注で登録された商談も含む）
        if (rnd() < 0.05) {
          var cd = addDays(today, -Math.floor(rnd() * 20));
          op.createdAt = new Date(cd + "T" + pad2(9 + Math.floor(rnd() * 9)) + ":" + pad2(Math.floor(rnd() * 60)) + ":00+09:00");
          op.createdBy = editors[Math.floor(rnd() * editors.length)];
          return;
        }
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
    var excluded = cfg().history.excludeStages || [];
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
    var salesOk = function (op) {
      var ym = String(op.salesDate || "").slice(0, 7);
      if (f.salesFrom && (!ym || ym < f.salesFrom)) return false;
      if (f.salesTo && (!ym || ym > f.salesTo)) return false;
      return true;
    };

    // 商談ごとに、期間の始まり・終わりの時点の値を、今の値から変更を戻して求める
    //   isNew：期間中に新規登録された商談。始まりの時点は「まだ無い」（金額0）として扱い、登録時の値も求める
    var byOpp = {};
    data.changes.forEach(function (c) {
      (byOpp[c.oppId] = byOpp[c.oppId] || []).push(c);
    });
    var ids = {};
    Object.keys(byOpp).forEach(function (id) {
      ids[id] = 1;
    });
    Object.keys(data.opps).forEach(function (id) {
      var op = data.opps[id];
      if (op.createdAt && op.createdAt >= startT && op.createdAt <= endT) ids[id] = 1;
    });
    var summaries = [];
    Object.keys(ids).forEach(function (id) {
      var op = data.opps[id];
      if (!op) return;
      var isNew = !!(op.createdAt && op.createdAt >= startT && op.createdAt <= endT);
      var list = (byOpp[id] || []).slice().sort(function (a, b) {
        return b.at - a.at; // 新しい順
      });
      var state = { stage: op.stage, amount: op.amount };
      var inWindow = [];
      var end = null;
      list.forEach(function (c) {
        if (c.at > endT) {
          state[c.field] = c.oldValue; // 期間の終わりより後の変更は戻す
          return;
        }
        if (!end) end = { stage: state.stage, amount: state.amount };
        if (c.at < startT) return;
        inWindow.push(Object.assign({}, c, { amountAt: state.amount, stageAt: state.stage }));
        state[c.field] = c.oldValue;
      });
      if (!end) end = { stage: state.stage, amount: state.amount };
      if (!isNew && !inWindow.length) return;
      var initial = isNew ? { stage: state.stage, amount: state.amount } : null; // 登録時の値
      var start = isNew ? { stage: "", amount: 0 } : { stage: state.stage, amount: state.amount };
      // 企画開発費請求などは、一覧にも集計にも出さない
      if (excluded.indexOf(end.stage) >= 0 || excluded.indexOf(start.stage) >= 0 || (initial && excluded.indexOf(initial.stage) >= 0)) return;
      summaries.push({
        opp: op,
        owner: aff(op.ownerId),
        isNew: isNew,
        initial: initial,
        start: start,
        end: end,
        gStart: isNew ? "none" : groupOf(start.stage),
        gEnd: groupOf(end.stage),
        changes: inWindow,
      });
    });

    var scoped = summaries.filter(function (s) {
      return orgOk(s.owner) && salesOk(s.opp);
    });
    var groups = cfg().history.groups;
    var invert = {};
    groups.forEach(function (g) {
      invert[g.key] = !!g.invert;
    });

    // 区分ごとの増減（1商談ぶん）
    //   情報：新規登録された商談だけ（情報→受注などで減る分は数えない）
    //   受注・失注：終わりの時点 − 始まりの時点（新規登録は始まりが0）
    var contrib = function (s, key) {
      if (key === "info") return s.isNew && s.gEnd === "info" ? s.end.amount : 0;
      var v = (s.gEnd === key ? s.end.amount : 0) - (s.gStart === key ? s.start.amount : 0);
      return invert[key] ? -v : v; // 失注は、増えたら売上が減るので▲
    };
    var involved = function (s, key) {
      if (key === "info") return s.isNew && s.gEnd === "info";
      return s.gStart === key || s.gEnd === key;
    };

    var tiles = groups.map(function (g) {
      var t = { key: g.key, label: g.label, stages: g.stages, invert: !!g.invert, delta: 0, inCount: 0, outCount: 0, newCount: 0 };
      scoped.forEach(function (s) {
        t.delta += contrib(s, g.key);
        if (s.gEnd === g.key && s.gStart !== g.key) {
          t.inCount++;
          if (s.isNew) t.newCount++;
        }
        if (s.gStart === g.key && s.gEnd !== g.key) t.outCount++;
      });
      return t;
    });

    // 売上日の月ごとの増減（グラフ）
    var monthly = (function () {
      var keys = groups.map(function (g) {
        return g.key;
      });
      var map = {};
      scoped.forEach(function (s) {
        var ym = String(s.opp.salesDate || "").slice(0, 7) || "none";
        var m = map[ym] || (map[ym] = { ym: ym, all: 0, count: 0 });
        keys.forEach(function (k) {
          m[k] = (m[k] || 0) + contrib(s, k);
        });
        m.all += s.end.amount - s.start.amount;
        m.count += 1;
      });
      var yms = Object.keys(map)
        .filter(function (k) {
          return k !== "none";
        })
        .sort();
      var first = f.salesFrom || yms[0];
      var last = f.salesTo || yms[yms.length - 1];
      var list = [];
      if (first && last) for (var ym = first; ym <= last && list.length < 36; ym = AppAgg.ymAdd(ym, 1)) list.push(map[ym] || { ym: ym, all: 0, count: 0 });
      if (map.none) list.push(map.none);
      list.forEach(function (m) {
        keys.forEach(function (k) {
          m[k] = m[k] || 0;
        });
      });
      return list;
    })();

    // 明細：区分を選んでいれば、その区分に関わる商談だけ
    var selected = scoped.filter(function (s) {
      return !f.group || involved(s, f.group);
    });
    var rows = [];
    selected.forEach(function (s) {
      var base = { opp: s.opp, owner: s.owner, possibility: s.opp.possibility };
      // 新規登録の行（登録時のステージと金額）
      if (s.isNew && (f.kind === "all" || f.kind === "created" || !f.kind)) {
        var gi = groupOf(s.initial.stage);
        rows.push(
          Object.assign({}, base, {
            id: s.opp.id + ":created",
            at: s.opp.createdAt,
            atText: fmtAt(s.opp.createdAt),
            field: "created",
            oldValue: "",
            newValue: s.initial.stage,
            amount: s.initial.amount,
            editor: s.opp.createdBy || "",
            toGroup: gi,
            tone: gi === "won" ? "up" : "",
            // 情報で登録され、期間の終わりにも情報のままの商談だけ「新規（情報）」に数える（上部の情報の集計と合わせる）
            newInfo: gi === "info" && s.gEnd === "info" ? s.initial.amount : 0,
            toWon: gi === "won" ? s.initial.amount : 0,
            toLost: 0,
          })
        );
      }
      s.changes.forEach(function (c) {
        if (f.kind === "created") return;
        if (f.kind === "amount" && c.field !== "amount") return;
        if (f.kind === "stage" && c.field !== "stage") return;
        // ステージの変更は、区分（情報・受注・失注）が変わったものだけ出す
        if (c.field === "stage" && groupOf(c.oldValue) === groupOf(c.newValue)) return;
        var row = Object.assign({}, base, {
          id: c.id,
          at: c.at,
          atText: fmtAt(c.at),
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          editor: c.editor,
        });
        if (c.field === "amount") {
          row.diff = c.newValue - c.oldValue;
          row.tone = row.diff > 0 ? "up" : row.diff < 0 ? "down" : "";
        } else {
          row.amount = c.amountAt;
          var go = groupOf(c.oldValue);
          var gn = groupOf(c.newValue);
          row.fromGroup = go;
          row.toGroup = gn;
          row.tone = gn === "won" && go !== "won" ? "up" : gn === "lost" && go !== "lost" ? "down" : "";
          row.toWon = gn === "won" && go !== "won" ? c.amountAt : 0;
          row.toLost = gn === "lost" && go !== "lost" ? c.amountAt : 0;
        }
        rows.push(row);
      });
    });

    // 担当者（商談所有者）ごと：所属 → チーム → 役職 → 作成日の順。担当者の中は日時の新しい順
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
            newInfo: a.newInfo + (r.newInfo || 0),
            toWon: a.toWon + (r.toWon || 0),
            toLost: a.toLost + (r.toLost || 0),
          };
        },
        { count: 0, diff: 0, newInfo: 0, toWon: 0, toLost: 0 }
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

    return {
      from: f.from,
      to: f.to,
      tiles: tiles,
      monthly: monthly,
      owners: owners,
      total: sumOf(rows),
      rowCount: rows.length,
      oppCount: Object.keys(
        rows.reduce(function (m, r) {
          m[r.opp.id] = 1;
          return m;
        }, {})
      ).length,
      people: summaries.map(function (s) {
        return s.owner;
      }),
    };
  }

  function defaultRange() {
    var to = todayJST();
    return { from: addDays(to, -(cfg().history.days || 7)), to: to };
  }

  return { load: load, build: build, defaultRange: defaultRange, addDays: addDays, todayJST: todayJST, groupOf: groupOf };
})();
