// VISORA：Salesタブの「変更履歴（週次）」— 商談の売上金額・案件ステージの変更を、担当者（商談所有者）ごとに見る
// ※ useState などは src/app.jsx で宣言したものを使う

const HI_TONE = { up: "hi-up", down: "hi-down" };
const hiYen = (v) => Math.round(v || 0).toLocaleString("ja-JP");
const hiSigned = (v) => (v > 0 ? "+" : v < 0 ? "▲" : "±") + hiYen(Math.abs(v || 0));

function hiDefaultFilters() {
  const r = AppHistory.defaultRange();
  return { from: r.from, to: r.to, salesFrom: "", salesTo: "", honbu: "", dept: "", section: "", team: "", owner: "" };
}

function HistorySidebar({ draft, setDraft, people, onSearch, onClear, onClose, loading, dirty }) {
  const set = (patch) => setDraft(Object.assign({}, draft, patch));
  const today = AppHistory.todayJST();
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0=日
  const thisMon = AppHistory.addDays(today, -((dow + 6) % 7));
  const quick = [
    { label: "直近1週間", from: AppHistory.addDays(today, -7), to: today },
    { label: "今週", from: thisMon, to: today },
    { label: "先週", from: AppHistory.addDays(thisMon, -7), to: AppHistory.addDays(thisMon, -1) },
    { label: "直近2週間", from: AppHistory.addDays(today, -14), to: today },
  ];
  const rank = AppAgg.orgRank;
  const uniq = (a) => Array.from(new Set(a.filter(Boolean))).sort((x, y) => rank(x) - rank(y) || x.localeCompare(y, "ja"));
  const list = Object.values(
    people.filter(AppAgg.isTargetOrg).reduce((m, u) => {
      m[u.id] = u;
      return m;
    }, {})
  );
  const inH = list.filter((u) => !draft.honbu || u.honbu === draft.honbu);
  const inD = inH.filter((u) => !draft.dept || u.dept === draft.dept);
  const inS = inD.filter((u) => !draft.section || u.section === draft.section);
  const inT = inS.filter((u) => !draft.team || u.team === draft.team);
  const owners = inT.slice().sort((a, b) => (a.team || "").localeCompare(b.team || "", "ja") || AppAgg.comparePeople(a, b));
  const ownerName = (id) => (list.find((u) => u.id === id) || {}).name || "";
  return (
    <div className="sidebar-inner">
      <div className="sidebar-head">
        <div className="sidebar-title">検索・絞り込み</div>
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="検索・絞り込みを閉じる" title="検索・絞り込みを閉じる">
          <span className="sp-only">×</span>
          <span className="pc-only">«</span>
        </button>
      </div>

      <SidebarSection id="hi-period" title="期間（編集日）" active={draft.from.replace(/-/g, "/") + "〜" + draft.to.replace(/-/g, "/")}>
        <div className="period">
          <span>開始</span>
          <input id="hi-from" type="date" aria-label="開始日" value={draft.from} onChange={(e) => e.target.value && set({ from: e.target.value })} />
          <span>終了</span>
          <input id="hi-to" type="date" aria-label="終了日" value={draft.to} onChange={(e) => e.target.value && set({ to: e.target.value })} />
        </div>
        <div className="quick">
          {quick.map((q) => (
            <button type="button" key={q.label} className={"chip small" + (draft.from === q.from && draft.to === q.to ? " on" : "")} onClick={() => set({ from: q.from, to: q.to })}>
              {q.label}
            </button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection
        id="hi-sales"
        title="売上日"
        active={draft.salesFrom || draft.salesTo ? (draft.salesFrom || "").replace("-", "/") + "〜" + (draft.salesTo || "").replace("-", "/") : ""}
      >
        <div className="period">
          <span>開始</span>
          <input id="hi-sales-from" type="month" aria-label="売上日の開始月" value={draft.salesFrom} onChange={(e) => set({ salesFrom: e.target.value })} />
          <span>終了</span>
          <input id="hi-sales-to" type="month" aria-label="売上日の終了月" value={draft.salesTo} onChange={(e) => set({ salesTo: e.target.value })} />
        </div>
        <div className="quick">
          {(() => {
            const y = Number(today.slice(0, 4));
            const ym = today.slice(0, 7);
            return [
              { label: "今月", from: ym, to: ym },
              { label: y + "年", from: y + "-01", to: y + "-12" },
              { label: y + 1 + "年", from: y + 1 + "-01", to: y + 1 + "-12" },
              { label: "指定なし", from: "", to: "" },
            ].map((q) => (
              <button type="button" key={q.label} className={"chip small" + (draft.salesFrom === q.from && draft.salesTo === q.to ? " on" : "")} onClick={() => set({ salesFrom: q.from, salesTo: q.to })}>
                {q.label}
              </button>
            ));
          })()}
        </div>
        <div className="sidebar-hint">商談の今の売上日で絞り込みます。空欄は指定なしです。</div>
      </SidebarSection>

      <SidebarSection
        id="hi-org"
        title="部署・担当者"
        active={draft.owner ? ownerName(draft.owner) : [draft.dept || draft.honbu, draft.section, draft.team].filter(Boolean).join(" / ")}
      >
        <div className="stack">
          {[
            ["本部", "honbu", uniq(list.map((u) => u.honbu)), { dept: "", section: "", team: "", owner: "" }],
            ["部", "dept", uniq(inH.map((u) => u.dept)), { section: "", team: "", owner: "" }],
            ["課", "section", uniq(inD.map((u) => u.section)), { team: "", owner: "" }],
            ["チーム", "team", uniq(inS.map((u) => u.team)), { owner: "" }],
          ].map(([label, key, opts, reset]) => (
            <label className="mini-field" key={key}>
              <span>{label}</span>
              <select id={"hi-" + key} value={draft[key]} onChange={(e) => set(Object.assign({ [key]: e.target.value }, reset))}>
                <option value="">すべて</option>
                {opts.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="mini-field">
            <span>担当者</span>
            <select id="hi-owner" value={draft.owner} onChange={(e) => set({ owner: e.target.value })}>
              <option value="">すべて</option>
              {owners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.title ? "（" + u.title + "）" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="sidebar-hint">担当者は商談の所有者です。選択肢には、期間中に変更があった商談の所有者が出ます。</div>
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

// 1行の「変更前 → 変更後」
function hiValue(row, which) {
  const v = which === "old" ? row.oldValue : row.newValue;
  if (row.field === "amount") return hiYen(v);
  const g = AppHistory.groupOf(v);
  const label = (AppConfig.history.groups.find((x) => x.key === g) || {}).label;
  return (
    <>
      {v || "（空欄）"}
      {label && <span className={"hi-group g-" + g}>{label}</span>}
    </>
  );
}

// 売上日の月ごとの増減の棒グラフ（増えた月は緑、減った月は赤）
function HistoryChart({ r, series, setSeries }) {
  const ref = useRef(null);
  const options = AppConfig.history.groups.map((g) => [g.key, g.label]).concat([["all", "全体"]]);
  const label = (options.find((o) => o[0] === series) || [])[1] || "";
  useEffect(() => {
    if (!window.Chart || !ref.current) return;
    const months = r.monthly;
    const data = months.map((m) => m[series] || 0);
    const chart = new Chart(ref.current, {
      type: "bar",
      data: {
        labels: months.map((m) => (m.ym === "none" ? "売上日なし" : m.ym.slice(0, 4) + "/" + Number(m.ym.slice(5)))),
        datasets: [
          {
            label: label + "の増減",
            data,
            backgroundColor: data.map((v) => (v >= 0 ? "#2bb38a" : "#e35d5d")),
            borderRadius: 3,
            maxBarThickness: 56,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => label + "の増減：" + hiSigned(ctx.raw) + "円",
              afterLabel: (ctx) => "変更があった商談：" + months[ctx.dataIndex].count + "件",
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { ticks: { callback: (v) => (v > 0 ? "+" : v < 0 ? "▲" : "") + Math.abs(v).toLocaleString("ja-JP") } },
        },
      },
    });
    return () => chart.destroy();
  }, [r, series]);
  const total = r.monthly.reduce((a, m) => a + (m[series] || 0), 0);
  return (
    <div className="hi-chart">
      <div className="hi-chart-head">
        <div className="hi-chart-title">
          売上日の月ごとの増減
          <span className={"hi-chart-total " + (total > 0 ? "hi-up" : total < 0 ? "hi-down" : "")}>合計 {hiSigned(total)}円</span>
        </div>
        <div className="seg" role="group" aria-label="グラフの区分">
          {options.map(([k, l]) => (
            <button key={k} className={series === k ? "on" : ""} aria-pressed={series === k} onClick={() => setSeries(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {r.monthly.length ? (
        <div className="hi-chart-box">
          <canvas ref={ref} role="img" aria-label={"売上日の月ごとの" + label + "の増減"} />
        </div>
      ) : (
        <div className="cr-empty">この条件で、期間中の変更はありません。</div>
      )}
    </div>
  );
}

function HistoryTable({ r, isDemo }) {
  if (!r.rowCount) return <div className="cr-empty">この条件で、期間中の変更はありません。</div>;
  const sumCells = (s) => (
    <>
      <td colSpan={4} className="hi-sum-label">
        {s.count}件
      </td>
      <td className="num" colSpan={3}>
        {s.diff !== 0 && <span className={s.diff > 0 ? "hi-up" : "hi-down"}>金額の増減 {hiSigned(s.diff)}</span>}
        {s.toWon > 0 && <span className="hi-up">受注になった {hiYen(s.toWon)}</span>}
        {s.toLost > 0 && <span className="hi-down">失注などになった {hiYen(s.toLost)}</span>}
      </td>
      <td colSpan={3}></td>
    </>
  );
  return (
    <div className="table-block">
      <div className="table-scroll">
        <table className="detail history">
          <thead>
            <tr>
              <th>担当者</th>
              <th>編集日</th>
              <th>商談名</th>
              <th>取引先名</th>
              <th>項目</th>
              <th>変更前</th>
              <th>変更後</th>
              <th>差額／金額</th>
              <th>受注確度</th>
              <th>売上日</th>
              <th>編集した人</th>
            </tr>
          </thead>
          <tbody>
            {r.owners.map((g) => [
              ...g.rows.map((row, i) => (
                <tr key={row.id} className={HI_TONE[row.tone] ? "tone-" + row.tone : ""}>
                  {i === 0 && (
                    <th className="hi-owner" rowSpan={g.rows.length + 1}>
                      {g.owner.name}
                      {g.owner.title && <span className="person-title">{g.owner.title}</span>}
                      <span className="team-sec">{[g.owner.dept, g.owner.section, g.owner.team].filter(Boolean).join(" / ")}</span>
                    </th>
                  )}
                  <td>{row.atText}</td>
                  <td className="text">
                    {isDemo ? (
                      row.opp.name
                    ) : (
                      <a href={AppSSO.recordUrl("Opportunity", row.opp.id)} target="_blank" rel="noreferrer">
                        {row.opp.name}
                      </a>
                    )}
                  </td>
                  <td className="text">{row.opp.account}</td>
                  <td className="text">{row.field === "amount" ? "売上金額" : "案件ステージ"}</td>
                  <td className="text muted">{hiValue(row, "old")}</td>
                  <td className={"text" + (HI_TONE[row.tone] ? " " + HI_TONE[row.tone] : "")}>{hiValue(row, "new")}</td>
                  <td className={HI_TONE[row.tone] || ""}>{row.field === "amount" ? hiSigned(row.diff) : <span className="muted">{hiYen(row.amount)}</span>}</td>
                  <td>
                    {LEVEL_COLORS[row.possibility] && row.possibility !== "その他" ? (
                      <span className="level" style={{ background: LEVEL_COLORS[row.possibility] }}>
                        {row.possibility}
                      </span>
                    ) : (
                      <span className="muted">{row.possibility || "―"}</span>
                    )}
                  </td>
                  <td>{(row.opp.salesDate || "").replace(/-/g, "/")}</td>
                  <td className="text muted">{row.editor}</td>
                </tr>
              )),
              <tr key={g.owner.id + "sum"} className="hi-subtotal">
                {sumCells(g.subtotal)}
              </tr>,
            ])}
            <tr className="hi-total">
              <th className="hi-owner">合計（検索した範囲）</th>
              {sumCells(r.total)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Excel出力
function hiExportExcel(r, f, kindLabel, groupLabel) {
  if (!window.ExcelJS) return Promise.reject(new Error("Excel出力の部品を読み込めませんでした。"));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("変更履歴", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.getCell(1, 1).value = "VISORA 商談の変更履歴（" + f.from.replace(/-/g, "/") + "〜" + f.to.replace(/-/g, "/") + "）出力日時 " + new Date().toLocaleString("ja-JP");
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.getCell(2, 1).value =
    "上部の集計：" + r.tiles.map((t) => t.label + " " + hiSigned(t.delta)).join("　") + "　／　表示：" + kindLabel + (groupLabel ? "・" + groupLabel + "の商談" : "");
  const head = ["担当者", "所属", "編集日", "商談名", "取引先名", "項目", "変更前", "変更後", "差額", "金額", "受注確度", "売上日", "編集した人"];
  const widths = [14, 28, 17, 34, 22, 12, 16, 16, 14, 14, 9, 12, 14];
  head.forEach((h, i) => {
    const c = ws.getCell(4, 1 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBE7FB" } };
    ws.getColumn(1 + i).width = widths[i];
  });
  let row = 5;
  const green = { color: { argb: "FF12866B" } };
  const red = { color: { argb: "FFD32020" } };
  const sumRow = (label, s, fill) => {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 6).value = s.count + "件";
    ws.getCell(row, 9).value = s.diff;
    ws.getCell(row, 9).numFmt = '+#,##0;"▲"#,##0;"±0"';
    ws.getCell(row, 10).value = "受注になった " + hiYen(s.toWon) + " ／ 失注などになった " + hiYen(s.toLost);
    for (let c = 1; c <= head.length; c++) {
      ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      ws.getCell(row, c).font = { bold: true };
    }
    row++;
  };
  r.owners.forEach((g) => {
    g.rows.forEach((x) => {
      const vals = [
        g.owner.name + (g.owner.title ? "（" + g.owner.title + "）" : ""),
        [g.owner.dept, g.owner.section, g.owner.team].filter(Boolean).join(" / "),
        x.atText,
        x.opp.name,
        x.opp.account,
        x.field === "amount" ? "売上金額" : "案件ステージ",
        x.oldValue,
        x.newValue,
        x.field === "amount" ? x.diff : null,
        x.field === "stage" ? x.amount : null,
        x.possibility,
        (x.opp.salesDate || "").replace(/-/g, "/"),
        x.editor,
      ];
      vals.forEach((v, i) => {
        const c = ws.getCell(row, 1 + i);
        c.value = v;
        if (typeof v === "number") c.numFmt = i === 8 ? '+#,##0;"▲"#,##0;"±0"' : "#,##0";
      });
      if (x.tone === "up") [8, 9].forEach((i) => (ws.getCell(row, i).font = green));
      if (x.tone === "down") [8, 9].forEach((i) => (ws.getCell(row, i).font = red));
      row++;
    });
    sumRow(g.owner.name + " 小計", g.subtotal, "FFEEF3FB");
  });
  sumRow("合計（検索した範囲）", r.total, "FFFFF6C4");
  return wb.xlsx.writeBuffer().then((buf) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = "VISORA_変更履歴_" + f.from.replace(/-/g, "") + "-" + f.to.replace(/-/g, "") + ".xlsx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  });
}

function HistoryPage({ mode, active }) {
  const isDemo = mode === "demo";
  const [draft, setDraft] = useState(hiDefaultFilters);
  const [applied, setApplied] = useState(null);
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("all");
  const [group, setGroup] = useState("");
  const [series, setSeries] = useState("won"); // グラフの区分（受注・情報・失注・全体）
  const [exporting, setExporting] = useState(false);
  const [sidebarClosed, setSidebarClosed] = useState(() => !!readPref(SIDEBAR_PREF, false));
  const [panelOpen, setPanelOpen] = useState(false);

  // 期間の始まりから今日までの履歴を読む（終わりより後の変更は、終わりの時点の値を戻すのに使う）
  const search = (f) => {
    if (f.from > f.to) return setError("期間の開始が終了より後になっています。");
    setError("");
    if (cache[f.from]) return setApplied(f);
    setLoading(true);
    AppHistory.load(f.from, f.to, mode)
      .then((d) => {
        setCache((c) => Object.assign({}, c, { [f.from]: d }));
        setApplied(f);
      })
      .catch((e) => {
        const msg = String(e.message || "");
        setError(
          /OpportunityFieldHistory|INVALID_FIELD|INVALID_TYPE/.test(msg)
            ? "商談の変更履歴を読めませんでした。Salesforceで「売上金額」「案件ステージ」の項目履歴管理がオンになっているか、売上金額の項目名（src/config.js の opportunity.salesAmount）を確認してください（" + msg + "）"
            : msg
        );
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (active && !applied && !loading) search(draft);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    document.body.classList.toggle("no-scroll", panelOpen);
  }, [panelOpen, active]);

  const data = applied ? cache[applied.from] : null;
  const r = useMemo(() => (data ? AppHistory.build(data, Object.assign({}, applied, { kind, group })) : null), [data, applied, kind, group]);
  const people = useMemo(() => (data ? AppHistory.build(data, { from: draft.from, to: draft.to, kind: "all" }).people : []), [data, draft.from, draft.to]);

  const isDesktop = () => window.matchMedia && window.matchMedia("(min-width: 860px)").matches;
  const toggleSidebar = () => {
    if (isDesktop()) {
      setSidebarClosed(!sidebarClosed);
      writePref(SIDEBAR_PREF, !sidebarClosed);
    } else setPanelOpen(true);
  };
  const dirty = applied && JSON.stringify(applied) !== JSON.stringify(draft);
  const KINDS = [
    ["all", "すべて"],
    ["amount", "金額の変更"],
    ["stage", "ステージの変更"],
  ];
  const groupLabel = group ? (AppConfig.history.groups.find((g) => g.key === group) || {}).label : "";

  const doExport = () => {
    if (!r) return;
    if (AppConfig.demoOnly) return setError("この確認用ページではファイルをダウンロードできません。Excelの出力は本番の画面で使えます。");
    setExporting(true);
    hiExportExcel(r, applied, KINDS.find((k) => k[0] === kind)[1], groupLabel)
      .catch((e) => setError(e.message))
      .finally(() => setExporting(false));
  };

  const chips = [];
  if (applied) {
    chips.push(applied.from.replace(/-/g, "/") + "〜" + applied.to.replace(/-/g, "/"));
    if (applied.salesFrom || applied.salesTo) chips.push("売上日 " + (applied.salesFrom || "").replace("-", "/") + "〜" + (applied.salesTo || "").replace("-", "/"));
    const org = [applied.dept || applied.honbu, applied.section, applied.team].filter(Boolean).join(" / ");
    if (applied.owner) chips.push((people.find((u) => u.id === applied.owner) || {}).name || "担当者");
    else if (org) chips.push(org);
  }

  return (
    <div className="page" hidden={!active}>
      <div className={"layout" + (sidebarClosed ? " sidebar-closed" : "")}>
        <aside className={"sidebar" + (panelOpen ? " open" : "")} aria-label="検索・絞り込み">
          <HistorySidebar
            draft={draft}
            setDraft={setDraft}
            people={people}
            loading={loading}
            dirty={dirty}
            onSearch={() => {
              search(draft);
              if (!isDesktop()) setPanelOpen(false);
            }}
            onClear={() => setDraft(hiDefaultFilters())}
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
            {r && <span className="count">変更 {r.rowCount.toLocaleString()}件／商談 {r.oppCount.toLocaleString()}件</span>}
          </div>

          {error && <div className="alert error">{error}</div>}
          {loading && <div className="alert info">商談の変更履歴を読み込んでいます…</div>}

          {r && (
            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  商談の変更履歴
                  <span className="card-sub">
                    編集日 {r.from.replace(/-/g, "/")}〜{r.to.replace(/-/g, "/")}
                  </span>
                </div>
              </div>
              <div className="hi-tiles">
                {r.tiles.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={"hi-tile g-" + t.key + (group === t.key ? " on" : "")}
                    aria-pressed={group === t.key}
                    onClick={() => {
                      // 集計を押したら、明細とグラフをその区分に合わせる
                      setGroup(group === t.key ? "" : t.key);
                      if (group !== t.key) setSeries(t.key);
                    }}
                    title={t.stages.join("・")}
                  >
                    <span className="hi-tile-label">
                      {t.label}
                      {t.invert && <span className="hi-tile-note">増えると売上が減るため▲で表示</span>}
                    </span>
                    <span className={"hi-tile-value " + (t.delta > 0 ? "hi-up" : t.delta < 0 ? "hi-down" : "")}>{hiSigned(t.delta)}円</span>
                    <span className="hi-tile-sub">
                      入った {t.inCount}件／出た {t.outCount}件
                    </span>
                  </button>
                ))}
              </div>
              <HistoryChart r={r} series={series} setSeries={setSeries} />
              <div className="toolbar hi-toolbar">
                <div className="seg" role="group" aria-label="表示する変更">
                  {KINDS.map(([k, l]) => (
                    <button key={k} className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>
                      {l}
                    </button>
                  ))}
                </div>
                {group && (
                  <span className="cond">
                    {groupLabel}の商談だけ表示中
                    <button type="button" className="link-btn" onClick={() => setGroup("")} style={{ marginLeft: "0.375rem" }}>
                      解除
                    </button>
                  </span>
                )}
                <div className="spacer" />
                <button className="btn sm primary" onClick={doExport} disabled={exporting}>
                  {exporting ? "作成中…" : "Excel"}
                </button>
              </div>
              <HistoryTable r={r} isDemo={isDemo} />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
