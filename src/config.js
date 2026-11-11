// 売上レポートの設定（試作品）
//
// Salesforceの項目の「API参照名」はここにまとめています。
// 設定 → オブジェクトマネージャ → （商談 / 商談分割 / ユーザ）→ 項目とリレーション で確認できます。
// ※「仮」と書いてある値は、まだ確認していない値です。
window.AppConfig = {
  salesforce: {
    // 会社のSalesforceの「私のドメイン」のURL（CaseShelfと同じ）
    myDomainUrl: "https://shoei.my.salesforce.com",
    // 接続アプリケーションの「コンシューマ鍵」（CaseShelfと同じ接続アプリケーションを使う）
    clientId: "3MVG9YDQS5WtC11pWkeuHxMae_.5kSdZ6uN6lnE7Sd.prc3wWdF.mIDSsrzVOCz._nlBnGuYhFXM2fFmr4Arw",
  },

  // 商談分割（OpportunitySplit）：個人の実績は、分割の金額・利益額をそのまま積み上げる
  split: {
    amount: "SplitAmount", // 金額（標準項目）
    profit: "SplitProfit__c", // 利益額
    // 分割タイプが複数ある組織で、1つだけを集計したいときにその「API参照名」を入れる。1つしかなければ "" のまま
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
    // 検索用受注確度の値が「高・中・低」のどれにあたるか ※仮（実際の値を確認して書き換える）
    confidenceValues: {
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
  target: {
    recordTypeId: "0126F000000oIzFQAU",
    salesAmount: "SalesGoal__c", // 売り上げ目標
    profitAmount: "TargetProfit__c", // 目標利益額
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
