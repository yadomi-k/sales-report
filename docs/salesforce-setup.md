# Salesforceにつなぐための設定

売上レポートはSalesforceのデータを**読み取るだけ**です。オブジェクト・項目・Apexの追加や変更はありません。
必要なのは、ログインの許可（接続アプリケーション・CORS）と、`src/config.js` への項目名の入力だけです。

## 1. 接続アプリケーション（CaseShelfのものを使う場合）

CaseShelfの接続アプリケーションをそのまま使えます（OAuth範囲に `api` `openid` が入っているため）。

1. **設定 → アプリケーションマネージャ** → CaseShelfの接続アプリケーション →「編集」
2. **コールバックURL** に、売上レポートを開くURLを1行追加する（例：`http://localhost:8790/`、本番のURL）。
   末尾の `/` まで完全に一致させてください
3. **設定 → CORS** の許可リストに、売上レポートのURLのオリジン（例：`http://localhost:8790`）を追加する

> 売上レポート専用の接続アプリケーションを作る場合は、CaseShelfの README「Salesforceでログイン」と同じ手順で作り、
> コンシューマ鍵を `src/config.js` の `clientId` に入れてください。

反映まで数分かかることがあります。

## 2. 項目のAPI参照名を `src/config.js` に入れる

**設定 → オブジェクトマネージャ →（商談 / ユーザ）→ 項目とリレーション** で確認します。

| 設定 | 値 | 内容 |
|---|---|---|
| `split.amount` | `SplitAmount` | 商談分割の金額 |
| `split.profit` | `SplitProfit__c` | 商談分割の利益額 |
| `split.splitTypeDeveloperName` | `""` | 分割タイプが複数ある組織で、1つだけを集計したいときに指定（下記） |
| `opportunity.salesDate` | `EstimatedSaleDate__c` | 売上日 |
| `opportunity.actualRecordTypeIds` | `0126F000000oIzAQAU` | 実績のレコードタイプ |
| `opportunity.wonStages` | 受注・制作進行・請求・完了 | 「受注」として扱うステージ |
| `opportunity.openStages` | タネ・案件詳細入手・着手承認済み・見積提出済み | 検索用受注確度で高・中・低に分けるステージ |
| `opportunity.confidence` / `confidenceValues` | `PossibilityForSearch__c` | 検索用受注確度と、その値が高・中・低のどれにあたるか（**値は要確認**） |
| `opportunity.competition` | `Competition_classification__c` | コンペ区分 |
| `target.recordTypeId` | `0126F000000oIzFQAU` | 目標のレコードタイプ |
| `target.salesAmount` / `profitAmount` | `SalesGoal__c` / `TargetProfit__c` | 売り上げ目標・目標利益額 |
| `user.department` / `section` / `team` | `Department__c` / `Division__c` / `Team__c` | 部・課・チーム |

### 分割タイプについて
Salesforceの商談分割には「分割タイプ」（設定 → 商談分割 で確認）があり、1つの商談に分割タイプごとの分割レコードが作られます。
分割タイプが1つだけなら設定は不要です。複数ある場合は同じ商談が二重に集計されるため、集計に使う分割タイプのAPI参照名を指定してください。

項目名が間違っている場合、画面に「Salesforceの項目の設定が正しくありません（…）」と表示され、どの項目かがわかります。

## 3. 見る人の権限

データはログインした人のSalesforceの権限で読み取ります。次を参照できる必要があります。

- 商談（目標のレコードタイプを含む）、商談分割、ユーザ、取引先（取引先名の表示）
- 上の各項目の参照権限（項目レベルセキュリティ）
- 商談の共有設定で**参照できない商談は集計から抜けます**。全員が同じ数字を見るには、全商談を参照できる設定が必要です
