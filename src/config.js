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
    //  ・otherStages のステージ（失注など）→ 明細にだけ出す（表・グラフには入れない）
    //  ・どれにもないステージ → 読み込まない（画面に件数を表示する）
    wonStages: ["受注", "制作進行", "請求", "完了"],
    openStages: ["タネ", "案件詳細入手", "着手承認済み", "見積提出済み"],
    // 表・グラフには入れず、明細にだけ出すステージ（今月の失注などを確認するため）
    otherStages: ["失注", "辞退", "消滅", "企画開発費", "企画開発費請求"],
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
    // 商談の「売上金額」（変更履歴で使う）
    salesAmount: "OrderEstimate__c",
  },

  // 変更履歴（週次）：商談の項目履歴（OpportunityFieldHistory）から「売上金額」「案件ステージ」の変更を読む
  // Salesforceで、商談の この2項目の「項目履歴管理」をオンにしておく必要がある（docs/history-setup.md）
  history: {
    days: 7, // 初期表示の期間（今日から何日前まで）
    // 上部の集計の区分（ステージ）
    groups: [
      { key: "info", label: "情報", stages: ["タネ", "案件詳細入手", "着手承認済み", "見積提出済み"] },
      { key: "won", label: "受注", stages: ["受注", "制作進行", "請求", "完了"] },
      // invert：失注が増える＝売上が減るので、増えた金額を▲（赤）で表示する
      { key: "lost", label: "失注", stages: ["失注", "辞退", "消滅", "企画開発費"], invert: true },
    ],
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
    title: "Title", // 役職（ユーザの標準項目）。名前の下に表示し、並び順に使う
    // 役職の並び順（上から順に表示）。ここにない役職は後ろ。同じ役職はアカウントの作成日が古い順 ※実際の役職名は要確認
    titleOrder: ["本部長", "副本部長", "部長", "副部長", "次長", "室長", "課長", "課長代理", "係長", "主任", "チーフ", "リーダー"],
    // 本部（ユーザに本部の項目がないため、部から決める）※部の所属は要確認
    headquarters: [
      { name: "第１営業本部", depts: ["第１営業部", "第２営業部", "イベント推進室"] },
      { name: "第２営業本部", depts: ["第３営業部", "営業推進部", "営業開発室"] },
      { name: "クリエイティブ本部", depts: ["クリエイティブ部"] },
      { name: "大阪事業本部", depts: ["大阪事業部"] },
    ],
    // 集計の対象にする部（並び順もこの順）。sections を書いた部は、その課の人だけを対象にする。
    // 全部門の合計・本部／部ごとの表・検索条件の選択肢のすべてに使う。
    // 実績は分割の所有者、目標は目標の所有者の所属で判定する。全角・半角の違い（第１／第1）は区別しない
    targetDepts: [
      { dept: "第１営業部" },
      { dept: "第２営業部" },
      { dept: "イベント推進室" },
      { dept: "第３営業部" },
      { dept: "営業推進部" },
      { dept: "営業開発室" },
      { dept: "クリエイティブ部", sections: ["プランニング課"] },
      { dept: "大阪事業部", sections: ["営業課"] }, // 製作課は対象外
    ],
  },

  // Creativeタブ：プロジェクト管理（Creative_Achievements__c）のクリエイティブ部の売上
  // ※項目のAPI参照名は仮。確認して書き換える
  creative: {
    object: "Creative_Achievements__c",
    // レコードタイプ（商談の目標と同じ構成）
    targetRecordTypeId: "012Q90000013x6DIAQ", // 目標
    actualRecordTypeId: "012Q90000013wlFIAQ", // プロジェクト登録
    dateField: "Recording_date__c", // 計上日（月の振り分けに使う）
    amountField: "Amount__c", // 金額（プロジェクト登録のレコード）
    targetField: "Target_Amount__c", // 目標金額（目標のレコード）
    // コンペ結果の項目（受注・失注・消滅など）。プロジェクト管理にない場合は "" のまま（コンペ結果の欄を出さない）
    resultField: "",
    // 当時の部署（レコードに入っていればこちらを優先。空欄なら所有者のユーザの今の部・課・チーム）
    atTheTime: {
      department: "Department_at_that_time__c", // 当時の部
      section: "Department_at_the_time_2__c", // 当時の課
      team: "Team_at_the_time__c", // 当時のチーム
    },
    // 成績予測を分ける単位（課の名前で判定）※課の正式な名前は要確認
    // 商談分割の所属は、分割の所有者のユーザの今の部・課・チームで判定する
    // opportunity: true の課は、実績に「商談分割の金額」も足し、目標は「商談の【個人目標】」を使う
    // （プロジェクト管理の目標は使わない）。商談分割・個人目標の項目はSalesタブと同じ設定を使う
    sections: [
      { key: "SD", label: "SD", userSection: "スペースデザイン課" },
      { key: "GD", label: "GD", userSection: "グラフィックデザイン課" },
      { key: "PL", label: "プランニング", userSection: "プランニング課", opportunity: true },
    ],
    // 商談分割から実績に足すのは、この受注確度のものだけ（受注のみ。見込みも含めるなら "高" などを足す）
    opportunityLevels: ["受注"],
    // 期の番号（2026年 = 48期）
    periodOffset: 1978,
  },

  // 過去との比較：毎日取る「写し（スナップショット）」を保存するオブジェクト
  // 作り方は docs/snapshot-setup.md。オブジェクト・項目は下のAPI参照名で作る
  snapshot: {
    object: "VISORA_Snapshot__c",
    date: "SnapshotDate__c", // 取得日（日付）
    oppId: "OpportunityId__c", // 商談ID
    oppName: "OpportunityName__c", // 商談名
    account: "AccountName__c", // 取引先名
    oppOwner: "OpportunityOwnerId__c", // 商談所有者のユーザID
    splitOwner: "SplitOwnerId__c", // 分割所有者のユーザID
    stage: "StageName__c", // 案件ステージ
    possibility: "Possibility__c", // 検索用受注確度（受注・高・中・低）
    salesDate: "SalesDate__c", // 売上日
    splitAmount: "SplitAmount__c", // 分割の金額
    splitProfit: "SplitProfit__c", // 分割の利益額
    splitPct: "SplitPercentage__c", // 分割の％
    competition: "Competition__c", // コンペ区分
  },

  defaults: {
    fiscalYearStartMonth: 1, // 年度は1月始まり
  },
};
