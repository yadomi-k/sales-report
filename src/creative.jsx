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
  const labels = r.months.map((ym) => (r.fullYear ? Number(ym.slice(5)) + "月" : ym.slice(0, 4) + "/" + Number(ym.slice(5))));

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
    r.sections.filter((s) => s.amount || s.target).map((s) => ({ key: s.key, label: s.label + "成績予測", amount: s.amount, target: s.target }))
  );

  return (
    <div className="cr-dash">
      <section className="cr-panel wide">
        <h3>
          【{r.periodLabel}】売上予測<span className="cr-sub">計上日 {r.fromYM.replace("-", "/")}〜{r.toYM.replace("-", "/")}</span>
        </h3>
        <CrChart config={salesChart} height="20rem" label="月別の金額と目標金額" />
      </section>

      <div className="cr-kpis">
        {kpis.map((k) => (
          <section key={k.key} className={"cr-kpi" + (k.strong ? " strong" : "")}>
            <div className="cr-kpi-label">
              {r.periodLabel}：{k.label}
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
            <h3>{r.periodLabel}：コンペ結果集計（月別）</h3>
            {totalResults ? <CrChart config={compeBar} height="22rem" label="月別のコンペ結果の件数" /> : <div className="cr-empty">コンペ結果が入っているプロジェクトがありません</div>}
          </section>
          <section className="cr-panel">
            <h3>{r.periodLabel}：コンペ結果集計</h3>
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
  const cols = AppAgg.buildColumns(r.fromYM, r.toYM, r.colOpts || { quarter: true, half: true });
  const sumOf = (monthly, col) =>
    col.months.reduce(
      (a, ym) => {
        const i = r.months.indexOf(ym);
        return { amount: a.amount + monthly[i].amount, target: a.target + monthly[i].target };
      },
      { amount: 0, target: 0 }
    );
  // 絞り込みで数字がなくなった課（SD・GD）は出さない
  const blocks = [{ label: "合計", monthly: r.monthly }].concat(r.sections.filter((s) => s.amount || s.target).map((s) => ({ label: s.label, monthly: s.monthly })));
  return {
    cols,
    blocks: blocks.map((b) => ({ label: b.label, cells: cols.map((col) => sumOf(b.monthly, col)) })),
  };
}

// 担当者別の表：チームごとに担当者を並べ、1人ごとに「目標金額」「金額」の2行。チームの小計と全体の合計も出す
function crPeopleModel(r) {
  const cols = AppAgg.buildColumns(r.fromYM, r.toYM, r.colOpts || { quarter: true, half: true });
  const sum = (monthly, col) =>
    col.months.reduce(
      (a, ym) => {
        const i = r.months.indexOf(ym);
        return { amount: a.amount + monthly[i].amount, target: a.target + monthly[i].target };
      },
      { amount: 0, target: 0 }
    );
  const teams = r.teamsTable.map((t) => ({
    team: t.team,
    section: t.section,
    people: t.people.map((p) => ({ name: p.name, cells: cols.map((c) => sum(p.monthly, c)) })),
    subtotal: cols.map((c) => sum(t.monthly, c)),
  }));
  return { cols, teams, total: cols.map((c) => sum(r.monthly, c)) };
}

function CrPeopleTable({ r }) {
  const t = crPeopleModel(r);
  // 1人（または小計・合計）ぶんの2行。head は行の左側の見出しセル（1行目にだけ入る）
  const pair = (key, head, cells, cls) => [
    <tr key={key + ":t"} className={"block-first " + cls}>
      {head}
      <th className="sticky c3 label">目標金額</th>
      {cells.map((x, i) => (
        <td key={i} className={"k-" + t.cols[i].kind}>
          {crYen(x.target)}
        </td>
      ))}
    </tr>,
    <tr key={key + ":a"} className={cls}>
      <th className="sticky c3 label">金額</th>
      {cells.map((x, i) => (
        <td key={i} className={"sales k-" + t.cols[i].kind + (x.target && x.amount < x.target ? " red" : "")}>
          {crYen(x.amount)}
        </td>
      ))}
    </tr>,
  ];
  const body = [];
  t.teams.forEach((team) => {
    const span = team.people.length * 2 + 2;
    team.people.forEach((p, i) => {
      body.push(
        ...pair(
          team.team + "/" + team.section + "/" + p.name,
          <>
            {i === 0 && (
              <th className="sticky c1w team-cell" rowSpan={span}>
                {team.team}
                <span className="team-sec">{team.section}</span>
              </th>
            )}
            <th className="sticky c2w person" rowSpan={2}>
              {p.name}
            </th>
          </>,
          p.cells,
          ""
        )
      );
    });
    body.push(
      ...pair(
        team.team + "/" + team.section + "/小計",
        <th className="sticky c2w person subtotal" rowSpan={2}>
          小計
        </th>,
        team.subtotal,
        "r-subtotal"
      )
    );
  });
  body.push(
    ...pair(
      "合計",
      <th className="sticky c1w person total-cell" colSpan={2} rowSpan={2}>
        合計
      </th>,
      t.total,
      "r-total"
    )
  );
  return (
    <div className="table-block">
      <div className="table-title">担当者別</div>
      <div className="table-scroll">
        <table className="report people">
          <thead>
            <tr>
              <th className="sticky c1w blank">チーム</th>
              <th className="sticky c2w blank">担当者</th>
              <th className="sticky c3 blank"></th>
              {t.cols.map((c) => (
                <th key={c.key} className={"h-" + c.kind}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </div>
  );
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
                    const k = " k-" + t.cols[i].kind;
                    if (row === "目標") return <td key={i} className={k}>{crYen(x.target)}</td>;
                    if (row === "金額") return <td key={i} className={"sales" + k + (x.target && x.amount < x.target ? " red" : "")}>{crYen(x.amount)}</td>;
                    return <td key={i} className={k}>{crPct(x.amount, x.target)}</td>;
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
  const SUM_FILL = { quarter: "FFF1E8FD", half: "FFE9E4F6", total: "FFE0D9F2" }; // 集計列の数字のセル
  ws.getCell(1, 1).value = "VISORA クリエイティブ売上（" + r.periodLabel + "）出力日時 " + new Date().toLocaleString("ja-JP");
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
        const kind = t.cols[i].kind;
        if (kind !== "month") cell.fill = fill(SUM_FILL[kind]);
        if (kind === "total") cell.font = { bold: true };
        if (k === 0) {
          cell.value = x.target;
          cell.numFmt = "#,##0";
          cell.fill = fill(kind === "month" ? "FFFFFF99" : "FFFBEEA0");
        } else if (k === 1) {
          cell.value = x.amount;
          cell.numFmt = "#,##0";
          if (kind === "month") cell.fill = fill("FFDCE6F8");
          if (x.target && x.amount < x.target) cell.font = { color: { argb: "FFE00000" } };
        } else {
          cell.value = x.target ? x.amount / x.target : null;
          cell.numFmt = "0.0%";
        }
      });
    });
    row += 3;
  });
  // 担当者別（チーム → 担当者。1人ごとに目標金額・金額の2行、チームの小計、全体の合計）
  const ps = wb.addWorksheet("担当者別", { views: [{ state: "frozen", xSplit: 3, ySplit: 2 }] });
  const pm = crPeopleModel(r);
  ps.getColumn(1).width = 16;
  ps.getColumn(2).width = 14;
  ps.getColumn(3).width = 10;
  ["チーム", "担当者", ""].forEach((v, i) => {
    const h = ps.getCell(2, 1 + i);
    h.value = v;
    h.font = { bold: true };
    h.border = border;
  });
  pm.cols.forEach((col, i) => {
    ps.getColumn(4 + i).width = 14;
    const h = ps.getCell(2, 4 + i);
    h.value = col.label;
    h.fill = fill(head[col.kind]);
    h.font = { bold: true, color: { argb: col.kind === "total" ? "FFFFFFFF" : "FF000000" } };
    h.alignment = { horizontal: "center" };
    h.border = border;
  });
  ps.getCell(1, 1).value = "担当者別（" + r.periodLabel + "）";
  ps.getCell(1, 1).font = { bold: true, size: 12 };
  let pr = 3;
  const put = (team, name, cells, style) => {
    ps.getCell(pr, 1).value = team;
    ps.getCell(pr, 2).value = name;
    ps.getCell(pr, 3).value = "目標金額";
    ps.getCell(pr + 1, 3).value = "金額";
    for (let k = 0; k < 2; k++) for (let c = 1; c <= 3 + cells.length; c++) {
      const cell = ps.getCell(pr + k, c);
      cell.border = border;
      if (style) cell.fill = fill(style);
    }
    cells.forEach((x, i) => {
      const kind = pm.cols[i].kind;
      if (kind !== "month" && !style) {
        ps.getCell(pr, 4 + i).fill = fill(SUM_FILL[kind]);
        ps.getCell(pr + 1, 4 + i).fill = fill(SUM_FILL[kind]);
      }
      const tc = ps.getCell(pr, 4 + i);
      tc.value = x.target;
      tc.numFmt = "#,##0";
      const ac = ps.getCell(pr + 1, 4 + i);
      ac.value = x.amount;
      ac.numFmt = "#,##0";
      if (x.target && x.amount < x.target) ac.font = { color: { argb: "FFE00000" } };
    });
    pr += 2;
  };
  pm.teams.forEach((team) => {
    team.people.forEach((p) => put(team.team, p.name, p.cells));
    put(team.team, "小計", team.subtotal, "FFEEF3FB");
  });
  put("合計", "", pm.total, "FFFFF6C4");

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
    a.download = "VISORA_Creative_" + r.fromYM.replace("-", "") + "-" + r.toYM.replace("-", "") + ".xlsx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  });
}

function crDefaultFilters() {
  const y = new Date().getFullYear();
  return { fromYM: y + "-01", toYM: y + "-12", dept: "", sectionName: "", team: "", owner: "", quarter: true, half: true };
}

function CreativeSidebar({ draft, setDraft, choices, onSearch, onClear, onClose, loading, dirty }) {
  const set = (patch) => setDraft(Object.assign({}, draft, patch));
  const y = new Date().getFullYear();
  const now = new Date();
  const thisYM = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const isYear = (yy) => draft.fromYM === yy + "-01" && draft.toYM === yy + "-12";
  const ownerName = (id) => ((choices.ownerChoices || []).find((u) => u.id === id) || {}).name || "";
  return (
    <div className="sidebar-inner">
      <div className="sidebar-head">
        <div className="sidebar-title">検索・絞り込み</div>
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="検索・絞り込みを閉じる" title="検索・絞り込みを閉じる">
          <span className="sp-only">×</span>
          <span className="pc-only">«</span>
        </button>
      </div>

      <SidebarSection id="cr-period" title="期間（計上日）" active={draft.fromYM.replace("-", "/") + "〜" + draft.toYM.replace("-", "/")}>
        <div className="period">
          <span>開始</span>
          <input id="cr-from" type="month" aria-label="開始月" value={draft.fromYM} onChange={(e) => e.target.value && set({ fromYM: e.target.value })} />
          <span>終了</span>
          <input id="cr-to" type="month" aria-label="終了月" value={draft.toYM} onChange={(e) => e.target.value && set({ toYM: e.target.value })} />
        </div>
        <div className="quick">
          <button type="button" className={"chip small" + (draft.fromYM === thisYM && draft.toYM === thisYM ? " on" : "")} onClick={() => set({ fromYM: thisYM, toYM: thisYM })}>
            今月
          </button>
          {[y - 1, y, y + 1].map((yy) => (
            <button type="button" key={yy} className={"chip small" + (isYear(yy) ? " on" : "")} onClick={() => set({ fromYM: yy + "-01", toYM: yy + "-12" })} title={yy + "年1月〜12月"}>
              {AppCreative.periodOf(yy)}期
            </button>
          ))}
        </div>
        <label className="mini-field" style={{ marginTop: "0.5rem" }}>
          <span>期を選ぶ</span>
          <select
            id="cr-period-select"
            value={draft.fromYM.slice(5) === "01" && draft.toYM === draft.fromYM.slice(0, 4) + "-12" ? draft.fromYM.slice(0, 4) : ""}
            onChange={(e) => e.target.value && set({ fromYM: e.target.value + "-01", toYM: e.target.value + "-12" })}
          >
            <option value="">（期間を指定中）</option>
            {Array.from({ length: y + 1 - 2019 + 1 }, (_, i) => y + 1 - i).map((yy) => (
              <option key={yy} value={yy}>
                {AppCreative.periodOf(yy)}期（{yy}年）
              </option>
            ))}
          </select>
        </label>
      </SidebarSection>

      <SidebarSection
        id="cr-org"
        title="部署・担当者"
        active={draft.owner ? ownerName(draft.owner) : [draft.dept, draft.sectionName, draft.team].filter(Boolean).join(" / ")}
      >
        <div className="stack">
          <label className="mini-field">
            <span>部</span>
            <select id="cr-dept" value={draft.dept} onChange={(e) => set({ dept: e.target.value, sectionName: "", team: "", owner: "" })}>
              <option value="">すべて</option>
              {(choices.depts || []).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            <span>課</span>
            <select id="cr-sectionName" value={draft.sectionName} onChange={(e) => set({ sectionName: e.target.value, team: "", owner: "" })}>
              <option value="">すべて</option>
              {(choices.sectionNames || []).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            <span>チーム</span>
            <select id="cr-team" value={draft.team} onChange={(e) => set({ team: e.target.value, owner: "" })}>
              <option value="">すべて</option>
              {(choices.teams || []).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            <span>担当者</span>
            <select id="cr-owner" value={draft.owner} onChange={(e) => set({ owner: e.target.value })}>
              <option value="">すべて</option>
              {(choices.ownerChoices || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sidebar-hint">部・課・チームは、プロジェクトの当時の所属（空欄の場合は担当者の今の所属）で絞り込みます。</div>
        </div>
      </SidebarSection>

      <SidebarSection id="cr-display" title="表示">
        <div className="mini-field">
          <span>集計列</span>
          <label className="check">
            <input id="cr-quarter" type="checkbox" checked={draft.quarter} onChange={(e) => set({ quarter: e.target.checked })} />
            四半期合計
          </label>
          <label className="check">
            <input id="cr-half" type="checkbox" checked={draft.half} onChange={(e) => set({ half: e.target.checked })} />
            上期計・下期計
          </label>
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

function CreativePage({ mode, active }) {
  const isDemo = mode === "demo";
  const [draft, setDraft] = useState(crDefaultFilters);
  const [applied, setApplied] = useState(null);
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("dashboard");
  const [exporting, setExporting] = useState(false);
  const [sidebarClosed, setSidebarClosed] = useState(() => !!readPref(SIDEBAR_PREF, false));
  const [panelOpen, setPanelOpen] = useState(false);
  const keyOf = (f) => f.fromYM + "|" + f.toYM;

  const search = (f) => {
    if (f.fromYM > f.toYM) return setError("期間の開始が終了より後になっています。");
    setError("");
    if (cache[keyOf(f)]) return setApplied(f);
    setLoading(true);
    AppCreative.load(f.fromYM, f.toYM, mode)
      .then((d) => {
        setCache((c) => Object.assign({}, c, { [keyOf(f)]: d }));
        setApplied(f);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (active && !applied && !loading) search(draft); // 最初に今期のデータを表示する
  }, [active]);
  useEffect(() => {
    if (!active) return;
    document.body.classList.toggle("no-scroll", panelOpen);
    const onKey = (e) => e.key === "Escape" && setPanelOpen(false);
    if (panelOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, active]);

  const data = applied ? cache[keyOf(applied)] : null;
  const r = useMemo(() => {
    if (!data) return null;
    const res = AppCreative.build(data, applied);
    res.colOpts = { quarter: applied.quarter, half: applied.half };
    return res;
  }, [data, applied]);
  // 絞り込みの選択肢（チーム・担当者）は、今サイドバーで選んでいる課・チームに合わせる
  const choices = useMemo(
    () => (data ? AppCreative.build(data, Object.assign({}, applied, { dept: draft.dept, sectionName: draft.sectionName, team: draft.team, owner: "" })) : {}),
    [data, applied, draft.dept, draft.sectionName, draft.team]
  );

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
  const dirty = applied && JSON.stringify(applied) !== JSON.stringify(draft);

  const doExport = () => {
    if (!r) return;
    if (AppConfig.demoOnly) return setError("この確認用ページではファイルをダウンロードできません。Excelの出力は本番の画面で使えます。");
    setExporting(true);
    crExportExcel(r)
      .catch((e) => setError(e.message))
      .finally(() => setExporting(false));
  };

  const chips = [];
  if (r) {
    chips.push(r.fullYear ? r.periodLabel + "（" + r.fromYM.slice(0, 4) + "年）" : r.periodLabel);
    const org = [applied.dept, applied.sectionName].filter(Boolean).join(" / ");
    if (org && !applied.owner && !applied.team) chips.push(org);
    if (applied.owner) chips.push(((choices.ownerChoices || []).find((u) => u.id === applied.owner) || {}).name || "担当者");
    else if (applied.team) chips.push(applied.team);
  }

  return (
    <div className="page" hidden={!active}>
      <div className={"layout" + (sidebarClosed ? " sidebar-closed" : "")}>
        <aside className={"sidebar" + (panelOpen ? " open" : "")} aria-label="検索・絞り込み">
          <CreativeSidebar
            draft={draft}
            setDraft={setDraft}
            choices={choices}
            loading={loading}
            dirty={dirty}
            onSearch={() => runSearch(draft)}
            onClear={() => setDraft(crDefaultFilters())}
            onClose={() => (isDesktop() ? toggleSidebar() : setPanelOpen(false))}
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
            {r && <span className="count">プロジェクト {r.details.length.toLocaleString()}件</span>}
          </div>

          {error && <div className="alert error">{error}</div>}
          {loading && <div className="alert info">プロジェクト管理のデータを読み込んでいます…</div>}

          {r && (
            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  クリエイティブ部 売上
                  <span className="card-sub">
                    {r.fullYear ? r.periodLabel + "　" : ""}計上日 {r.fromYM.replace("-", "/")}〜{r.toYM.replace("-", "/")}
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
              {view === "table" && (
                <>
                  <CrTable r={r} />
                  <CrPeopleTable r={r} />
                </>
              )}
              {view === "detail" && <CrDetail r={r} isDemo={isDemo} />}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
