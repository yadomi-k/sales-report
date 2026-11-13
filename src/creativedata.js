// Creativeタブのデータ：プロジェクト管理（Creative_Achievements__c）を読み取り、集計する
//
// 返すデータの形（デモも同じ）
//   users:   Salesタブと同じユーザ一覧（部・課・チーム）
//   records: [{ id, name, ownerId, date, ym, amount, target, result }]
//            amount = 金額、target = 目標金額、result = コンペ結果（受注・失注・消滅など。空欄あり）
window.AppCreative = (function () {
  "use strict";

  function cfg() {
    return window.AppConfig.creative;
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  // ログインした人が、プロジェクト管理の金額を参照できるか（できない人にはCreativeタブを出さない）
  // Salesforceの項目レベルセキュリティで参照できない項目は、describe の結果に含まれない
  function checkAccess(mode) {
    if (mode === "demo") return Promise.resolve({ ok: true });
    var c = cfg();
    return AppSSO.describe(c.object)
      .then(function (d) {
        var names = ((d && d.fields) || []).map(function (f) {
          return f.name;
        });
        if (!d || d.queryable === false) return { ok: false, reason: "プロジェクト管理を参照する権限がありません。" };
        if (names.indexOf(c.amountField) < 0) return { ok: false, reason: "プロジェクト管理の金額を参照する権限がありません。" };
        return { ok: true, fields: names };
      })
      .catch(function (e) {
        return { ok: false, reason: e.message };
      });
  }

  function load(year, mode) {
    if (mode === "demo") return demoLoad(year);
    var c = cfg();
    var fields = ["Id", "Name", "OwnerId", c.dateField, c.amountField];
    if (c.targetField) fields.push(c.targetField);
    if (c.resultField) fields.push(c.resultField);
    var soql =
      "SELECT " + fields.join(", ") + " FROM " + c.object +
      " WHERE " + c.dateField + " >= " + year + "-01-01 AND " + c.dateField + " <= " + year + "-12-31";
    return Promise.all([AppSF.loadUsers(), AppSSO.query(soql)]).then(function (r) {
      return {
        users: r[0],
        records: r[1].map(function (x) {
          var date = String(x[c.dateField] || "").slice(0, 10);
          return {
            id: x.Id,
            name: x.Name || "",
            ownerId: x.OwnerId,
            date: date,
            ym: date.slice(0, 7),
            amount: num(x[c.amountField]),
            target: c.targetField ? num(x[c.targetField]) : 0,
            result: c.resultField ? x[c.resultField] || "" : "",
          };
        }),
      };
    });
  }

  // ---------------------------------------------------------------
  // デモデータ（クリエイティブ部の担当者の、架空のプロジェクト）
  // ---------------------------------------------------------------
  var demoCache = {};
  function demoLoad(year) {
    return AppDemo.loadUsers().then(function (users) {
      if (!demoCache[year]) demoCache[year] = demoBuild(users, year);
      return { users: users, records: demoCache[year] };
    });
  }
  function demoBuild(users, year) {
    var s = year * 7919;
    var r = function () {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    var c = cfg();
    var secNames = c.sections.map(function (x) {
      return x.userSection;
    });
    var owners = users.filter(function (u) {
      return u.dept === "クリエイティブ部" && secNames.indexOf(u.section) >= 0;
    });
    var KINDS = ["展示会ブース", "ショールーム", "企画展", "サイン計画", "パンフレット", "Webビジュアル", "記念館展示", "店舗内装"];
    var RESULTS = ["受注", "受注", "失注", "失注", "失注", "消滅"];
    var out = [];
    var n = 0;
    for (var m = 1; m <= 12; m++) {
      var ym = year + "-" + pad2(m);
      var season = 1 + 0.4 * Math.sin((m / 12) * Math.PI * 2 + 0.5);
      owners.forEach(function (u, i) {
        // 目標は担当者・月ごとに1件として持たせる（デモ用）
        out.push({ id: "TGT" + ym + i, name: "", ownerId: u.id, date: ym + "-01", ym: ym, amount: 0, target: Math.round((3.6 + (i % 4) * 0.8) * 1e6 * season / 1e4) * 1e4, result: "", isTarget: true });
      });
      var count = Math.round(18 + 10 * season);
      for (var k = 0; k < count; k++) {
        n++;
        var u = owners[Math.floor(r() * owners.length)];
        var amt = Math.round(Math.exp(13.2 + r() * 2.2) / 1e3) * 1e3;
        out.push({
          id: "PRJ" + year + n,
          name: KINDS[Math.floor(r() * KINDS.length)] + " デザイン（" + n + "）",
          ownerId: u.id,
          date: ym + "-" + pad2(1 + Math.floor(r() * 28)),
          ym: ym,
          amount: amt,
          target: 0,
          result: r() < 0.45 ? RESULTS[Math.floor(r() * RESULTS.length)] : "",
        });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 集計
  // f: { year, sections: [] (空=すべて), team, owner }
  // ---------------------------------------------------------------
  function sectionKeyOf(u) {
    var hit = cfg().sections.filter(function (x) {
      return x.userSection === (u && u.section);
    })[0];
    return hit ? hit.key : "";
  }

  function build(data, f) {
    var c = cfg();
    var byId = {};
    data.users.forEach(function (u) {
      byId[u.id] = u;
    });
    var who = function (id) {
      return byId[id] || { id: id, name: "（不明なユーザ）", dept: "", section: "", team: "" };
    };
    var months = [];
    for (var m = 1; m <= 12; m++) months.push(f.year + "-" + pad2(m));
    // 対象：設定の課（SD・GDなど）の担当者のレコードだけ
    var rows = data.records.filter(function (x) {
      var u = who(x.ownerId);
      var key = sectionKeyOf(u);
      if (!key) return false;
      if (f.sections && f.sections.length && f.sections.indexOf(key) < 0) return false;
      if (f.team && u.team !== f.team) return false;
      if (f.owner && u.id !== f.owner) return false;
      return true;
    });
    var monthly = months.map(function () {
      return { amount: 0, target: 0, count: 0 };
    });
    var bySection = {};
    c.sections.forEach(function (x) {
      bySection[x.key] = { key: x.key, label: x.label, amount: 0, target: 0, monthly: months.map(function () { return { amount: 0, target: 0 }; }) };
    });
    var results = {};
    var resultMonthly = {};
    var owners = {};
    var details = [];
    rows.forEach(function (x) {
      var i = months.indexOf(x.ym);
      if (i < 0) return;
      var u = who(x.ownerId);
      var key = sectionKeyOf(u);
      monthly[i].amount += x.amount;
      monthly[i].target += x.target;
      bySection[key].amount += x.amount;
      bySection[key].target += x.target;
      bySection[key].monthly[i].amount += x.amount;
      bySection[key].monthly[i].target += x.target;
      if (x.isTarget) return;
      monthly[i].count += 1;
      if (x.result) {
        results[x.result] = (results[x.result] || 0) + 1;
        var rm = resultMonthly[x.result] || (resultMonthly[x.result] = months.map(function () { return 0; }));
        rm[i] += 1;
      }
      var o = owners[u.id] || (owners[u.id] = { id: u.id, name: u.name, team: u.team || "（チーム未設定）", section: key, amount: 0 });
      o.amount += x.amount;
      details.push(Object.assign({ owner: u, section: key }, x));
    });
    var secOrder = c.sections.map(function (x) {
      return x.key;
    });
    var ownerList = Object.keys(owners)
      .map(function (k) {
        return owners[k];
      })
      .sort(function (a, b) {
        return secOrder.indexOf(a.section) - secOrder.indexOf(b.section) || a.team.localeCompare(b.team, "ja") || b.amount - a.amount;
      });
    details.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name, "ja");
    });
    var total = monthly.reduce(
      function (a, x) {
        return { amount: a.amount + x.amount, target: a.target + x.target, count: a.count + x.count };
      },
      { amount: 0, target: 0, count: 0 }
    );
    return {
      year: f.year,
      period: f.year - (c.periodOffset || 0),
      months: months,
      monthly: monthly,
      total: total,
      sections: c.sections.map(function (x) {
        return bySection[x.key];
      }),
      results: results,
      resultMonthly: resultMonthly,
      owners: ownerList,
      details: details,
      who: who,
      teams: Array.from(
        new Set(
          data.users
            .filter(function (u) {
              return sectionKeyOf(u);
            })
            .map(function (u) {
              return u.team;
            })
            .filter(Boolean)
        )
      ).sort(function (a, b) {
        return a.localeCompare(b, "ja");
      }),
      ownerChoices: data.users
        .filter(function (u) {
          return sectionKeyOf(u) && (!f.team || u.team === f.team);
        })
        .sort(function (a, b) {
          return (a.team || "").localeCompare(b.team || "", "ja") || a.name.localeCompare(b.name, "ja");
        }),
    };
  }

  return { checkAccess: checkAccess, load: load, build: build, sectionKeyOf: sectionKeyOf };
})();
