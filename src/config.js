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

  // 目標：レコードタイプ【個人目標】かつステージ「目標」の商談（ステージが目標の商談は実績の集計から除く）
  // 月は実績と同じ「売上日」、部署は目標の「所有者」の部・課・チームで判定する
  target: {
    recordTypeId: "0126F000001MJJNQA4", // レコードタイプ【個人目標】
    stageName: "目標",
    salesAmount: "SalesGoal__c", // 売り上げ目標
    profitAmount: "TargetProfit__c", // 目標利益額
    // 目標の月を判定する日付の項目（実績と同じ売上日）
    dateField: "EstimatedSaleDate__c",
  },

  // ユーザ（User）の所属の項目。分割の所有者（実績）・目標の所有者の所属として使う
  user: {
    department: "Department__c", // 部（テキスト）
    section: "Division__c", // 課（テキスト）
    team: "Team__c", // チーム（テキスト）
    // 集計の対象にする部署（「部」と、その中の対象の「課」）。全部門の合計・部ごとの表・選択肢のすべてに使う。
    // 実績は分割の所有者、目標は目標の所有者の所属で判定する。
    // 全角・半角の違い（第１／第1）は区別しない。[] にすると全員を対象にする
    targetOrgs: [
      { dept: "営業部", sections: ["第１営業部", "第２営業部", "第３営業部", "イベント推進室", "営業開発室", "営業推進部", "大阪事業部"] },
      { dept: "クリエイティブ部", sections: ["プランニング課"] },
    ],
  },

  defaults: {
    fiscalYearStartMonth: 1, // 年度は1月始まり
  },
};
