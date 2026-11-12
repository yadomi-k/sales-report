# Salesforceにつなぐための設定

売上レポートはSalesforceのデータを**読み取るだけ**です。オブジェクト・項目・Apexの追加や変更はありません。
必要なのは、ログインの許可（接続アプリケーション・CORS）と、`src/config.js` への項目名の入力だけです。

## 1. 売上レポート専用の接続アプリケーションを作る

売上レポートはCaseShelfとは別のアプリとして運用するため、ログイン用の接続アプリケーションも専用のものを作ります
（CaseShelfの設定には触れません）。

1. **設定 → アプリケーションマネージャ →「新規接続アプリケーション」**（画面によっては「外部クライアントアプリケーション」）
   - 名前：`売上レポート`
   - 「OAuth設定の有効化」をオン
   - コールバックURL：売上レポートを開くURL（例：`http://localhost:8790/`、本番のURL）。末尾の `/` まで完全に一致させる
   - 選択したOAuth範囲：「一意のユーザー識別子へのアクセス（openid）」「ID URLサービスへのアクセス（id, profile, email, address, phone）」
     「API を使用してユーザーデータを管理（api）」
   - 「サポートされる認証フローにProof Key for Code Exchange (PKCE) 拡張を要求」をオン
   - 「Webサーバーフローの秘密が必要」はオフ
2. 作成後に表示される **コンシューマ鍵** を `src/config.js` の `salesforce.clientId` に入れる
3. **設定 → CORS** の許可リストに、売上レポートのURLのオリジン（例：`http://localhost:8790`）を追加し、
   「OAuthエンドポイントのCORSを有効化」がオンになっていることを確認する（CaseShelfで設定済みならオンのまま）

反映まで数分かかることがあります。

## 2. 項目のAPI参照名を `src/config.js` に入れる

**設定 → オブジェクトマネージャ →（商談 / ユーザ）→ 項目とリレーション** で確認します。

| 設定 | 値 | 内容 |
|---|---|---|
| `split.amount` | `SplitAmount` | 商談分割の金額 |
| `split.profit` | `SplitProfit__c` | 商談分割の利益額 |
| `split.onlyActiveSplitType` | `true` | 有効な分割タイプ（「売上金額」）の分割だけを集計する |
| `split.splitTypeDeveloperName` | `""` | 特定の分割タイプに絞る場合だけ指定（通常は不要） |
| `opportunity.salesDate` | `EstimatedSaleDate__c` | 売上日 |
| `opportunity.actualRecordTypeIds` | `0126F000000oIzAQAU` | 実績のレコードタイプ |
| `opportunity.wonStages` | 受注・制作進行・請求・完了 | 「受注」として扱うステージ |
| `opportunity.openStages` | タネ・案件詳細入手・着手承認済み・見積提出済み | 検索用受注確度で高・中・低に分けるステージ |
| `opportunity.confidence` / `confidenceValues` | `PossibilityForSearch__c` | 検索用受注確度（値：受注・高・中・低） |
| `opportunity.competition` | `Competition_classification__c` | コンペ区分 |
| `target.recordTypeId` / `stageName` | `0126F000001MJJNQA4` / `目標` | レコードタイプ【個人目標】かつステージ「目標」の商談を目標として読む（ステージが目標の商談は実績から除く） |
| `target.salesAmount` / `profitAmount` | `SalesGoal__c` / `TargetProfit__c` | 売り上げ目標・目標利益額 |
| `user.department` / `section` / `team` | `Department__c` / `Division__c` / `Team__c` | 部・課・チーム |
| `user.salesDepartments` | `["営業"]` | 検索条件の部・課・チーム・担当者の選択肢に出す部（部の名前にこの文字を含む人だけ） |

### 分割タイプについて
Salesforceの商談分割には「分割タイプ」（設定 → 商談分割 で確認）があり、1つの商談に分割タイプごとの分割レコードが作られます。
分割タイプが複数ある場合、同じ商談が二重に集計されないよう、**有効な分割タイプ（「売上金額」）の分割だけ**を集計します（`onlyActiveSplitType: true`）。

項目名が間違っている場合、画面に「Salesforceの項目の設定が正しくありません（…）」と表示され、どの項目かがわかります。

## 3. 見る人の権限

データはログインした人のSalesforceの権限で読み取ります。次を参照できる必要があります。

- 商談（目標のレコードタイプを含む）、商談分割、ユーザ、取引先（取引先名の表示）
- 上の各項目の参照権限（項目レベルセキュリティ）
- 商談の共有設定で**参照できない商談は集計から抜けます**。全員が同じ数字を見るには、全商談を参照できる設定が必要です
