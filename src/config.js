// 売上レポートの設定（試作品）
//
// Salesforceの項目の「API参照名」はここにまとめています。
// 設定 → オブジェクトマネージャ → （商談 / 商談分割 / ユーザ）→ 項目とリレーション で確認できます。
// ※「仮」と書いてある値は、まだ確認していない値です。
window.AppConfig = {
  salesforce: {
    // 会社のSalesforceの「私のドメイン」のURL（CaseShelfと同じ）
    myDomainUrl: "https://shoei.my.salesforce.com",
    // 売上レポート専用の接続アプリケーションの「コンシューマ鍵」（作成後に入れる。手順は docs/salesforce-setup.md）
    clientId: "3MVG9YDQS5WtC11pWkeuHxMae__H3JzmpOlBsz0KkR65.yVpkhVcMM1dqfBPWWa18l5asfxiN2Q91HltOkXpj",
  },

  // 商談分割（OpportunitySplit）：個人の実績は、分割の金額・利益額をそのまま積み上げる
  split: {
    amount: "SplitAmount", // 金額（標準項目）
    profit: "SplitProfit__c", // 利益額
    // 有効な分割タイプ（「売上金額」）の分割だけを集計する。無効な分割タイプの分割が残っていても二重に数えない
    onlyActiveSplitType: true,
    // 特定の分割タイプに絞る場合はその「API参照名」を入れる（通常は "" のままでよい）
    splitTypeDeveloperName: "",
  },

  // 商談（Opportunity）
  opportunity: {
    salesDate: "EstimatedSaleDate__c", // 売上日（日付型）。月の振り分けに使う
    // 実績の商談のレコードタイプ（「実績」）。ここに入っているレコードタイプの商談だけを集計する
    actualRecordTypeIds: ["0126F000000oIzAQAU"],
    // 受注確度の決め方
    //  ・wonStages のステージ → 「受注」
    //  ・openStages のステージ → 検索用受注確度の値で「高・中・低」
    //  ・どちらにもないステージ（失注など）→ 集計しない（画面に件数を表示する）
    wonStages: ["受注", "制作進行", "請求", "完了"],
    openStages: ["タネ", "案件詳細入手", "着手承認済み", "見積提出済み"],
    confidence: "PossibilityForSearch__c", // 検索用受注確度（数式）
    // 検索用受注確度の値（受注・高・中・低）
    confidenceValues: {
      受注: ["受注"],
      高: ["高"],
      中: ["中"],
      低: ["低"],
    },
    // 検索条件に使う項目。使わないものは "" にすると検索条件から消える
    competition: "Competition_classification__c", // コンペ区分（相見積り・デザインコンペ・企画コンペ）
    tags: "", // タグ（未確認のため未使用）
    salesType: "", // 営業種別（未確認のため未使用）
  },

  // 目標（商談のうち、レコードタイプが「目標」のもの）
  // 月は「売上日」、部署は目標の「所有者」の部・課・チームで判定する
  // 「レコードタイプが目標」かつ「ステージが目標」の商談を目標として読む（ステージが目標の商談は実績の集計から除く）
  target: {
    recordTypeId: "0126F000000oIzFQAU",
    stageName: "目標",
    salesAmount: "SalesGoal__c", // 売り上げ目標
    profitAmount: "TargetProfit__c", // 目標利益額
    // 目標の売上日の項目（目標の月は「売上日」「完了予定日」のどちらでも判定でき、画面で切り替える）
    dateField: "EstimatedSaleDate__c",
    // 画面を開いたときの「目標の月の基準」："close"（完了予定日）| "sales"（売上日）
    monthBasis: "close",
  },

  // ユーザ（User）の所属の項目。分割の所有者（実績）・目標の所有者の所属として使う
  user: {
    department: "Department__c", // 部（テキスト）
    section: "Division__c", // 課（テキスト）
    team: "Team__c", // チーム（テキスト）
  },

  defaults: {
    fiscalYearStartMonth: 1, // 年度は1月始まり
  },
};
