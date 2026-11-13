// 集計（画面の表・グラフ・Excel出力で共通に使う）
window.AppAgg = (function () {
  "use strict";

  var LEVELS = ["受注", "高", "中", "低"];

  function ymAdd(ym, n) {
    var p = ym.split("-").map(Number);
    var i = p[0] * 12 + (p[1] - 1) + n;
    return Math.floor(i / 12) + "-" + String((i % 12) + 1).padStart(2, "0");
  }
  function monthsBetween(fromYM, toYM) {
    var out = [];
    for (var ym = fromYM; ym <= toYM && out.length < 120; ym = ymAdd(ym, 1)) out.push(ym);
    return out;
  }
  function ymLabel(ym) {
    var p = ym.split("-").map(Number);
    return p[0] + "/" + p[1];
  }

  // 列（月・四半期計・半期計・合計）を作る
  // opt: { quarter: true, half: true }
  function buildColumns(fromYM, toYM, opt) {
    opt = opt || {};
    var months = monthsBetween(fromYM, toYM);
    var multiYear = fromYM.slice(0, 4) !== toYM.slice(0, 4);
    var inRange = function (y, ms) {
      return ms
        .map(function (m) {
          return y + "-" + String(m).padStart(2, "0");
        })
        .filter(function (ym) {
          return months.indexOf(ym) >= 0;
        });
    };
    var cols = [];
    months.forEach(function (ym) {
      cols.push({ key: ym, label: ymLabel(ym), kind: "month", months: [ym] });
      var y = Number(ym.slice(0, 4));
      var m = Number(ym.slice(5, 7));
      var pre = multiYear ? y + " " : "";
      if (opt.quarter && m % 3 === 0) {
        var q = m / 3;
        cols.push({ key: y + "Q" + q, label: pre + ["１", "２", "３", "４"][q - 1] + "Q合計", kind: "quarter", months: inRange(y, [m - 2, m - 1, m]) });
      }
      if (opt.half && m === 6) cols.push({ key: y + "H1", label: pre + "上期計", kind: "half", months: inRange(y, [1, 2, 3, 4, 5, 6]) });
      if (opt.half && m === 12) cols.push({ key: y + "H2", label: pre + "下期計", kind: "half", months: inRange(y, [7, 8, 9, 10, 11, 12]) });
    });
    var fullYear = !multiYear && fromYM.slice(5) === "01" && toYM.slice(5) === "12";
    cols.push({ key: "total", label: fullYear ? "年間計" : "期間計", kind: "total", months: months });
    return cols;
  }

  // ---------------------------------------------------------------
  // 所属（部・課・チーム）
  // 今は「現在の所属」で判定する。第2段階で「売上日の時点の所属」（所属履歴）に差し替える場所。
  // ---------------------------------------------------------------
  function norm(s) {
    return String(s || "").normalize("NFKC").trim();
  }
  function ucfg() {
    return (window.AppConfig && AppConfig.user) || {};
  }

  // 集計の対象にする部署か（設定 user.targetDepts）。sections を書いた部は、その課の人だけ
  function isTargetOrg(u) {
    var list = ucfg().targetDepts || [];
    if (!list.length) return true;
    var dept = norm(u.dept);
    var section = norm(u.section);
    return list.some(function (o) {
      if (dept !== norm(o.dept)) return false;
      var secs = (o.sections || []).map(norm);
      return !secs.length || secs.indexOf(section) >= 0;
    });
  }

  // 部から本部を決める（設定 user.headquarters）
  function honbuOf(dept) {
    var d = norm(dept);
    var hit = (ucfg().headquarters || []).filter(function (h) {
      return (h.depts || []).map(norm).indexOf(d) >= 0;
    })[0];
    return hit ? hit.name : "";
  }

  // 並び順（本部 → 部 → 課の、設定に書いた順。設定にないものは後ろ）
  function orgRank(name) {
    var order = [];
    (ucfg().headquarters || []).forEach(function (h) {
      order.push(norm(h.name));
    });
    (ucfg().targetDepts || []).forEach(function (o) {
      order.push(norm(o.dept));
      (o.sections || []).forEach(function (x) {
        order.push(norm(x));
      });
    });
    var i = order.indexOf(norm(name));
    return i < 0 ? order.length : i;
  }

  // 人の並び順：役職の順（設定 user.titleOrder）→ 同じ役職ならアカウントの作成日が古い順 → 名前順
  function titleRank(title) {
    var order = (ucfg().titleOrder || []).map(norm);
    var t = norm(title);
    if (!t) return order.length + 1; // 役職なしは一番後ろ
    var i = order.indexOf(t);
    return i < 0 ? order.length : i;
  }
  function comparePeople(a, b) {
    a = a || {};
    b = b || {};
    return (
      titleRank(a.title) - titleRank(b.title) ||
      String(a.createdAt || "9999").localeCompare(String(b.createdAt || "9999")) ||
      String(a.name || "").localeCompare(String(b.name || ""), "ja")
    );
  }

  function makeAffiliation(users) {
    var byId = {};
    users.forEach(function (u) {
      byId[u.id] = u.honbu !== undefined ? u : Object.assign({}, u, { honbu: honbuOf(u.dept) });
    });
    return function (userId /*, date */) {
      return byId[userId] || { id: userId, name: "（不明なユーザ）", honbu: "", dept: "", section: "", team: "", active: false };
    };
  }

  // 検索条件で絞り込む
  // f: { honbu, dept, section, team, owner, stages[], levels[], competitions[], tags[], salesTypes[] }
  function applyFilters(data, f) {
    var aff = makeAffiliation(data.users);
    var orgOk = function (userId, date) {
      var u = aff(userId, date);
      // 対象の部署（設定 user.targetDepts）の人だけを集計する（全部門の合計・部ごとの表も同じ）
      if (!isTargetOrg(u)) return false;
      if (f.honbu && u.honbu !== f.honbu) return false;
      if (f.dept && u.dept !== f.dept) return false;
      if (f.section && u.section !== f.section) return false;
      if (f.team && u.team !== f.team) return false;
      if (f.owner && u.id !== f.owner) return false;
      return true;
    };
    var has = function (list) {
      return list && list.length > 0;
    };
    var splits = data.splits.filter(function (s) {
      if (!orgOk(s.ownerId, s.salesDate)) return false;
      // 受注確度の条件は、受注・高・中・低の商談にだけかける（失注などはステージの条件で絞る）
      if (has(f.levels) && LEVELS.indexOf(s.level) >= 0 && f.levels.indexOf(s.level) < 0) return false;
      if (has(f.stages) && f.stages.indexOf(s.stage) < 0) return false;
      if (has(f.competitions) && f.competitions.indexOf(s.competition) < 0) return false;
      if (has(f.salesTypes) && f.salesTypes.indexOf(s.salesType) < 0) return false;
      if (has(f.tags) && !s.tags.some(function (t) { return f.tags.indexOf(t) >= 0; })) return false;
      return true;
    });
    // 目標は組織（部・課・チーム・担当者）の条件だけで絞り込む
    var targets = data.targets.filter(function (t) {
      return orgOk(t.ownerId, t.ym + "-01");
    });
    return { splits: splits, targets: targets, aff: aff };
  }

  function emptyCell() {
    var lv = {};
    LEVELS.forEach(function (l) {
      lv[l] = { amount: 0, profit: 0, count: 0 };
    });
    return { target: { amount: 0, profit: 0 }, own: lv };
  }

  // 月ごとに集計 → 列ごとに合算。高・中・低は「受注からその確度までの積上」にする
  function computeTable(splits, targets, columns) {
    var byMonth = {};
    var get = function (ym) {
      return byMonth[ym] || (byMonth[ym] = { cell: emptyCell(), ids: {} });
    };
    targets.forEach(function (t) {
      var c = get(t.ym).cell;
      c.target.amount += t.amount;
      c.target.profit += t.profit;
    });
    splits.forEach(function (s) {
      if (LEVELS.indexOf(s.level) < 0) return; // 失注などは表・グラフに入れない（明細にだけ出す）
      var m = get(s.ym);
      var x = m.cell.own[s.level];
      x.amount += s.amount;
      x.profit += s.profit;
      var key = s.level + "|" + s.oppId;
      if (!m.ids[key]) {
        m.ids[key] = true;
        x.count += 1;
      }
    });
    return columns.map(function (col) {
      var c = emptyCell();
      col.months.forEach(function (ym) {
        var m = byMonth[ym];
        if (!m) return;
        c.target.amount += m.cell.target.amount;
        c.target.profit += m.cell.target.profit;
        LEVELS.forEach(function (l) {
          c.own[l].amount += m.cell.own[l].amount;
          c.own[l].profit += m.cell.own[l].profit;
          c.own[l].count += m.cell.own[l].count;
        });
      });
      var cum = { amount: 0, profit: 0, count: 0 };
      c.cum = {};
      LEVELS.forEach(function (l) {
        cum = { amount: cum.amount + c.own[l].amount, profit: cum.profit + c.own[l].profit, count: cum.count + c.own[l].count };
        c.cum[l] = cum;
      });
      return c;
    });
  }

  function ratio(a, b) {
    return b ? a / b : null;
  }

  // 表の行（画面とExcelで共通）。各行の cells は「列ごとに [売上, 利益] の2つ」を平らに並べたもの
  // cell: { v, kind: "yen" | "pct" | "count", red, blue }
  function tableRows(cells, levels) {
    var rows = [];
    rows.push({
      block: "確度",
      label: "目標",
      type: "target",
      cells: flat(cells, function (c) {
        return [{ v: c.target.amount, kind: "yen" }, { v: c.target.profit, kind: "yen" }];
      }),
    });
    LEVELS.forEach(function (l) {
      if (levels.indexOf(l) < 0) return;
      var won = l === "受注";
      var blockRows = [
        {
          label: won ? "金額" : "積上金額",
          type: "amount",
          cells: flat(cells, function (c) {
            var x = c.cum[l];
            return [
              { v: x.amount, kind: "yen", red: c.target.amount > 0 && x.amount < c.target.amount },
              { v: x.profit, kind: "yen", red: c.target.profit > 0 && x.profit < c.target.profit },
            ];
          }),
        },
        {
          label: won ? "達成率" : "積上達成率",
          type: "rate",
          cells: flat(cells, function (c) {
            var x = c.cum[l];
            return [{ v: ratio(x.amount, c.target.amount), kind: "pct" }, { v: ratio(x.profit, c.target.profit), kind: "pct" }];
          }),
        },
        {
          label: "件数/利益率",
          type: "count",
          cells: flat(cells, function (c) {
            var x = c.cum[l];
            return [{ v: x.count, kind: "count", blue: true }, { v: ratio(x.profit, x.amount), kind: "pct" }];
          }),
        },
      ];
      blockRows.forEach(function (r, i) {
        r.block = l;
        r.blockFirst = i === 0;
        r.blockSize = blockRows.length;
        rows.push(r);
      });
    });
    return rows;
  }
  function flat(cells, fn) {
    var out = [];
    cells.forEach(function (c) {
      out.push.apply(out, fn(c));
    });
    return out;
  }

  var GROUP_LABELS = { honbu: "本部", dept: "部", section: "課", team: "チーム", owner: "担当者" };

  function groupKey(u, by) {
    var none = function (s, label) {
      return s || "（" + label + "未設定）";
    };
    if (by === "honbu") return { key: u.honbu, label: none(u.honbu, "本部") };
    if (by === "dept") return { key: u.dept, label: none(u.dept, "部") };
    if (by === "section") return { key: u.dept + "|" + u.section, label: none(u.dept, "部") + " / " + none(u.section, "課") };
    if (by === "team")
      return { key: u.dept + "|" + u.section + "|" + u.team, label: none(u.dept, "部") + " / " + none(u.section, "課") + " / " + none(u.team, "チーム") };
    return { key: u.id, label: u.name + (u.title ? " " + u.title : "") + (u.team || u.section || u.dept ? "（" + [u.dept, u.section, u.team].filter(Boolean).join(" / ") + "）" : "") };
  }

  // 全体の表 + 部・課・チーム・担当者ごとの表を作る
  // view: { fromYM, toYM, quarter, half, groupBy: "" | "dept" | "section" | "team" | "owner", sort: "name" | "target" | "won" }
  function build(data, filters, view) {
    var columns = buildColumns(view.fromYM, view.toYM, view);
    var fd = applyFilters(data, filters);
    var total = { key: "all", label: totalLabel(filters, fd.aff), cells: computeTable(fd.splits, fd.targets, columns) };
    var groups = [];
    if (view.groupBy) {
      var map = {};
      var bucket = function (userId, date) {
        var u = fd.aff(userId, date);
        var g = groupKey(u, view.groupBy);
        return map[g.key] || (map[g.key] = { key: g.key, label: g.label, rank: [orgRank(u.honbu), orgRank(u.dept), orgRank(u.section)], user: u, splits: [], targets: [] });
      };
      fd.splits.forEach(function (s) {
        bucket(s.ownerId, s.salesDate).splits.push(s);
      });
      fd.targets.forEach(function (t) {
        bucket(t.ownerId, t.ym + "-01").targets.push(t);
      });
      groups = Object.keys(map).map(function (k) {
        var g = map[k];
        return { key: g.key, label: g.label, rank: g.rank, user: g.user, cells: computeTable(g.splits, g.targets, columns) };
      });
      var last = columns.length - 1;
      if (view.sort === "target") groups.sort(function (a, b) { return b.cells[last].target.amount - a.cells[last].target.amount; });
      else if (view.sort === "won") groups.sort(function (a, b) { return b.cells[last].cum["受注"].amount - a.cells[last].cum["受注"].amount; });
      else
        groups.sort(function (a, b) {
          return (
            a.rank[0] - b.rank[0] ||
            a.rank[1] - b.rank[1] ||
            a.rank[2] - b.rank[2] ||
            // 担当者ごとの表は、チーム → 役職の順 → 作成日が古い順
            (view.groupBy === "owner" ? String(a.user.team || "").localeCompare(String(b.user.team || ""), "ja") || comparePeople(a.user, b.user) : 0) ||
            a.label.localeCompare(b.label, "ja")
          );
        });
    }
    var details = fd.splits.slice().sort(function (a, b) {
      return a.salesDate < b.salesDate ? -1 : a.salesDate > b.salesDate ? 1 : a.oppName.localeCompare(b.oppName, "ja");
    });
    // 担当者別：部・課・チーム（または本部）で絞り込んだときだけ作る。チームごとに担当者を並べる
    var peopleTeams = null;
    if (filters.honbu || filters.dept || filters.section || filters.team) {
      var pmap = {};
      var pget = function (userId, date) {
        var u = fd.aff(userId, date);
        return pmap[u.id] || (pmap[u.id] = { user: u, splits: [], targets: [] });
      };
      fd.splits.forEach(function (sp) {
        pget(sp.ownerId, sp.salesDate).splits.push(sp);
      });
      fd.targets.forEach(function (t) {
        pget(t.ownerId, t.ym + "-01").targets.push(t);
      });
      var plist = Object.keys(pmap)
        .map(function (k) {
          return pmap[k];
        })
        .sort(function (a, b) {
          var ua = a.user, ub = b.user;
          return (
            orgRank(ua.honbu) - orgRank(ub.honbu) ||
            orgRank(ua.dept) - orgRank(ub.dept) ||
            orgRank(ua.section) - orgRank(ub.section) ||
            String(ua.section || "").localeCompare(String(ub.section || ""), "ja") ||
            String(ua.team || "").localeCompare(String(ub.team || ""), "ja") ||
            comparePeople(ua, ub)
          );
        });
      peopleTeams = [];
      plist.forEach(function (p) {
        var u = p.user;
        var label = [u.dept, u.section, u.team || "（チーム未設定）"].filter(Boolean).join(" / ");
        var last = peopleTeams[peopleTeams.length - 1];
        if (!last || last.label !== label) peopleTeams.push((last = { label: label, team: u.team || "（チーム未設定）", sub: [u.dept, u.section].filter(Boolean).join(" / "), people: [], splits: [], targets: [] }));
        last.people.push({ user: u, cells: computeTable(p.splits, p.targets, columns) });
        last.splits = last.splits.concat(p.splits);
        last.targets = last.targets.concat(p.targets);
      });
      peopleTeams.forEach(function (t) {
        t.subtotal = computeTable(t.splits, t.targets, columns);
        delete t.splits;
        delete t.targets;
      });
    }
    return { columns: columns, total: total, groups: groups, details: details, aff: fd.aff, groupLabel: GROUP_LABELS[view.groupBy] || "", peopleTeams: peopleTeams };
  }

  function totalLabel(f, aff) {
    if (f.owner) return aff(f.owner).name;
    var parts = [f.dept || f.honbu, f.section, f.team].filter(Boolean);
    return parts.length ? parts.join(" / ") : "全部門";
  }

  // 案件ステージの並び（設定の順：情報 → 受注 → 失注など。設定にないステージは後ろ）
  function stageList(present) {
    var o = (window.AppConfig && AppConfig.opportunity) || {};
    var order = [].concat(o.openStages || [], o.wonStages || [], o.otherStages || []);
    present.forEach(function (st) {
      if (st && order.indexOf(st) < 0) order.push(st);
    });
    return order;
  }

  // 選択肢（データに含まれる値の一覧）
  function options(data) {
    var uniq = function (arr) {
      return Array.from(new Set(arr.filter(Boolean))).sort(function (a, b) {
        return String(a).localeCompare(String(b), "ja");
      });
    };
    var tags = [];
    data.splits.forEach(function (s) {
      tags.push.apply(tags, s.tags);
    });
    return {
      stages: stageList(data.splits.map(function (s) { return s.stage; })),
      competitions: uniq(data.splits.map(function (s) { return s.competition; })),
      tags: uniq(tags),
      salesTypes: uniq(data.splits.map(function (s) { return s.salesType; })),
    };
  }

  function fmtYen(v) {
    return v == null ? "" : Math.round(v).toLocaleString("ja-JP");
  }
  function fmtPct(v) {
    return v == null ? "" : (v * 100).toFixed(1) + "%";
  }
  function fmtCell(c) {
    if (c.kind === "pct") return fmtPct(c.v);
    if (c.kind === "count") return c.v ? String(c.v) : "";
    return fmtYen(c.v);
  }

  return {
    LEVELS: LEVELS,
    ymAdd: ymAdd,
    buildColumns: buildColumns,
    build: build,
    tableRows: tableRows,
    options: options,
    isTargetOrg: isTargetOrg,
    honbuOf: honbuOf,
    comparePeople: comparePeople,
    orgRank: orgRank,
    fmtYen: fmtYen,
    fmtPct: fmtPct,
    fmtCell: fmtCell,
  };
})();
