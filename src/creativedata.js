// Creativeタブのデータ：プロジェクト管理（Creative_Achievements__c）を読み取り、集計する
//
// プロジェクト管理は商談の目標と同じ構成
//   レコードタイプ「プロジェクト登録」… 金額（Amount__c）＝実績
//   レコードタイプ「目標」          … 目標金額（Target_Amount__c）＝目標
//   月は計上日（Recording_date__c）、担当者は所有者（OwnerId）
//
// 所属（部・課・チーム）の決め方
//   1. レコードの「当時の部・課・チーム」が入っていれば、それを使う（過去の実績を当時の部署で集計する）
//   2. 入っていなければ、所有者のユーザの今の「部・課・チーム」を使う
//
// 返すデータの形（デモも同じ）
//   users:   Salesタブと同じユーザ一覧
//   records: [{ id, name, ownerId, date, ym, amount, target, result, isTarget, org: { dept, section, team } | null }]
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
  function norm(s) {
    return String(s || "").normalize("NFKC").trim();
  }

  // ログインした人が参照できる項目（checkAccess で取得）
  var visibleFields = null;

  // ログインした人が、プロジェクト管理の金額を参照できるか（できない人にはCreativeタブを出さない）
  // Salesforceの項目レベルセキュリティで参照できない項目は、describe の結果に含まれない
  function checkAccess(mode) {
    if (mode === "demo") return Promise.resolve({ ok: true });
    var c = cfg();
    return AppSSO.describe(c.object)
      .then(function (d) {
        if (!d || d.queryable === false) return { ok: false, reason: "プロジェクト管理を参照する権限がありません。" };
        var names = (d.fields || []).map(function (f) {
          return f.name;
        });
        visibleFields = names;
        if (names.indexOf(c.amountField) < 0) return { ok: false, reason: "プロジェクト管理の金額を参照する権限がありません。" };
        return { ok: true };
      })
      .catch(function (e) {
        return { ok: false, reason: e.message };
      });
  }

  function canRead(field) {
    return !!field && (!visibleFields || visibleFields.indexOf(field) >= 0);
  }

  // 期間（"YYYY-MM"〜"YYYY-MM"）のデータを読み込む
  function lastDay(ym) {
    var p = ym.split("-").map(Number);
    return ym + "-" + pad2(new Date(p[0], p[1], 0).getDate());
  }
  function load(fromYM, toYM, mode) {
    if (mode === "demo") return demoLoad(fromYM, toYM);
    var c = cfg();
    var at = c.atTheTime || {};
    var fields = ["Id", "Name", "OwnerId", "RecordTypeId", c.dateField];
    // 参照できない項目はSOQLに入れない（入れるとエラーになるため）
    [c.amountField, c.targetField, c.resultField, at.department, at.section, at.team].forEach(function (f) {
      if (canRead(f) && fields.indexOf(f) < 0) fields.push(f);
    });
    var rts = [c.actualRecordTypeId, c.targetRecordTypeId].filter(Boolean).map(AppSSO.soqlString);
    var soql =
      "SELECT " + fields.join(", ") + " FROM " + c.object +
      " WHERE " + c.dateField + " >= " + fromYM + "-01 AND " + c.dateField + " <= " + lastDay(toYM) +
      (rts.length ? " AND RecordTypeId IN (" + rts.join(", ") + ")" : "");
    var get = function (x, f) {
      return f && fields.indexOf(f) >= 0 ? x[f] : null;
    };
    return Promise.all([AppSF.loadUsers(), AppSSO.query(soql)]).then(function (r) {
      return {
        users: r[0],
        records: r[1].map(function (x) {
          var date = String(x[c.dateField] || "").slice(0, 10);
          var isTarget = x.RecordTypeId && x.RecordTypeId.slice(0, 15) === String(c.targetRecordTypeId).slice(0, 15);
          var org = { dept: get(x, at.department) || "", section: get(x, at.section) || "", team: get(x, at.team) || "" };
          return {
            id: x.Id,
            name: x.Name || "",
            ownerId: x.OwnerId,
            date: date,
            ym: date.slice(0, 7),
            isTarget: !!isTarget,
            amount: isTarget ? 0 : num(get(x, c.amountField)),
            target: isTarget ? num(get(x, c.targetField)) : 0,
            result: get(x, c.resultField) || "",
            org: org.dept || org.section || org.team ? org : null,
          };
        }),
      };
    });
  }

  // ---------------------------------------------------------------
  // デモデータ（クリエイティブ部の担当者の、架空のプロジェクト）
  // ---------------------------------------------------------------
  var demoCache = {};
  function demoLoad(fromYM, toYM) {
    return AppDemo.loadUsers().then(function (users) {
      var records = [];
      for (var y = Number(fromYM.slice(0, 4)); y <= Number(toYM.slice(0, 4)); y++) {
        if (!demoCache[y]) demoCache[y] = demoBuild(users, y);
        records = records.concat(
          demoCache[y].filter(function (x) {
            return x.ym >= fromYM && x.ym <= toYM;
          })
        );
      }
      return { users: users, records: records };
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
    var thisYear = new Date().getFullYear();
    var out = [];
    var n = 0;
    for (var m = 1; m <= 12; m++) {
      var ym = year + "-" + pad2(m);
      var season = 1 + 0.4 * Math.sin((m / 12) * Math.PI * 2 + 0.5);
      owners.forEach(function (u, i) {
        out.push({ id: "TGT" + ym + i, name: "目標", ownerId: u.id, date: ym + "-01", ym: ym, amount: 0, target: Math.round((3.6 + (i % 4) * 0.8) * 1e6 * season / 1e4) * 1e4, result: "", isTarget: true, org: null });
      });
      var count = Math.round(18 + 10 * season);
      for (var k = 0; k < count; k++) {
        n++;
        var u = owners[Math.floor(r() * owners.length)];
        // 過去の年は、一部の人が別のチームにいた（当時のチーム）ことにする
        var org = year < thisYear && r() < 0.3 ? { dept: u.dept, section: u.section, team: u.team.replace(/\d/, "1") } : null;
        out.push({
          id: "PRJ" + year + n,
          name: KINDS[Math.floor(r() * KINDS.length)] + " デザイン（" + n + "）",
          ownerId: u.id,
          date: ym + "-" + pad2(1 + Math.floor(r() * 28)),
          ym: ym,
          amount: Math.round(Math.exp(13.2 + r() * 2.2) / 1e3) * 1e3,
          target: 0,
          result: c.resultField ? (r() < 0.45 ? RESULTS[Math.floor(r() * RESULTS.length)] : "") : "",
          isTarget: false,
          org: org,
        });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 集計
  // f: { fromYM, toYM, dept, sectionName, team, owner }（空欄はすべて）
  // ---------------------------------------------------------------
  function sectionKeyOf(org) {
    var s = norm(org && org.section);
    var hit = cfg().sections.filter(function (x) {
      return norm(x.userSection) === s;
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
    // レコードごとの所属（当時の部署 → なければ所有者の今の所属）
    var orgOf = function (x) {
      if (x.org) return x.org;
      var u = who(x.ownerId);
      return { dept: u.dept, section: u.section, team: u.team };
    };
    var months = [];
    for (var ym = f.fromYM; ym <= f.toYM && months.length < 240; ym = AppAgg.ymAdd(ym, 1)) months.push(ym);

    // すべてのレコードに所属（当時 → なければ今）と、SD・GDの区分を付ける
    var inScope = data.records.map(function (x) {
      var org = orgOf(x);
      return Object.assign({}, x, { owner: who(x.ownerId), orgNow: org, section: sectionKeyOf(org), sectionName: org.section || "（課未設定）" });
    });
    var sortJa = function (a, b) {
      return String(a).localeCompare(String(b), "ja");
    };
    var uniq = function (list) {
      return Array.from(new Set(list.filter(Boolean))).sort(sortJa);
    };
    var deptOk = function (x) {
      return !f.dept || norm(x.orgNow.dept) === norm(f.dept);
    };
    var secOk = function (x) {
      if (f.sectionName && norm(x.orgNow.section) !== norm(f.sectionName)) return false;
      if (f.sections && f.sections.length && f.sections.indexOf(x.section) < 0) return false;
      return true;
    };
    var teamOk = function (x) {
      return !f.team || x.orgNow.team === f.team;
    };
    // 絞り込みの選択肢：部 → 課 → チーム → 担当者 の順に、上の条件に合うものだけ
    var depts = uniq(
      inScope.map(function (x) {
        return x.orgNow.dept;
      })
    );
    var sectionNames = uniq(
      inScope.filter(deptOk).map(function (x) {
        return x.orgNow.section;
      })
    );
    var teams = uniq(
      inScope
        .filter(function (x) {
          return deptOk(x) && secOk(x);
        })
        .map(function (x) {
          return x.orgNow.team;
        })
    );
    var ownerMap = {};
    inScope.forEach(function (x) {
      if (!deptOk(x) || !secOk(x) || !teamOk(x)) return;
      ownerMap[x.ownerId] = { id: x.ownerId, name: x.owner.name, team: x.orgNow.team || "" };
    });
    var ownerChoices = Object.keys(ownerMap)
      .map(function (k) {
        return ownerMap[k];
      })
      .sort(function (a, b) {
        return a.team.localeCompare(b.team, "ja") || a.name.localeCompare(b.name, "ja");
      });

    var rows = inScope.filter(function (x) {
      if (!deptOk(x) || !secOk(x) || !teamOk(x)) return false;
      if (f.owner && x.ownerId !== f.owner) return false;
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
    var people = {}; // 担当者×チームごとの月別の目標・金額（表の「担当者別」に使う）
    var details = [];
    rows.forEach(function (x) {
      var i = months.indexOf(x.ym);
      if (i < 0) return;
      var sec = bySection[x.section]; // SD・GDなど（設定の課）。それ以外の課は合計にだけ入る
      monthly[i].amount += x.amount;
      monthly[i].target += x.target;
      if (sec) {
        sec.amount += x.amount;
        sec.target += x.target;
        sec.monthly[i].amount += x.amount;
        sec.monthly[i].target += x.target;
      }
      var pk = x.ownerId + "|" + x.sectionName + "|" + (x.orgNow.team || "");
      var pp =
        people[pk] ||
        (people[pk] = {
          id: x.ownerId,
          name: x.owner.name,
          team: x.orgNow.team || "（チーム未設定）",
          section: x.section,
          sectionName: x.sectionName,
          monthly: months.map(function () {
            return { amount: 0, target: 0 };
          }),
        });
      pp.monthly[i].amount += x.amount;
      pp.monthly[i].target += x.target;
      if (x.isTarget) return;
      monthly[i].count += 1;
      if (x.result) {
        results[x.result] = (results[x.result] || 0) + 1;
        var rm = resultMonthly[x.result] || (resultMonthly[x.result] = months.map(function () { return 0; }));
        rm[i] += 1;
      }
      var key = x.ownerId + "|" + (x.orgNow.team || "");
      var o = owners[key] || (owners[key] = { id: x.ownerId, name: x.owner.name, team: x.orgNow.team || "（チーム未設定）", section: x.section, amount: 0 });
      o.amount += x.amount;
      details.push(x);
    });
    var secOrder = c.sections.map(function (x) {
      return x.key;
    });
    // 並び順：SD・GD（設定の順）→ それ以外の課
    var secRank = function (k) {
      var i = secOrder.indexOf(k);
      return i < 0 ? secOrder.length : i;
    };
    var ownerList = Object.keys(owners)
      .map(function (k) {
        return owners[k];
      })
      .sort(function (a, b) {
        return secRank(a.section) - secRank(b.section) || a.team.localeCompare(b.team, "ja") || b.amount - a.amount;
      });
    details.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name, "ja");
    });
    // 担当者別：課 → チーム → 名前 の順にまとめる
    var teamsOrdered = [];
    Object.keys(people)
      .map(function (k) {
        return people[k];
      })
      .sort(function (a, b) {
        return secRank(a.section) - secRank(b.section) || a.sectionName.localeCompare(b.sectionName, "ja") || a.team.localeCompare(b.team, "ja") || a.name.localeCompare(b.name, "ja");
      })
      .forEach(function (p) {
        var last = teamsOrdered[teamsOrdered.length - 1];
        if (!last || last.team !== p.team || last.sectionName !== p.sectionName) teamsOrdered.push((last = { team: p.team, section: p.sectionName, sectionName: p.sectionName, people: [] }));
        last.people.push(p);
      });
    teamsOrdered.forEach(function (t) {
      t.monthly = months.map(function (_, i) {
        return t.people.reduce(
          function (a, p) {
            return { amount: a.amount + p.monthly[i].amount, target: a.target + p.monthly[i].target };
          },
          { amount: 0, target: 0 }
        );
      });
    });
    var total = monthly.reduce(
      function (a, x) {
        return { amount: a.amount + x.amount, target: a.target + x.target, count: a.count + x.count };
      },
      { amount: 0, target: 0, count: 0 }
    );
    // 期間の名前（1月〜12月ちょうどなら「48期」）
    var fy = f.fromYM.slice(0, 4);
    var fullYear = f.fromYM === fy + "-01" && f.toYM === fy + "-12";
    var periodLabel = fullYear ? Number(fy) - (c.periodOffset || 0) + "期" : f.fromYM.replace("-", "/") + "〜" + f.toYM.replace("-", "/");
    return {
      fromYM: f.fromYM,
      toYM: f.toYM,
      periodLabel: periodLabel,
      fullYear: fullYear,
      months: months,
      teamsTable: teamsOrdered,
      monthly: monthly,
      total: total,
      sections: c.sections.map(function (x) {
        return bySection[x.key];
      }),
      results: results,
      resultMonthly: resultMonthly,
      owners: ownerList,
      details: details,
      depts: depts,
      sectionNames: sectionNames,
      teams: teams,
      ownerChoices: ownerChoices,
    };
  }

  // 期の番号 ⇔ 年
  function periodOf(year) {
    return year - (cfg().periodOffset || 0);
  }

  return { checkAccess: checkAccess, load: load, build: build, sectionKeyOf: sectionKeyOf, periodOf: periodOf };
})();
