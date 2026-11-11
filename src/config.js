// 売上レポートの設定（試作品）
//
// Salesforceの項目の「API参照名」はここにまとめています。
// 設定 → オブジェクトマネージャ → （商談 / ユーザ）→ 項目とリレーション で確認し、書き換えてください。
// ※ 「仮」と書いてある値は、まだ確認していない仮の値です。
window.AppConfig = {
  salesforce: {
    // 会社のSalesforceの「私のドメイン」のURL（CaseShelfと同じ）
    myDomainUrl: "https://shoei.my.salesforce.com",
    // 接続アプリケーションの「コンシューマ鍵」（CaseShelfと同じ接続アプリケーションを使う場合は同じ値）
    clientId: "3MVG9YDQS5WtC11pWkeuHxMae_.5kSdZ6uN6lnE7Sd.prc3wWdF.mIDSsrzVOCz._nlBnGuYhFXM2fFmr4Arw",
  },

  // 商談（Opportunity）の項目
  opportunity: {
    salesDate: "SalesDate__c", // 売上日（日付型）※仮
    salesAmount: "SalesAmount__c", // 売上金額 ※仮
    finalProfit: "FinalProfit__c", // 最終利益額 ※仮
    // 受注確度の項目と、その値が「受注・高・中・低」のどれにあたるか ※仮
    confidence: "Confidence__c",
    confidenceValues: {
      受注: ["受注"],
      高: ["高", "A"],
      中: ["中", "B"],
      低: ["低", "C"],
    },
    // このステージの商談は、受注確度の項目にかかわらず「受注」として扱う（不要なら []）
    wonStages: ["受注"],
    // 以下は検索条件に使う項目。使わないものは "" にすると検索条件から消える ※仮
    competition: "CompetitionType__c", // コンペ区分（選択リスト）
    tags: "Tags__c", // タグ（複数選択リスト）
    salesType: "SalesType__c", // 営業種別（選択リスト）
  },

  // 目標（商談のうち、レコードタイプが「目標」のもの）
  target: {
    recordTypeName: "目標", // レコードタイプの名前（表示ラベル）
    salesAmount: "TargetSalesAmount__c", // 目標売上金額 ※仮
    profitAmount: "TargetProfitAmount__c", // 目標利益金額 ※仮
    // 目標の月は「売上日」で判定し、部署は「所有者」の部・課・チームで判定する
  },

  // 商談分割（OpportunitySplit）
  split: {
    // 使う分割タイプの「API参照名（DeveloperName）」。分割タイプが1つだけなら "" のままでよい。
    // 複数ある場合（例: 売上用と利益用）は、％の基準にする1つを指定する（同じ商談が二重に集計されないように）
    splitTypeDeveloperName: "",
  },

  // ユーザ（User）の所属の項目
  user: {
    department: "Department__c", // 部（CaseShelfでも使っている項目）
    section: "Section__c", // 課 ※仮
    team: "Team__c", // チーム ※仮
  },

  // 画面の初期値
  defaults: {
    // 期間の初期値：今年の1月〜12月
    fiscalYearStartMonth: 1,
  },
};
