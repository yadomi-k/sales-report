// 売上レポート（画面）
const { useState, useEffect, useMemo, useRef, useCallback } = React;

const LEVELS = AppAgg.LEVELS;
const SAVED_KEY = "salesreport_saved_conditions_v1";
const MODE_KEY = "salesreport_mode";
const LEVEL_COLORS = { 受注: "#3b9ee8", 高: "#4cc4c0", 中: "#ffcc4d", 低: "#9b6bff" };
const TARGET_COLOR = "#f06292";

function defaultFilters() {
  const y = new Date().getFullYear();
  const start = String((window.AppConfig.defaults && AppConfig.defaults.fiscalYearStartMonth) || 1).padStart(2, "0");
  const fromYM = y + "-" + start;
  return {
    fromYM,
    toYM: AppAgg.ymAdd(fromYM, 11),
    quarter: true,
    half: true,
    dept: "",
    section: "",
    team: "",
    owner: "",
    levels: LEVELS.slice(),
    stages: [],
    competitions: [],
    tags: [],
    salesTypes: [],
    groupBy: "",
    sort: "name",
  };
}

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
  } catch (e) {
    return [];
  }
}
function writeSaved(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch (e) {}
}

// 空の配列 = すべて選択 として扱う複数選択
function toggleIn(list, all, v) {
  const cur = list.length ? list : all;
  const next = cur.indexOf(v) >= 0 ? cur.filter((x) => x !== v) : cur.concat([v]);
  return next.length === all.length ? [] : next;
}

// ---------------------------------------------------------------
// ログイン
// ---------------------------------------------------------------
function LoginPage({ onDemo, error }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(error || "");
  const login = () => {
    setBusy(true);
    setErr("");
    AppSSO.startLogin().catch((e) => {
      setErr(e.message);
      setBusy(false);
    });
  };
  return (
    <div className="login">
      <div className="login-card">
        <h1>売上レポート</h1>
        <p className="muted">商談分割をもとにした個人・部署別の売上／利益の実績と目標</p>
        <button className="btn primary big" onClick={login} disabled={busy}>
          {busy ? "Salesforceへ移動しています…" : "Salesforceでログイン"}
        </button>
        <button className="btn link" onClick={onDemo}>
          デモデータで試す（ログインなし）
        </button>
        {err && <div className="alert error">{err}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// 検索・絞り込み（CaseShelfと同じサイドバー。PCは左に固定、スマートフォンは左から開く）
// ---------------------------------------------------------------
const SECTION_PREF = "salesreport_sidebar_sections";
const SIDEBAR_PREF = "salesreport_sidebar_closed";

function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
function writePref(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch (e) {}
}

const DEFAULT_OPEN = { saved: false, period: true, org: true, level: true, stage: false, compe: false, display: true };

function SidebarSection({ id, title, active, children }) {
  const [open, setOpen] = useState(() => {
    const p = readPref(SECTION_PREF, {});
    return id in p ? !!p[id] : !!DEFAULT_OPEN[id];
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    const p = readPref(SECTION_PREF, {});
    p[id] = next;
    writePref(SECTION_PREF, p);
  };
  return (
    <div className={"sidebar-section" + (open ? " open" : "")}>
      <button type="button" className="sidebar-sec-head" onClick={toggle} aria-expanded={open} aria-controls={"sec-" + id}>
        <span className="sidebar-label">{title}</span>
        {!open && active ? <span className="sidebar-sec-active">{active}</span> : null}
        <span className="sidebar-sec-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="sidebar-sec-body" id={"sec-" + id}>
          {children}
        </div>
      )}
    </div>
  );
}

// 複数選択のチップ（空の配列 = すべて）
function ChipChoices({ all, selected, onChange, colors, empty }) {
  if (!all.length) return <div className="sidebar-hint">{empty || "該当するデータがありません"}</div>;
  const cur = selected.length ? selected : all;
  return (
    <div className="chips">
      {all.map((v) => {
        const on = cur.indexOf(v) >= 0;
        return (
          <button
            type="button"
            key={v}
            className={"chip" + (on ? " on" : "")}
            aria-pressed={on}
            onClick={() => {
              const next = toggleIn(selected, all, v);
              if (next.length === 0 && on && cur.length === 1) return; // 最後の1つは外さない
              onChange(next);
            }}
          >
            {colors && <span className="chip-dot" style={{ background: colors[v] }} />}
            {v}
          </button>
        );
      })}
    </div>
  );
}

function SearchSidebar({ draft, setDraft, users, opts, onSearch, onClear, onClose, loading, dirty, saved, onSave, onLoadSaved, onDeleteSaved }) {
  const cfg = AppConfig.opportunity;
  const set = (patch) => setDraft(Object.assign({}, draft, patch));
  const [saveName, setSaveName] = useState("");
  const [savedSel, setSavedSel] = useState("");

  const uniq = (a) => Array.from(new Set(a.filter(Boolean))).sort((x, y) => x.localeCompare(y, "ja"));
  const depts = uniq(users.map((u) => u.dept));
  const sections = uniq(users.filter((u) => !draft.dept || u.dept === draft.dept).map((u) => u.section));
  const teams = uniq(users.filter((u) => (!draft.dept || u.dept === draft.dept) && (!draft.section || u.section === draft.section)).map((u) => u.team));
  const owners = users
    .filter((u) => u.dept && (!draft.dept || u.dept === draft.dept) && (!draft.section || u.section === draft.section) && (!draft.team || u.team === draft.team))
    .sort((a, b) => (a.dept + a.section + a.team + a.name).localeCompare(b.dept + b.section + b.team + b.name, "ja"));
  const ownerName = (id) => (users.find((u) => u.id === id) || {}).name || "";
  const levelsSel = draft.levels.length === LEVELS.length ? [] : draft.levels;
  const y = new Date().getFullYear();
  const groupLabels = { "": "合計のみ", dept: "部ごと", section: "課ごと", team: "チームごと", owner: "担当者ごと" };

  return (
    <div className="sidebar-inner">
      <div className="sidebar-head">
        <div className="sidebar-title">検索・絞り込み</div>
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>

      <SidebarSection id="period" title="期間（売上日）" active={draft.fromYM.replace("-", "/") + "〜" + draft.toYM.replace("-", "/")}>
        <div className="period">
          <span>開始</span>
          <input id="f-from" type="month" aria-label="開始月" value={draft.fromYM} onChange={(e) => e.target.value && set({ fromYM: e.target.value })} />
          <span>終了</span>
          <input id="f-to" type="month" aria-label="終了月" value={draft.toYM} onChange={(e) => e.target.value && set({ toYM: e.target.value })} />
        </div>
        <div className="quick">
          {[y - 1, y, y + 1].map((yy) => {
            const on = draft.fromYM === yy + "-01" && draft.toYM === yy + "-12";
            return (
              <button type="button" key={yy} className={"chip small" + (on ? " on" : "")} onClick={() => set({ fromYM: yy + "-01", toYM: yy + "-12" })}>
                {yy}年
              </button>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarSection
        id="org"
        title="部署・担当者"
        active={draft.owner ? ownerName(draft.owner) : [draft.dept, draft.section, draft.team].filter(Boolean).join(" / ")}
      >
        <div className="stack">
          <label className="mini-field">
            <span>部</span>
            <select id="f-dept" value={draft.dept} onChange={(e) => set({ dept: e.target.value, section: "", team: "", owner: "" })}>
              <option value="">すべて</option>
              {depts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          {AppConfig.user.section && (
            <label className="mini-field">
              <span>課</span>
              <select id="f-section" value={draft.section} onChange={(e) => set({ section: e.target.value, team: "", owner: "" })}>
                <option value="">すべて</option>
                {sections.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
          )}
          {AppConfig.user.team && (
            <label className="mini-field">
              <span>チーム</span>
              <select id="f-team" value={draft.team} onChange={(e) => set({ team: e.target.value, owner: "" })}>
                <option value="">すべて</option>
                {teams.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
          )}
          <label className="mini-field">
            <span>担当者</span>
            <select id="f-owner" value={draft.owner} onChange={(e) => set({ owner: e.target.value })}>
              <option value="">すべて</option>
              {owners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.active ? "" : "（無効）"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SidebarSection>

      <SidebarSection id="level" title="受注確度" active={levelsSel.length ? levelsSel.join("・") : ""}>
        <ChipChoices all={LEVELS} selected={levelsSel} colors={LEVEL_COLORS} onChange={(v) => set({ levels: v.length ? v : LEVELS.slice() })} />
      </SidebarSection>

      <SidebarSection id="stage" title="案件ステージ" active={draft.stages.length ? draft.stages.length + "件選択" : ""}>
        <ChipChoices all={opts.stages} selected={draft.stages} onChange={(v) => set({ stages: v })} empty="検索すると、データにあるステージが表示されます" />
      </SidebarSection>

      {cfg.competition && (
        <SidebarSection id="compe" title="コンペ区分" active={draft.competitions.join("・")}>
          <ChipChoices all={opts.competitions} selected={draft.competitions} onChange={(v) => set({ competitions: v })} />
        </SidebarSection>
      )}
      {cfg.tags && (
        <SidebarSection id="tags" title="タグ" active={draft.tags.join("・")}>
          <ChipChoices all={opts.tags} selected={draft.tags} onChange={(v) => set({ tags: v })} />
        </SidebarSection>
      )}
      {cfg.salesType && (
        <SidebarSection id="salesType" title="営業種別" active={draft.salesTypes.join("・")}>
          <ChipChoices all={opts.salesTypes} selected={draft.salesTypes} onChange={(v) => set({ salesTypes: v })} />
        </SidebarSection>
      )}

      <SidebarSection id="display" title="表示" active={draft.groupBy ? groupLabels[draft.groupBy] : ""}>
        <div className="stack">
          <label className="mini-field">
            <span>表示単位</span>
            <select id="f-group" value={draft.groupBy} onChange={(e) => set({ groupBy: e.target.value })}>
              <option value="">合計のみ</option>
              <option value="dept">部ごと</option>
              {AppConfig.user.section && <option value="section">課ごと</option>}
              {AppConfig.user.team && <option value="team">チームごと</option>}
              <option value="owner">担当者ごと</option>
            </select>
          </label>
          {draft.groupBy && (
            <label className="mini-field">
              <span>並び順</span>
              <select id="f-sort" value={draft.sort} onChange={(e) => set({ sort: e.target.value })}>
                <option value="name">名前順</option>
                <option value="target">目標の大きい順</option>
                <option value="won">受注金額の大きい順</option>
              </select>
            </label>
          )}
          <div className="mini-field">
            <span>集計列</span>
            <label className="check">
              <input id="f-quarter" type="checkbox" checked={draft.quarter} onChange={(e) => set({ quarter: e.target.checked })} />
              四半期合計
            </label>
            <label className="check">
              <input id="f-half" type="checkbox" checked={draft.half} onChange={(e) => set({ half: e.target.checked })} />
              上期計・下期計
            </label>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection id="saved" title="保存した条件" active={saved.length ? saved.length + "件" : ""}>
        <div className="stack">
          {saved.length > 0 && (
            <div className="saved-list">
              {saved.map((s, i) => (
                <div key={i} className="saved-item">
                  <button type="button" className="saved-name" onClick={() => onLoadSaved(i)} title="この条件で検索する">
                    {s.name}
                  </button>
                  <button type="button" className="icon-btn small" onClick={() => onDeleteSaved(i)} aria-label={s.name + "を削除"}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="save-row">
            <input id="f-save-name" placeholder="今の条件に名前を付ける" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <button
              type="button"
              className="btn sm"
              disabled={!saveName.trim()}
              onClick={() => {
                onSave(saveName.trim());
                setSaveName("");
              }}
            >
              保存
            </button>
          </div>
          <div className="sidebar-hint">保存した条件は、このブラウザにだけ保存されます。</div>
        </div>
      </SidebarSection>

      <div className="sidebar-foot">
        {dirty && <div className="sidebar-dirty">条件が変更されています</div>}
        <button type="button" className="btn primary block" onClick={onSearch} disabled={loading}>
          {loading ? "読み込み中…" : "この条件で検索"}
        </button>
        <button type="button" className="link-btn" onClick={onClear} disabled={loading}>
          条件をクリア
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// グラフ
// ---------------------------------------------------------------
function ReportChart({ result, levels, metric }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!window.Chart || !ref.current) return;
    const idx = [];
    result.columns.forEach((c, i) => c.kind === "month" && idx.push(i));
    const cells = idx.map((i) => result.total.cells[i]);
    const labels = idx.map((i) => result.columns[i].label);
    const key = metric === "profit" ? "profit" : "amount";
    const datasets = [
      {
        type: "line",
        label: metric === "profit" ? "利益目標" : "売上目標",
        id: "target",
        data: cells.map((c) => c.target[key]),
        borderColor: TARGET_COLOR,
        backgroundColor: "#fff",
        pointBackgroundColor: "#fff",
        pointBorderColor: TARGET_COLOR,
        pointRadius: 3,
        borderWidth: 2,
        order: 0,
      },
    ].concat(
      LEVELS.filter((l) => levels.indexOf(l) >= 0).map((l) => ({
        type: "bar",
        label: l === "受注" ? "受注" : "受注確度（" + l + "）",
        id: l,
        data: cells.map((c) => c.own[l][key]),
        backgroundColor: LEVEL_COLORS[l],
        stack: "s",
        maxBarThickness: 64,
        order: 1,
      }))
    );
    const yen = (v) => Math.round(v).toLocaleString("ja-JP");
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 28, boxHeight: 10, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const c = cells[ctx.dataIndex];
              const id = ctx.dataset.id;
              if (id === "target") {
                const lines = [ctx.dataset.label + ": " + yen(c.target[key])];
                if (levels.indexOf("受注") >= 0) lines.push("差分（受注−目標）: " + yen(c.cum["受注"][key] - c.target[key]));
                return lines;
              }
              return ctx.dataset.label + (id === "受注" ? "" : " 積上") + ": " + yen(c.cum[id][key]);
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => yen(v) } },
      },
    };
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, { data: { labels, datasets }, options });
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [result, levels, metric]);
  if (!window.Chart) return <div className="alert error">グラフの部品を読み込めませんでした。</div>;
  return (
    <div className="chart-box">
      <canvas ref={ref} />
    </div>
  );
}

// ---------------------------------------------------------------
// 表
// ---------------------------------------------------------------
function ReportTable({ title, cells, columns, levels }) {
  const rows = AppAgg.tableRows(cells, levels);
  return (
    <div className="table-block">
      {title && <div className="table-title">{title}</div>}
      <div className="table-scroll">
        <table className="report">
          <thead>
            <tr>
              <th className="sticky c1 blank" rowSpan={2}></th>
              <th className="sticky c2 blank" rowSpan={2}></th>
              {columns.map((c) => (
                <th key={c.key} colSpan={2} className={"h-" + c.kind}>
                  {c.label}
                </th>
              ))}
            </tr>
            <tr>
              {columns.map((c) => (
                <React.Fragment key={c.key}>
                  <th className="sub">売上</th>
                  <th className="sub">利益</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={"r-" + r.type + (r.blockFirst ? " block-first" : "")}>
                {(r.type === "target" || r.blockFirst) && (
                  <th className="sticky c1 block" rowSpan={r.type === "target" ? 1 : r.blockSize}>
                    {r.block}
                  </th>
                )}
                <th className={"sticky c2 label" + (r.type === "target" ? " target" : "")}>{r.label}</th>
                {r.cells.map((c, i) => (
                  <td key={i} className={(i % 2 === 0 ? "sales" : "profit") + (c.red ? " red" : "") + (c.blue ? " blue" : "")}>
                    {AppAgg.fmtCell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailTable({ result, isDemo }) {
  const LIMIT = 500;
  const rows = result.details.slice(0, LIMIT);
  const sum = result.details.reduce((a, s) => [a[0] + s.amount, a[1] + s.profit], [0, 0]);
  return (
    <div className="table-block">
      <div className="table-title">
        明細（商談分割）{result.details.length.toLocaleString()}件　金額計 {AppAgg.fmtYen(sum[0])} 円 ／ 利益額計 {AppAgg.fmtYen(sum[1])} 円
        {result.details.length > LIMIT && <span className="muted small">　※画面には先頭{LIMIT}件のみ表示（Excel出力には全件）</span>}
      </div>
      <div className="table-scroll">
        <table className="detail">
          <thead>
            <tr>
              <th>売上日</th>
              <th>商談名</th>
              <th>取引先</th>
              <th>担当者</th>
              <th>部 / 課 / チーム</th>
              <th>ステージ</th>
              <th>確度</th>
              <th>分割％</th>
              <th>分割の金額</th>
              <th>分割の利益額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const u = result.aff(s.ownerId, s.salesDate);
              return (
                <tr key={i}>
                  <td>{s.salesDate}</td>
                  <td className="text">
                    {isDemo ? (
                      s.oppName
                    ) : (
                      <a href={AppSSO.recordUrl("Opportunity", s.oppId)} target="_blank" rel="noreferrer">
                        {s.oppName}
                      </a>
                    )}
                  </td>
                  <td className="text">{s.accountName}</td>
                  <td className="text">{u.name}</td>
                  <td className="text">{[u.dept, u.section, u.team].filter(Boolean).join(" / ")}</td>
                  <td className="text">{s.stage}</td>
                  <td>
                    <span className="level" style={{ background: LEVEL_COLORS[s.level] }}>
                      {s.level}
                    </span>
                  </td>
                  <td>{Math.round(s.pct * 100)}%</td>
                  <td>{AppAgg.fmtYen(s.amount)}</td>
                  <td>{AppAgg.fmtYen(s.profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 目標が0件・0円のときの原因の手がかり
function TargetCheck({ check }) {
  const c = check;
  let hint;
  if (c.error) hint = "目標の件数を確認できませんでした（" + c.error + "）。";
  else if (c.total === 0)
    hint =
      "目標の商談（レコードタイプ【個人目標】かつステージ「目標」）が1件も見つかりません。src/config.js の target の設定か、" +
      "目標の商談を参照する権限（共有設定）を確認してください。";
  else if (c.inPeriod > 0)
    hint =
      "期間内の目標の商談は " + c.inPeriod + "件ありますが、金額が空欄か0です。売り上げ目標の項目名、" +
      "またはその項目の参照権限（項目レベルセキュリティ）を確認してください。";
  else
    hint =
      "目標の商談は全部で " + c.total + "件ありますが、「" + c.dateField + "」が期間内のものがありません" +
      "（この項目が空欄の目標：" + c.noDate + "件、完了予定日が期間内の目標：" + c.closeDateInPeriod + "件）。" +
      "目標の月が別の日付の項目に入っている可能性があります。";
  return <div className="alert warn">目標が表示されていません。{hint}</div>;
}

// 出力ファイルに書く検索条件
function conditionSummary(f, aff) {
  const out = [
    ["期間（売上日）", f.fromYM.replace("-", "/") + " 〜 " + f.toYM.replace("-", "/")],
  ];
  const org = [f.dept, f.section, f.team].filter(Boolean).join(" / ");
  if (org) out.push(["部署", org]);
  if (f.owner) out.push(["担当者", aff(f.owner).name]);
  out.push(["受注確度", f.levels.join("、")]);
  if (f.stages.length) out.push(["案件ステージ", f.stages.join("、")]);
  if (f.competitions.length) out.push(["コンペ区分", f.competitions.join("、")]);
  if (f.tags.length) out.push(["タグ", f.tags.join("、")]);
  if (f.salesTypes.length) out.push(["営業種別", f.salesTypes.join("、")]);
  return out;
}

// ---------------------------------------------------------------
// レポート画面
// ---------------------------------------------------------------
function ReportPage({ mode, profile, onLogout }) {
  const isDemo = mode === "demo";
  const [draft, setDraft] = useState(defaultFilters);
  const [applied, setApplied] = useState(null);
  const [data, setData] = useState(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem("salesreport_view") || "both";
    } catch (e) {
      return "both";
    }
  });
  const [metric, setMetric] = useState("amount");
  const [saved, setSaved] = useState(readSaved);
  const [exporting, setExporting] = useState(false);
  const [sidebarClosed, setSidebarClosed] = useState(() => !!readPref(SIDEBAR_PREF, false));
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    // スマートフォンでパネルを開いている間は、後ろの画面をスクロールさせない。Escで閉じる
    document.body.classList.toggle("no-scroll", panelOpen);
    const onKey = (e) => e.key === "Escape" && setPanelOpen(false);
    if (panelOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  const search = useCallback(
    (f) => {
      f = f || draft;
      if (f.fromYM > f.toYM) {
        setError("期間の開始が終了より後になっています。");
        return;
      }
      setError("");
      const key = f.fromYM + "|" + f.toYM;
      if (key === loadedKey && data) {
        setApplied(f);
        return;
      }
      setLoading(true);
      setProgress("");
      const loader = isDemo ? AppDemo.load(f.fromYM, f.toYM) : AppSF.load(f.fromYM, f.toYM, (n) => setProgress(n.toLocaleString() + "件 読み込み済み"));
      loader
        .then((d) => {
          setData(d);
          setLoadedKey(key);
          setApplied(f);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [draft, loadedKey, data, isDemo]
  );

  useEffect(() => {
    search(draft);
  }, []); // 最初に今年のデータを表示する

  const result = useMemo(() => (data && applied ? AppAgg.build(data, applied, applied) : null), [data, applied]);
  const opts = useMemo(() => (data ? AppAgg.options(data) : { stages: [], competitions: [], tags: [], salesTypes: [] }), [data]);
  const users = useMemo(() => {
    if (!data) return [];
    // 期間内に実績・目標がある人と、有効なユーザを選択肢にする
    const seen = new Set();
    data.splits.forEach((s) => seen.add(s.ownerId));
    data.targets.forEach((t) => seen.add(t.ownerId));
    return data.users.filter((u) => seen.has(u.id) || (u.active && u.dept));
  }, [data]);

  const changeView = (v) => {
    setView(v);
    try {
      localStorage.setItem("salesreport_view", v);
    } catch (e) {}
  };

  const doExport = (kind) => {
    if (!result) return;
    if (AppConfig.demoOnly) {
      setError("この確認用ページではファイルをダウンロードできません。Excel・CSVの出力は、社内に置いた本番の画面で使えます。");
      return;
    }
    const cond = conditionSummary(applied, result.aff);
    if (kind === "csv") return AppExport.csv(result, applied, applied.levels, cond);
    setExporting(true);
    AppExport.excel(result, applied, applied.levels, cond)
      .catch((e) => setError(e.message))
      .finally(() => setExporting(false));
  };

  const dirty = applied && JSON.stringify(applied) !== JSON.stringify(draft);

  const isDesktop = () => window.matchMedia && window.matchMedia("(min-width: 860px)").matches;
  const toggleSidebar = () => {
    if (isDesktop()) {
      setSidebarClosed(!sidebarClosed);
      writePref(SIDEBAR_PREF, !sidebarClosed);
    } else setPanelOpen(true);
  };
  const runSearch = (f) => {
    search(f);
    if (!isDesktop()) setPanelOpen(false);
  };

  // 結果の上に出す、今の検索条件
  const chips = [];
  if (applied && result) {
    chips.push(applied.fromYM.replace("-", "/") + "〜" + applied.toYM.replace("-", "/"));
    if (applied.owner) chips.push(result.aff(applied.owner).name);
    else if (applied.dept || applied.section || applied.team) chips.push([applied.dept, applied.section, applied.team].filter(Boolean).join(" / "));
    if (applied.levels.length < LEVELS.length) chips.push("確度：" + applied.levels.join("・"));
    if (applied.stages.length) chips.push("ステージ：" + applied.stages.length + "件");
    if (applied.competitions.length) chips.push(applied.competitions.join("・"));
    if (applied.groupBy) chips.push({ dept: "部ごと", section: "課ごと", team: "チームごと", owner: "担当者ごと" }[applied.groupBy]);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          売上レポート{isDemo && <span className="badge">デモデータ</span>}
        </div>
        <div className="who">
          {profile && profile.name && <span className="who-name">{profile.name}</span>}
          {onLogout && (
            <button className="btn sm ghost" onClick={onLogout}>
              {isDemo ? "終了" : "ログアウト"}
            </button>
          )}
        </div>
      </header>

      <div className={"layout" + (sidebarClosed ? " sidebar-closed" : "")}>
        <aside className={"sidebar" + (panelOpen ? " open" : "")} aria-label="検索・絞り込み">
          <SearchSidebar
            draft={draft}
            setDraft={setDraft}
            users={users}
            opts={opts}
            loading={loading}
            dirty={dirty}
            onSearch={() => runSearch(draft)}
            onClear={() => setDraft(defaultFilters())}
            onClose={() => (isDesktop() ? toggleSidebar() : setPanelOpen(false))}
            saved={saved}
            onSave={(name) => {
              const list = saved.filter((s) => s.name !== name).concat([{ name, filters: draft }]);
              setSaved(list);
              writeSaved(list);
            }}
            onLoadSaved={(i) => {
              const f = Object.assign(defaultFilters(), saved[i].filters);
              setDraft(f);
              runSearch(f);
            }}
            onDeleteSaved={(i) => {
              const list = saved.filter((_, j) => j !== i);
              setSaved(list);
              writeSaved(list);
            }}
          />
        </aside>
        {panelOpen && <div className="sidebar-overlay" onClick={() => setPanelOpen(false)} />}

        <main className="main">
          <div className="filter-bar">
            <button type="button" className={"btn sm filter-btn" + (!sidebarClosed ? " pc-open" : "")} onClick={toggleSidebar}>
              <SearchIcon />
              <span className="sp-only">検索・絞り込み</span>
              <span className="pc-only">{sidebarClosed ? "検索・絞り込みを開く" : "検索・絞り込みを閉じる"}</span>
            </button>
            <div className="conds">
              {chips.map((c, i) => (
                <span key={i} className="cond">
                  {c}
                </span>
              ))}
            </div>
            {result && <span className="count">商談分割 {result.details.length.toLocaleString()}件</span>}
          </div>

          {error && <div className="alert error">{error}</div>}
          {loading && <div className="alert info">Salesforceからデータを読み込んでいます… {progress}</div>}
          {data && data.skipped && Object.keys(data.skipped).length > 0 && !loading && (
            <div className="alert info small">
              集計の対象外にした商談分割があります（ステージが受注・高・中・低のどれにもあたらないもの）：
              {Object.keys(data.skipped)
                .map((k) => k + " " + data.skipped[k] + "件")
                .join("、")}
            </div>
          )}
          {data && data.targetCheck && !loading && <TargetCheck check={data.targetCheck} />}

          {result && (
            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  {result.total.label}
                  <span className="card-sub">
                    {applied.fromYM.replace("-", "/")}〜{applied.toYM.replace("-", "/")}
                  </span>
                </div>
                <div className="toolbar">
                  <div className="seg" role="group" aria-label="表示">
                    {[
                      ["both", "表とグラフ"],
                      ["table", "表"],
                      ["chart", "グラフ"],
                      ["detail", "明細"],
                    ].map(([k, l]) => (
                      <button key={k} className={view === k ? "on" : ""} aria-pressed={view === k} onClick={() => changeView(k)}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {(view === "both" || view === "chart") && (
                    <div className="seg" role="group" aria-label="グラフの値">
                      {[
                        ["amount", "売上"],
                        ["profit", "利益"],
                      ].map(([k, l]) => (
                        <button key={k} className={metric === k ? "on" : ""} aria-pressed={metric === k} onClick={() => setMetric(k)}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="spacer" />
                  <button className="btn sm primary" onClick={() => doExport("xlsx")} disabled={exporting}>
                    {exporting ? "作成中…" : "Excel"}
                  </button>
                  <button className="btn sm" onClick={() => doExport("csv")}>
                    CSV
                  </button>
                </div>
              </div>
              {(view === "both" || view === "chart") && <ReportChart result={result} levels={applied.levels} metric={metric} />}
              {(view === "both" || view === "table") && (
                <>
                  <ReportTable title={result.groups.length ? result.total.label : ""} cells={result.total.cells} columns={result.columns} levels={applied.levels} />
                  {result.groups.map((g) => (
                    <ReportTable key={g.key} title={g.label} cells={g.cells} columns={result.columns} levels={applied.levels} />
                  ))}
                </>
              )}
              {view === "detail" && <DetailTable result={result} isDemo={isDemo} />}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

// ---------------------------------------------------------------
// アプリ全体
// ---------------------------------------------------------------
function App() {
  const [state, setState] = useState({ phase: "checking" });

  useEffect(() => {
    AppSSO.consumeRedirect()
      .then((profile) => {
        if (profile) return setState({ phase: "in", mode: "sf", profile });
        const s = AppSSO.getSession();
        if (s) return setState({ phase: "in", mode: "sf", profile: s.profile });
        let demo = false;
        try {
          demo = sessionStorage.getItem(MODE_KEY) === "demo";
        } catch (e) {}
        setState(demo ? { phase: "in", mode: "demo", profile: { name: "デモ利用者" } } : { phase: "out" });
      })
      .catch((e) => setState({ phase: "out", error: e.message }));
    const onExpire = () => setState({ phase: "out", error: "Salesforceの接続の有効期限が切れました。もう一度ログインしてください。" });
    window.addEventListener("salesreport-session-expired", onExpire);
    return () => window.removeEventListener("salesreport-session-expired", onExpire);
  }, []);

  if (AppConfig.demoOnly) return <ReportPage mode="demo" profile={{ name: "デモ利用者" }} onLogout={null} />;
  if (state.phase === "checking") return <div className="center muted">読み込み中…</div>;
  if (state.phase === "out")
    return (
      <LoginPage
        error={state.error}
        onDemo={() => {
          try {
            sessionStorage.setItem(MODE_KEY, "demo");
          } catch (e) {}
          setState({ phase: "in", mode: "demo", profile: { name: "デモ利用者" } });
        }}
      />
    );
  return (
    <ReportPage
      mode={state.mode}
      profile={state.profile}
      onLogout={() => {
        if (state.mode === "sf") AppSSO.endSession();
        try {
          sessionStorage.removeItem(MODE_KEY);
        } catch (e) {}
        setState({ phase: "out" });
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
