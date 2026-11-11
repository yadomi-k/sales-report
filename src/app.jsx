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
    amountMin: "",
    amountMax: "",
    account: "",
    keyword: "",
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
// 検索条件
// ---------------------------------------------------------------
function Checks({ all, selected, onChange, empty }) {
  if (!all.length) return <span className="muted small">{empty || "（データなし）"}</span>;
  const cur = selected.length ? selected : all;
  return (
    <div className="checks">
      {all.map((v) => (
        <label key={v} className="check">
          <input type="checkbox" checked={cur.indexOf(v) >= 0} onChange={() => onChange(toggleIn(selected, all, v))} />
          {v}
        </label>
      ))}
    </div>
  );
}

function FilterPanel({ draft, setDraft, users, opts, onSearch, onClear, loading, saved, onSave, onLoadSaved, onDeleteSaved }) {
  const cfg = AppConfig.opportunity;
  const set = (patch) => setDraft(Object.assign({}, draft, patch));
  const [saveName, setSaveName] = useState("");
  const [savedSel, setSavedSel] = useState("");
  const [open, setOpen] = useState(true);

  const uniq = (a) => Array.from(new Set(a.filter(Boolean))).sort((x, y) => x.localeCompare(y, "ja"));
  const depts = uniq(users.map((u) => u.dept));
  const sections = uniq(users.filter((u) => !draft.dept || u.dept === draft.dept).map((u) => u.section));
  const teams = uniq(users.filter((u) => (!draft.dept || u.dept === draft.dept) && (!draft.section || u.section === draft.section)).map((u) => u.team));
  const owners = users
    .filter((u) => u.dept && (!draft.dept || u.dept === draft.dept) && (!draft.section || u.section === draft.section) && (!draft.team || u.team === draft.team))
    .sort((a, b) => (a.dept + a.section + a.team + a.name).localeCompare(b.dept + b.section + b.team + b.name, "ja"));

  return (
    <section className="panel">
      <div className="panel-head" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? "▾" : "▸"}</span> 検索条件
      </div>
      {open && (
        <div className="panel-body">
          <div className="saved-bar">
            <label className="field">
              <span>保存した条件</span>
              <select
                value={savedSel}
                onChange={(e) => {
                  setSavedSel(e.target.value);
                  if (e.target.value !== "") onLoadSaved(Number(e.target.value));
                }}
              >
                <option value="">選択してください</option>
                {saved.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {savedSel !== "" && (
              <button
                className="btn small"
                onClick={() => {
                  onDeleteSaved(Number(savedSel));
                  setSavedSel("");
                }}
              >
                削除
              </button>
            )}
            <input className="name-input" placeholder="条件の名前" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <button
              className="btn small"
              disabled={!saveName.trim()}
              onClick={() => {
                onSave(saveName.trim());
                setSaveName("");
              }}
            >
              今の条件を保存
            </button>
          </div>

          <div className="grid">
            <div className="row">
              <label className="field">
                <span>期間（売上日）</span>
                <input type="month" value={draft.fromYM} onChange={(e) => e.target.value && set({ fromYM: e.target.value })} />
              </label>
              <span className="tilde">〜</span>
              <label className="field">
                <span>&nbsp;</span>
                <input type="month" value={draft.toYM} onChange={(e) => e.target.value && set({ toYM: e.target.value })} />
              </label>
              <div className="quick">
                {[-1, 0, 1].map((d) => {
                  const y = new Date().getFullYear() + d;
                  return (
                    <button key={d} className="btn tiny" onClick={() => set({ fromYM: y + "-01", toYM: y + "-12" })}>
                      {y}年
                    </button>
                  );
                })}
              </div>
              <div className="field">
                <span>集計列</span>
                <div className="checks">
                  <label className="check">
                    <input type="checkbox" checked={draft.quarter} onChange={(e) => set({ quarter: e.target.checked })} />
                    四半期計
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={draft.half} onChange={(e) => set({ half: e.target.checked })} />
                    上期・下期計
                  </label>
                </div>
              </div>
            </div>

            <div className="row">
              <label className="field">
                <span>部</span>
                <select value={draft.dept} onChange={(e) => set({ dept: e.target.value, section: "", team: "", owner: "" })}>
                  <option value="">すべて</option>
                  {depts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>課</span>
                <select value={draft.section} onChange={(e) => set({ section: e.target.value, team: "", owner: "" })}>
                  <option value="">すべて</option>
                  {sections.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>チーム</span>
                <select value={draft.team} onChange={(e) => set({ team: e.target.value, owner: "" })}>
                  <option value="">すべて</option>
                  {teams.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>担当者</span>
                <select value={draft.owner} onChange={(e) => set({ owner: e.target.value })}>
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

            <div className="row">
              <div className="field">
                <span>受注確度</span>
                <Checks all={LEVELS} selected={draft.levels.length === LEVELS.length ? [] : draft.levels} onChange={(v) => set({ levels: v.length ? v : LEVELS.slice() })} />
              </div>
            </div>
            <div className="row">
              <div className="field wide">
                <span>案件ステージ</span>
                <Checks all={opts.stages} selected={draft.stages} onChange={(v) => set({ stages: v })} empty="（検索するとデータにあるステージが表示されます）" />
              </div>
            </div>
            {(cfg.competition || cfg.tags || cfg.salesType) && (
              <div className="row">
                {cfg.competition && (
                  <div className="field">
                    <span>コンペ区分</span>
                    <Checks all={opts.competitions} selected={draft.competitions} onChange={(v) => set({ competitions: v })} />
                  </div>
                )}
                {cfg.tags && (
                  <div className="field">
                    <span>タグ（いずれかを含む）</span>
                    <Checks all={opts.tags} selected={draft.tags} onChange={(v) => set({ tags: v })} />
                  </div>
                )}
                {cfg.salesType && (
                  <div className="field">
                    <span>営業種別</span>
                    <Checks all={opts.salesTypes} selected={draft.salesTypes} onChange={(v) => set({ salesTypes: v })} />
                  </div>
                )}
              </div>
            )}
            <div className="row">
              <label className="field">
                <span>商談の売上金額（円）</span>
                <div className="inline">
                  <input type="number" min="0" value={draft.amountMin} placeholder="下限" onChange={(e) => set({ amountMin: e.target.value })} />
                  <span className="tilde">〜</span>
                  <input type="number" min="0" value={draft.amountMax} placeholder="上限" onChange={(e) => set({ amountMax: e.target.value })} />
                </div>
              </label>
              <label className="field">
                <span>取引先名（部分一致）</span>
                <input value={draft.account} onChange={(e) => set({ account: e.target.value })} placeholder="取引先名を入力" />
              </label>
              <label className="field">
                <span>商談名（部分一致）</span>
                <input value={draft.keyword} onChange={(e) => set({ keyword: e.target.value })} placeholder="商談名を入力" />
              </label>
            </div>
            <div className="row">
              <label className="field">
                <span>表示単位</span>
                <select value={draft.groupBy} onChange={(e) => set({ groupBy: e.target.value })}>
                  <option value="">合計のみ</option>
                  <option value="dept">部ごと</option>
                  <option value="section">課ごと</option>
                  <option value="team">チームごと</option>
                  <option value="owner">担当者ごと</option>
                </select>
              </label>
              {draft.groupBy && (
                <label className="field">
                  <span>並び順</span>
                  <select value={draft.sort} onChange={(e) => set({ sort: e.target.value })}>
                    <option value="name">名前順</option>
                    <option value="target">目標の大きい順</option>
                    <option value="won">受注金額の大きい順</option>
                  </select>
                </label>
              )}
            </div>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={onSearch} disabled={loading}>
              {loading ? "読み込み中…" : "検索"}
            </button>
            <button className="btn" onClick={onClear} disabled={loading}>
              クリア
            </button>
          </div>
        </div>
      )}
    </section>
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
      <div className="table-title">{title}</div>
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
        明細（商談分割）{result.details.length.toLocaleString()}件　個人売上計 {AppAgg.fmtYen(sum[0])} 円 ／ 個人利益計 {AppAgg.fmtYen(sum[1])} 円
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
              <th>個人売上</th>
              <th>個人利益</th>
              <th>商談の売上金額</th>
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
                  <td>{AppAgg.fmtYen(s.oppAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 出力ファイルに書く検索条件
function conditionSummary(f, aff) {
  const out = [["期間（売上日）", f.fromYM.replace("-", "/") + " 〜 " + f.toYM.replace("-", "/")]];
  const org = [f.dept, f.section, f.team].filter(Boolean).join(" / ");
  if (org) out.push(["部署", org]);
  if (f.owner) out.push(["担当者", aff(f.owner).name]);
  out.push(["受注確度", f.levels.join("、")]);
  if (f.stages.length) out.push(["案件ステージ", f.stages.join("、")]);
  if (f.competitions.length) out.push(["コンペ区分", f.competitions.join("、")]);
  if (f.tags.length) out.push(["タグ", f.tags.join("、")]);
  if (f.salesTypes.length) out.push(["営業種別", f.salesTypes.join("、")]);
  if (f.amountMin || f.amountMax) out.push(["売上金額", (f.amountMin || "") + " 〜 " + (f.amountMax || "")]);
  if (f.account) out.push(["取引先名", f.account]);
  if (f.keyword) out.push(["商談名", f.keyword]);
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
    const cond = conditionSummary(applied, result.aff);
    if (kind === "csv") return AppExport.csv(result, applied, applied.levels, cond);
    setExporting(true);
    AppExport.excel(result, applied, applied.levels, cond)
      .catch((e) => setError(e.message))
      .finally(() => setExporting(false));
  };

  const dirty = applied && JSON.stringify(applied) !== JSON.stringify(draft);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">売上レポート{isDemo && <span className="badge">デモデータ</span>}</div>
        <div className="who">
          {profile && profile.name && <span>{profile.name}</span>}
          <button className="btn small ghost" onClick={onLogout}>
            {isDemo ? "終了" : "ログアウト"}
          </button>
        </div>
      </header>
      <main>
        <FilterPanel
          draft={draft}
          setDraft={setDraft}
          users={users}
          opts={opts}
          loading={loading}
          onSearch={() => search(draft)}
          onClear={() => setDraft(defaultFilters())}
          saved={saved}
          onSave={(name) => {
            const list = saved.filter((s) => s.name !== name).concat([{ name, filters: draft }]);
            setSaved(list);
            writeSaved(list);
          }}
          onLoadSaved={(i) => {
            const f = Object.assign(defaultFilters(), saved[i].filters);
            setDraft(f);
            search(f);
          }}
          onDeleteSaved={(i) => {
            const list = saved.filter((_, j) => j !== i);
            setSaved(list);
            writeSaved(list);
          }}
        />

        {error && <div className="alert error">{error}</div>}
        {loading && <div className="alert info">Salesforceからデータを読み込んでいます… {progress}</div>}
        {dirty && !loading && <div className="alert warn">検索条件が変更されています。「検索」を押すと結果に反映されます。</div>}

        {result && (
          <section className="panel">
            <div className="panel-head static">
              結果：{result.total.label}
              <span className="muted small">
                　{applied.fromYM.replace("-", "/")}〜{applied.toYM.replace("-", "/")}　商談分割 {result.details.length.toLocaleString()}件
              </span>
            </div>
            <div className="toolbar">
              <div className="seg">
                {[
                  ["both", "表とグラフ"],
                  ["table", "表"],
                  ["chart", "グラフ"],
                  ["detail", "明細"],
                ].map(([k, l]) => (
                  <button key={k} className={view === k ? "on" : ""} onClick={() => changeView(k)}>
                    {l}
                  </button>
                ))}
              </div>
              {(view === "both" || view === "chart") && (
                <div className="seg">
                  {[
                    ["amount", "売上"],
                    ["profit", "利益"],
                  ].map(([k, l]) => (
                    <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <div className="spacer" />
              <button className="btn primary" onClick={() => doExport("xlsx")} disabled={exporting}>
                {exporting ? "作成中…" : "Excelダウンロード"}
              </button>
              <button className="btn" onClick={() => doExport("csv")}>
                CSVダウンロード
              </button>
            </div>
            {(view === "both" || view === "chart") && <ReportChart result={result} levels={applied.levels} metric={metric} />}
            {(view === "both" || view === "table") && (
              <>
                <ReportTable title={result.total.label} cells={result.total.cells} columns={result.columns} levels={applied.levels} />
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
