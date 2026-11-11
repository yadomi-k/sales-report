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

| 設定 | 内容 | 確認する場所 |
|---|---|---|
| `opportunity.salesDate` | 売上日（日付型） | 商談 |
| `opportunity.salesAmount` | 売上金額 | 商談 |
| `opportunity.finalProfit` | 最終利益額 | 商談 |
| `opportunity.confidence` / `confidenceValues` | 受注確度の項目と、その選択肢の値が「受注・高・中・低」のどれにあたるか | 商談 |
| `opportunity.wonStages` | このステージなら受注確度にかかわらず「受注」とする（不要なら `[]`） | 商談のステージ |
| `opportunity.competition` / `tags` / `salesType` | コンペ区分・タグ・営業種別（使わないものは `""`） | 商談 |
| `target.recordTypeName` | 目標のレコードタイプ名（`目標`） | 商談 → レコードタイプ |
| `target.salesAmount` / `profitAmount` | 目標売上金額・目標利益金額 | 商談 |
| `split.splitTypeDeveloperName` | 商談分割タイプが複数ある場合、基準にする1つ | 設定 → 商談分割 |
| `user.department` / `section` / `team` | 部・課・チーム | ユーザ |

項目名が間違っている場合、画面に「Salesforceの項目の設定が正しくありません（…）」と表示され、どの項目かがわかります。

## 3. 見る人の権限

データはログインした人のSalesforceの権限で読み取ります。次を参照できる必要があります。

- 商談（目標のレコードタイプを含む）、商談分割、ユーザ、取引先（取引先名の表示）
- 上の各項目の参照権限（項目レベルセキュリティ）
- 商談の共有設定で**参照できない商談は集計から抜けます**。全員が同じ数字を見るには、全商談を参照できる設定が必要です
