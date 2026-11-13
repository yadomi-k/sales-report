// VISORA：Creativeタブ（プロジェクト管理のクリエイティブ部の売上）
// ※ useState などは src/app.jsx で宣言したものを使う（同じ名前を再宣言しない）

const CR_COLORS = {
  bar: "#3b9ee8",
  target: "#f06292",
  results: { 受注: "#3b9ee8", 失注: "#f4a259", 消滅: "#b8bec7" },
  teams: ["#3b9ee8", "#4cc4c0", "#9b6bff", "#f4a259", "#f06292", "#7cb342", "#ffb300", "#5c6bc0", "#26a69a", "#8d6e63"],
};
const crYen = (v) => Math.round(v || 0).toLocaleString("ja-JP");
const crPct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "");

// Chart.js を描く共通部品（config が変わったら描き直す）
function CrChart({ config, height, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!window.Chart || !ref.current) return;
    const chart = new Chart(ref.current, config);
    return () => chart.destroy();
  }, [config]);
  return (
    <div className="cr-chart" style={{ height }}>
      <canvas ref={ref} role="img" aria-label={label} />
    </div>
  );
}

// ドーナツの中央に件数を書く
const centerText = {
  id: "centerText",
  afterDraw(chart, args, opts) {
    if (!opts || opts.text == null) return;
    const { ctx, chartArea } = chart;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1c1c1e";
    ctx.font = "700 24px -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillText(opts.text, x, y - 6);
    ctx.fillStyle = "#737373";
    ctx.font = "12px -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 16);
    ctx.restore();
  },
};

function CrDashboard({ r }) {
  const c = AppConfig.creative;
  const hasTarget = !!c.targetField || r.total.target > 0;
  const labels = r.months.map((ym) => Number(ym.slice(5)) + "月");

  const salesChart = useMemo(
    () => ({
      data: {
        labels,
        datasets: [
          { type: "bar", label: "金額", data: r.monthly.map((x) => x.amount), backgroundColor: CR_COLORS.bar, maxBarThickness: 56, order: 1 },
        ].concat(
          hasTarget
            ? [
                {
                  type: "line",
                  label: "目標金額",
                  data: r.monthly.map((x) => x.target),
                  borderColor: CR_COLORS.target,
                  backgroundColor: "#fff",
                  pointBackgroundColor: "#fff",
                  pointRadius: 3,
                  borderWidth: 2,
                  order: 0,
                },
              ]
            : []
        ),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 24, boxHeight: 10 } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + "：" + crYen(ctx.raw) + "円",
              afterBody: (items) => {
                const m = r.monthly[items[0].dataIndex];
                return m.target ? ["達成率：" + crPct(m.amount, m.target)] : [];
              },
            },
          },
        },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (v) => "¥" + (v / 1e6).toLocaleString("ja-JP") + "百万" } } },
      },
    }),
    [r]
  );

  const resultNames = Object.keys(r.results).sort((a, b) => r.results[b] - r.results[a]);
  const totalResults = resultNames.reduce((a, k) => a + r.results[k], 0);
  const compeBar = useMemo(
    () => ({
      type: "bar",
      data: {
        labels,
        datasets: resultNames.map((k) => ({ label: k, data: r.resultMonthly[k], backgroundColor: CR_COLORS.results[k] || "#cfd4da", maxBarThickness: 16 })),
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { boxWidth: 14, boxHeight: 10 } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "件数" } }, y: { grid: { display: false } } },
      },
    }),
    [r]
  );
  const compeDonut = useMemo(
    () => ({
      type: "doughnut",
      data: {
        labels: resultNames,
        datasets: [{ data: resultNames.map((k) => r.results[k]), backgroundColor: resultNames.map((k) => CR_COLORS.results[k] || "#cfd4da"), borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "right", labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: (ctx) => ctx.label + "：" + ctx.raw + "件（" + crPct(ctx.raw, totalResults) + "）" } },
          centerText: { text: String(totalResults), sub: "件" },
        },
      },
      plugins: [centerText],
    }),
    [r]
  );

  // 担当者別（チームごとに色分け）
  const teamNames = Array.from(new Set(r.owners.map((o) => o.team)));
  const ownerChart = useMemo(
    () => ({
      type: "bar",
      data: {
        labels: r.owners.map((o) => o.name),
        datasets: [
          {
            label: "金額",
            data: r.owners.map((o) => o.amount),
            backgroundColor: r.owners.map((o) => CR_COLORS.teams[teamNames.indexOf(o.team) % CR_COLORS.teams.length]),
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => r.owners[items[0].dataIndex].name + "（" + r.owners[items[0].dataIndex].team + "）", label: (ctx) => crYen(ctx.raw) + "円" } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 90, minRotation: 0, font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { callback: (v) => "¥" + (v / 1e6).toLocaleString("ja-JP") + "百万" } },
        },
      },
    }),
    [r]
  );

  const kpis = [{ key: "all", label: r.sections.map((s) => s.label).join("/") + "成績予測", amount: r.total.amount, target: r.total.target, strong: true }].concat(
    r.sections.map((s) => ({ key: s.key, label: s.label + "成績予測", amount: s.amount, target: s.target }))
  );

  return (
    <div className="cr-dash">
      <section className="cr-panel wide">
        <h3>
          【{r.period}期】売上予測<span className="cr-sub">計上日 {r.year}年1月〜12月</span>
        </h3>
        <CrChart config={salesChart} height="20rem" label="月別の金額と目標金額" />
      </section>

      <div className="cr-kpis">
        {kpis.map((k) => (
          <section key={k.key} className={"cr-kpi" + (k.strong ? " strong" : "")}>
            <div className="cr-kpi-label">
              {r.period}期：{k.label}
            </div>
            <div className="cr-kpi-value">¥{crYen(k.amount)}</div>
            {k.target > 0 && (
              <div className="cr-kpi-sub">
                目標 ¥{crYen(k.target)}　達成率 <b>{crPct(k.amount, k.target)}</b>
              </div>
            )}
          </section>
        ))}
      </div>

      {c.resultField && (
        <div className="cr-row">
          <section className="cr-panel">
            <h3>{r.period}期：コンペ結果集計（月別）</h3>
            {totalResults ? <CrChart config={compeBar} height="22rem" label="月別のコンペ結果の件数" /> : <div className="cr-empty">コンペ結果が入っているプロジェクトがありません</div>}
          </section>
          <section className="cr-panel">
            <h3>{r.period}期：コンペ結果集計</h3>
            {totalResults ? <CrChart config={compeDonut} height="22rem" label="コンペ結果の割合" /> : <div className="cr-empty">コンペ結果が入っているプロジェクトがありません</div>}
          </section>
        </div>
      )}

      <section className="cr-panel wide">
        <h3>
          【担当者別】成績予測<span className="cr-sub">色はチーム</span>
        </h3>
        <div className="cr-legend">
          {teamNames.map((t, i) => (
            <span key={t}>
              <i style={{ background: CR_COLORS.teams[i % CR_COLORS.teams.length] }} />
              {t}
            </span>
          ))}
        </div>
        <div className="cr-scroll">
          <div style={{ minWidth: Math.max(600, r.owners.length * 44) + "px" }}>
            <CrChart config={ownerChart} height="20rem" label="担当者別の金額" />
          </div>
        </div>
      </section>
    </div>
  );
}

// 表（月 → 四半期 → 半期 → 年間）。SD・GD・合計ごとに 目標／金額／達成率
function crTableModel(r) {
  const cols = AppAgg.buildColumns(r.year + "-01", r.year + "-12", { quarter: true, half: true });
  const sumOf = (monthly, col) =>
    col.months.reduce(
      (a, ym) => {
        const i = r.months.indexOf(ym);
        return { amount: a.amount + monthly[i].amount, target: a.target + monthly[i].target };
      },
      { amount: 0, target: 0 }
    );
  const blocks = [{ label: "合計", monthly: r.monthly }].concat(r.sections.map((s) => ({ label: s.label, monthly: s.monthly })));
  return {
    cols,
    blocks: blocks.map((b) => ({ label: b.label, cells: cols.map((col) => sumOf(b.monthly, col)) })),
  };
}

function CrTable({ r }) {
  const t = crTableModel(r);
  return (
    <div className="table-block">
      <div className="table-scroll">
        <table className="report">
          <thead>
            <tr>
              <th className="sticky c1 blank"></th>
              <th className="sticky c2 blank"></th>
              {t.cols.map((c) => (
                <th key={c.key} className={"h-" + c.kind}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.blocks.map((b) =>
              ["目標", "金額", "達成率"].map((row, ri) => (
                <tr key={b.label + row} className={(row === "目標" ? "r-target" : "") + (ri === 0 ? " block-first" : "")}>
                  {ri === 0 && (
                    <th className="sticky c1 block" rowSpan={3}>
                      {b.label}
                    </th>
                  )}
                  <th className={"sticky c2 label" + (row === "目標" ? " target" : "")}>{row}</th>
                  {b.cells.map((x, i) => {
                    if (row === "目標") return <td key={i}>{crYen(x.target)}</td>;
                    if (row === "金額") return <td key={i} className={"sales" + (x.target && x.amount < x.target ? " red" : "")}>{crYen(x.amount)}</td>;
                    return <td key={i}>{crPct(x.amount, x.target)}</td>;
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CrDetail({ r, isDemo }) {
  const LIMIT = 500;
  const c = AppConfig.creative;
  return (
    <div className="table-block">
      <div className="table-title">
        明細（プロジェクト）{r.details.length.toLocaleString()}件　金額計 {crYen(r.total.amount)} 円
        {r.details.length > LIMIT && <span className="muted small">　※画面には先頭{LIMIT}件のみ表示（Excel出力には全件）</span>}
      </div>
      <div className="table-scroll">
        <table className="detail">
          <thead>
            <tr>
              <th>計上日</th>
              <th>プロジェクト</th>
              <th>担当者</th>
              <th>課（当時）</th>
              <th>チーム（当時）</th>
              {c.resultField && <th>コンペ結果</th>}
              <th>金額</th>
            </tr>
          </thead>
          <tbody>
            {r.details.slice(0, LIMIT).map((x) => (
              <tr key={x.id}>
                <td>{x.date}</td>
                <td className="text">
                  {isDemo ? x.name : <a href={AppSSO.recordUrl(c.object, x.id)} target="_blank" rel="noreferrer">{x.name}</a>}
                </td>
                <td className="text">{x.owner.name}</td>
                <td className="text">{x.section}</td>
                <td className="text">{x.orgNow.team}</td>
                {c.resultField && <td className="text">{x.result}</td>}
                <td>{crYen(x.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Excel出力（表・明細）
function crExportExcel(r) {
  if (!window.ExcelJS) return Promise.reject(new Error("Excel出力の部品を読み込めませんでした。"));
  const c = AppConfig.creative;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Creative", { views: [{ state: "frozen", xSplit: 2 }] });
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const thin = { style: "thin", color: { argb: "FFB7B7B7" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const head = { month: "FFA4C2F4", quarter: "FFD5A6F5", half: "FFB4A7D6", total: "FF5B3F86" };
  ws.getCell(1, 1).value = "VISORA クリエイティブ売上（" + r.period + "期・" + r.year + "年）出力日時 " + new Date().toLocaleString("ja-JP");
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  const t = crTableModel(r);
  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 10;
  t.cols.forEach((col, i) => {
    ws.getColumn(3 + i).width = 15;
    const h = ws.getCell(3, 3 + i);
    h.value = col.label;
    h.fill = fill(head[col.kind]);
    h.font = { bold: true, color: { argb: col.kind === "total" ? "FFFFFFFF" : "FF000000" } };
    h.alignment = { horizontal: "center" };
    h.border = border;
  });
  let row = 4;
  t.blocks.forEach((b) => {
    ws.mergeCells(row, 1, row + 2, 1);
    const bc = ws.getCell(row, 1);
    bc.value = b.label;
    bc.fill = fill("FF666666");
    bc.font = { bold: true, color: { argb: "FFFFFFFF" } };
    bc.alignment = { horizontal: "center", vertical: "middle" };
    ["目標", "金額", "達成率"].forEach((name, k) => {
      const lc = ws.getCell(row + k, 2);
      lc.value = name;
      lc.border = border;
      lc.fill = fill(k === 0 ? "FFFFFF99" : "FFF3F3F3");
      b.cells.forEach((x, i) => {
        const cell = ws.getCell(row + k, 3 + i);
        cell.border = border;
        if (k === 0) {
          cell.value = x.target;
          cell.numFmt = "#,##0";
          cell.fill = fill("FFFFFF99");
        } else if (k === 1) {
          cell.value = x.amount;
          cell.numFmt = "#,##0";
          cell.fill = fill("FFDCE6F8");
          if (x.target && x.amount < x.target) cell.font = { color: { argb: "FFE00000" } };
        } else {
          cell.value = x.target ? x.amount / x.target : null;
          cell.numFmt = "0.0%";
        }
      });
    });
    row += 3;
  });
  const ds = wb.addWorksheet("明細", { views: [{ state: "frozen", ySplit: 1 }] });
  ds.columns = [
    { header: "計上日", key: "date", width: 12 },
    { header: "プロジェクト", key: "name", width: 36 },
    { header: "担当者", key: "owner", width: 14 },
    { header: "課（当時）", key: "section", width: 10 },
    { header: "チーム（当時）", key: "team", width: 16 },
  ]
    .concat(c.resultField ? [{ header: "コンペ結果", key: "result", width: 10 }] : [])
    .concat([{ header: "金額", key: "amount", width: 15, style: { numFmt: "#,##0" } }]);
  ds.getRow(1).font = { bold: true };
  r.details.forEach((x) => ds.addRow({ date: x.date, name: x.name, owner: x.owner.name, section: x.section, team: x.orgNow.team, result: x.result, amount: x.amount }));
  return wb.xlsx.writeBuffer().then((buf) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = "VISORA_Creative_" + r.year + ".xlsx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  });
}

function CreativePage({ mode, active }) {
  const isDemo = mode === "demo";
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [sections, setSections] = useState([]);
  const [team, setTeam] = useState("");
  const [owner, setOwner] = useState("");
  const [view, setView] = useState("dashboard");
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const data = cache[year];

  useEffect(() => {
    if (!active || cache[year]) return;
    setLoading(true);
    setError("");
    AppCreative.load(year, mode)
      .then((d) => setCache((c) => Object.assign({}, c, { [year]: d })))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [active, year]);

  const r = useMemo(() => (data ? AppCreative.build(data, { year, sections, team, owner }) : null), [data, year, sections, team, owner]);
  const secAll = AppConfig.creative.sections.map((s) => s.key);
  const years = [];
  for (let y = thisYear + 1; y >= 2019; y--) years.push(y);
  const off = AppConfig.creative.periodOffset || 0;

  const doExport = () => {
    if (!r) return;
    if (AppConfig.demoOnly) return setError("この確認用ページではファイルをダウンロードできません。Excelの出力は本番の画面で使えます。");
    setExporting(true);
    crExportExcel(r)
      .catch((e) => setError(e.message))
      .finally(() => setExporting(false));
  };

  return (
    <div className="page" hidden={!active}>
      <main className="main cr-main">
        <div className="cr-filters">
          <label className="cr-field">
            <span>期</span>
            <select id="cr-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y - off}期（{y}年）
                </option>
              ))}
            </select>
          </label>
          <div className="cr-field">
            <span>課</span>
            <ChipChoices all={secAll} selected={sections} onChange={setSections} />
          </div>
          <label className="cr-field">
            <span>チーム</span>
            <select id="cr-team" value={team} onChange={(e) => (setTeam(e.target.value), setOwner(""))}>
              <option value="">すべて</option>
              {(r ? r.teams : []).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="cr-field">
            <span>担当者</span>
            <select id="cr-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">すべて</option>
              {(r ? r.ownerChoices : []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="alert error">{error}</div>}
        {loading && <div className="alert info">プロジェクト管理のデータを読み込んでいます…</div>}

        {r && (
          <section className="card">
            <div className="card-head">
              <div className="card-title">
                クリエイティブ部 売上
                <span className="card-sub">
                  {r.period}期（{r.year}年1月〜12月）　プロジェクト {r.details.length.toLocaleString()}件
                </span>
              </div>
              <div className="toolbar">
                <div className="seg" role="group" aria-label="表示">
                  {[
                    ["dashboard", "ダッシュボード"],
                    ["table", "表"],
                    ["detail", "明細"],
                  ].map(([k, l]) => (
                    <button key={k} className={view === k ? "on" : ""} aria-pressed={view === k} onClick={() => setView(k)}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="spacer" />
                <button className="btn sm primary" onClick={doExport} disabled={exporting}>
                  {exporting ? "作成中…" : "Excel"}
                </button>
              </div>
            </div>
            {view === "dashboard" && <CrDashboard r={r} />}
            {view === "table" && <CrTable r={r} />}
            {view === "detail" && <CrDetail r={r} isDemo={isDemo} />}
          </section>
        )}
      </main>
    </div>
  );
}
