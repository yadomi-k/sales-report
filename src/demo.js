// デモデータ（Salesforceに接続せずに画面を試すためのダミーデータ）
// 実在の会社・人物とは関係ありません。毎回同じ内容になるよう、乱数の種を固定しています。
window.AppDemo = (function () {
  "use strict";

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var ORG = [
    { dept: "第１営業部", sections: [{ name: "営業１課", teams: ["Aチーム", "Bチーム"] }, { name: "営業２課", teams: ["Cチーム"] }] },
    { dept: "第２営業部", sections: [{ name: "営業１課", teams: ["Dチーム", "Eチーム"] }] },
    { dept: "イベント推進室", sections: [{ name: "推進課", teams: ["Fチーム"] }] },
    { dept: "第３営業部", sections: [{ name: "営業１課", teams: ["Gチーム"] }] },
    { dept: "営業推進部", sections: [{ name: "推進課", teams: ["Hチーム"] }] },
    { dept: "営業開発室", sections: [{ name: "開発課", teams: ["Iチーム"] }] },
    {
      dept: "クリエイティブ部",
      sections: [
        { name: "プランニング課", teams: ["プランニングチーム"] },
        { name: "スペースデザイン課", teams: ["SD1チーム", "SD2チーム", "SD3チーム"] },
        { name: "グラフィックデザイン課", teams: ["GD1チーム", "GD2チーム"] },
      ],
    },
    { dept: "大阪事業部", sections: [{ name: "営業課", teams: ["Lチーム"] }, { name: "製作課", teams: ["Mチーム"] }] },
  ];
  var FAMILY = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "清水", "山崎", "森", "池田", "橋本", "阿部", "石川"];
  var GIVEN = ["健太", "美咲", "大輔", "彩", "翔", "由美", "拓也", "恵", "誠", "裕子", "亮", "真由美", "直樹", "智子", "隆", "愛"];
  var ACCOUNTS = ["サンプル商事", "デモ電機", "テスト自動車", "架空食品", "ダミー化学", "見本建設", "例示ホールディングス", "仮想ミュージアム", "試験放送", "模擬不動産", "検証工業", "参考製薬"];
  var KINDS = ["展示会ブース", "ショールーム改装", "企画展", "周年イベント", "常設展示更新", "プロモーション", "店舗内装", "記念館展示"];
  var STAGE_WON = ["受注", "制作進行", "請求", "完了"];
  var STAGE_OPEN = ["タネ", "案件詳細入手", "着手承認済み", "見積提出済み"];
  var STAGE_OTHER = ["失注", "失注", "失注", "辞退", "消滅", "企画開発費", "企画開発費請求"];
  var COMPE = ["相見積り", "デザインコンペ", "企画コンペ"];
  var TAGS = ["展示会", "ミュージアム", "商業施設", "イベント", "リピート"];
  var SALES_TYPES = ["新規", "既存"];

  var cache = null;

  function build() {
    var r = rng(20261111);
    var pick = function (a) {
      return a[Math.floor(r() * a.length)];
    };
    var users = [];
    var n = 0;
    ORG.forEach(function (d) {
      d.sections.forEach(function (s) {
        s.teams.forEach(function (t) {
          var size = 2 + Math.floor(r() * 2);
          for (var i = 0; i < size; i++) {
            n++;
            users.push({
              id: "005DEMO" + String(n).padStart(8, "0"),
              name: FAMILY[(n * 7) % FAMILY.length] + " " + GIVEN[(n * 5) % GIVEN.length],
              dept: d.dept,
              section: s.name,
              team: t,
              active: true,
            });
          }
        });
      });
    });

    var splits = [];
    var targets = [];
    var today = new Date();
    var curYM = today.getFullYear() * 12 + today.getMonth();
    var oppNo = 0;
    for (var y = 2025; y <= 2027; y++) {
      for (var m = 1; m <= 12; m++) {
        var ym = y + "-" + String(m).padStart(2, "0");
        var idx = y * 12 + (m - 1);
        var season = 1 + 0.35 * Math.sin((m / 12) * Math.PI * 2 + 1);
        users.forEach(function (u, ui) {
          var base = (5 + (ui % 5) * 1.5) * 1e6 * season;
          var amt = Math.round(base / 1e5) * 1e5;
          targets.push({ oppId: "006TGT" + ym + ui, ownerId: u.id, ym: ym, amount: amt, profit: Math.round(amt * 0.26 / 1e3) * 1e3 });
        });
        var count = Math.round(32 + 14 * season + r() * 8);
        for (var k = 0; k < count; k++) {
          oppNo++;
          var day = 1 + Math.floor(r() * 28);
          var date = ym + "-" + String(day).padStart(2, "0");
          var level;
          var diff = idx - curYM; // 0=今月、マイナス=過去
          var x = r();
          if (diff < -1) level = x < 0.97 ? "受注" : "高";
          else if (diff === -1) level = x < 0.85 ? "受注" : "高";
          else if (diff === 0) level = x < 0.55 ? "受注" : x < 0.8 ? "高" : x < 0.92 ? "中" : "低";
          else if (diff <= 3) level = x < 0.2 ? "受注" : x < 0.45 ? "高" : x < 0.75 ? "中" : "低";
          else level = x < 0.05 ? "受注" : x < 0.25 ? "高" : x < 0.55 ? "中" : "低";
          // 今月以前の商談の一部は、失注・辞退などで終わったものにする（明細にだけ出る）
          if (diff <= 0 && r() < 0.18) level = "その他";
          var oppAmount = Math.round(Math.exp(14.4 + r() * 2.6) / 1e3) * 1e3;
          var oppProfit = Math.round(oppAmount * (0.15 + r() * 0.2));
          var account = pick(ACCOUNTS);
          var opp = {
            oppId: "006DEMO" + String(oppNo).padStart(8, "0"),
            oppName: account + " " + pick(KINDS),
            accountName: account,
            salesDate: date,
            ym: ym,
            oppAmount: oppAmount,
            oppProfit: oppProfit,
            stage: level === "受注" ? pick(STAGE_WON) : level === "その他" ? pick(STAGE_OTHER) : pick(STAGE_OPEN),
            level: level,
            competition: pick(COMPE),
            tags: TAGS.filter(function () {
              return r() < 0.25;
            }),
            salesType: r() < 0.3 ? SALES_TYPES[0] : SALES_TYPES[1],
          };
          var owner = users[Math.floor(r() * users.length)];
          var parts;
          if (r() < 0.2) {
            var other = users[Math.floor(r() * users.length)];
            parts = other.id === owner.id ? [[owner, 1]] : [[owner, r() < 0.5 ? 0.5 : 0.6], [other, 0]];
            if (parts.length === 2) parts[1][1] = 1 - parts[0][1];
          } else parts = [[owner, 1]];
          parts.forEach(function (p) {
            splits.push(
              Object.assign({}, opp, {
                ownerId: p[0].id,
                pct: p[1],
                amount: Math.round(oppAmount * p[1]),
                profit: Math.round(oppProfit * p[1]),
              })
            );
          });
        }
      }
    }
    return { users: users, splits: splits, targets: targets };
  }

  function load(fromYM, toYM) {
    if (!cache) cache = build();
    var inRange = function (x) {
      return x.ym >= fromYM && x.ym <= toYM;
    };
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ users: cache.users, splits: cache.splits.filter(inRange), targets: cache.targets.filter(inRange) });
      }, 250);
    });
  }

  function loadUsers() {
    if (!cache) cache = build();
    return Promise.resolve(cache.users);
  }

  return { load: load, loadUsers: loadUsers };
})();
