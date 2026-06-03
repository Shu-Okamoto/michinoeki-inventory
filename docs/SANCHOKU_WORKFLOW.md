# 産直・卸売 取引ワークフロー 設計書（いわくにアグリパートナーズ）

既存の「道の駅 在庫管理ツール」（生産者の納品＝出荷、販売者のレジ通過＝販売、ダッシュボード、
売上メール）はそのまま提供しつつ、**組合内のBtoB産直/卸売システム**を追加レイヤーとして載せる。

---

## 1. 登場人物（ロール）
- **生産者**: 商品を作り、出荷する。出荷数を入力。
- **組合（組合管理者）**: 仲介・仕切り役。納品数を確認・調整・確定。月末に手数料計算と請求書発行。
- **販売者**: 道の駅・販売会社など買い手。販売数を入力し、確認OKで取引成立。

## 2. 取引（transaction）のライフサイクル

```
[生産者] 出荷数を入力            → status: 出荷済 (shipped)
        ↓
[組合]  チェック / 調整          → status: 組合確認済 (confirmed)   ※納品数を確定
        ↓ 販売者へ連携
[販売者] 販売数を入力            → status: 販売入力済 (sales_entered)
        ↓ 確認OK
[販売者] 成立承認               → status: 成立 (completed)  ← 精算対象
        ↓ 月末締め
[組合]  月次処理               → 手数料計算・請求書2種を発行 → status: 精算済 (settled)

※ いつでも [組合/販売者] が 取消 (canceled) に遷移可能（成立前）
```

### 取引が持つ3段階の数量
| 数量 | 入力者 | 意味 |
|---|---|---|
| 出荷数 ship_qty | 生産者 | 出荷したと申告した数 |
| 納品数 delivery_qty | 組合 | 組合が確認・調整して確定した数 |
| 販売数 sales_qty | 販売者 | 実際に売れた数（確認OKの対象） |

## 3. お金のルール（手数料方式・生産者ファースト）

```
取引タイプ 産直（委託） → 請求数量 = sales_qty（実売）
取引タイプ 卸売        → 請求数量 = delivery_qty（組合確定納品数）

販売金額   amount      = 請求数量 × 単価(unit_price)
手数料     commission  = amount × commission_rate%（既定 8%）

生産者請求額（組合→生産者支払） = amount            （満額）
販売者請求額（組合→販売者請求） = amount + commission （上乗せ）
組合の取り分                    = commission
```

- 単価は商品マスタの単価を初期値とし、取引ごとに組合が調整可能。
- commission_rate は設定(settings.commissionRate)を既定値とし、取引ごとに上書き可能。

## 3.5 実運用ルール（販売累積・完売・引き取り・部分決算・繰越）

産直（委託販売）の実態に合わせた運用ルール。**産直のみ**対象、卸売は納品時に確定。

- **販売の累積入力**: 販売店がレジ通過を数日かけて累積入力（sales_qty を更新）。
- **完売 → 自動成立**: `sales_qty + retrieved_qty ≧ delivery_qty` で自動的に `completed`。
- **棚残の処理チャネル（販売者が選択）**:
  - **割引販売**: 定価〜半額（`DISCOUNT_FLOOR=50%`）の単価で販売。`discount_qty` × `discount_unit_price`。
  - **惣菜利用**: 販売者が単価の3割（`SOUZAI_RATE=30%`）で買取。`souzai_qty`。
  - **引取依頼**: 生産者が引き取り（無償・請求対象外）。`retrieved_qty`（数量は販売者が確定）。
- いずれも `sales_qty + discount_qty + souzai_qty + retrieved_qty ≧ delivery_qty` に達したら完了(`completed`)。
- **棚残**: `delivery_qty − sales_qty − discount_qty − souzai_qty − retrieved_qty`（販売可能な残り）。
- **請求金額（産直）**: 実売(定価) ＋ 割引販売(割引単価) ＋ 惣菜(3割) の合算。引取は無償。
  すべて同じ手数料方式（生産者＝満額／販売者＝満額＋手数料）。
- **月末の部分決算**: 月末締めでは、確認済み以降・未精算の取引を一括決算する。
  - 産直: **実売数(sales_qty)で部分決算**。請求は実際に売れた分のみ。
  - 卸売: **納品数(delivery_qty)で全額決算**。
- **翌月繰越（産直のみ）**: 月末に棚残>0 の産直は、棚残を納品数とする**新規取引を翌月1日付・「販売待ち」で自動起票**して販売を継続（`carry_from_id` で元取引にリンク）。

## 4. 月末締め・請求書
確認済み以降・未精算の取引を、対象期間(YYYY-MM)で集計して発行する（産直=実売分で部分決算、卸売=納品数で全額）。

- **生産者請求書（組合宛て）**: 生産者ごとに、期間内取引の amount 合計。組合が生産者に支払う。
- **販売者請求書（販売者宛て）**: 販売者ごとに、期間内取引の amount＋commission 合計。販売者が組合に支払う。
- **手数料レポート**: 期間内 commission 合計（組合の収益）。
- 発行済み取引は status=精算済 にし、二重精算を防ぐ。

## 5. データモデル（すべて iwkagri_ プレフィックス）

### iwkagri_transactions（取引）
| カラム | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| org | TEXT | 組織（将来マルチ組合用） |
| type | TEXT | '産直' / '卸売' |
| status | TEXT | shipped/confirmed/sales_entered/completed/settled/canceled |
| date | TEXT | 取引日（出荷日） |
| producer | TEXT | 生産者名 |
| seller | TEXT | 販売者名（買い手） |
| location | TEXT | 道の駅・販売先（任意） |
| product | TEXT | 商品名 |
| ship_qty | INTEGER | 出荷数（生産者） |
| delivery_qty | INTEGER | 納品数（組合確定） |
| sales_qty | INTEGER | 販売数（販売者） |
| unit_price | INTEGER | 単価（円, snapshot） |
| commission_rate | NUMERIC | 手数料率（%） |
| invoice_id | TEXT | 精算時に紐づく請求バッチID |
| created_at / updated_at | TIMESTAMP | |

請求数量・金額・手数料は上記から算出（保存しない or 精算時にスナップショット）。

### iwkagri_invoices（請求書バッチ）
| カラム | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| org | TEXT | |
| period | TEXT | 'YYYY-MM' |
| kind | TEXT | 'producer'（生産者請求） / 'seller'（販売者請求） |
| party | TEXT | 対象の生産者名 or 販売者名 |
| subtotal | INTEGER | 販売金額合計 |
| commission | INTEGER | 手数料合計（seller のみ） |
| total | INTEGER | 請求合計 |
| status | TEXT | issued/paid 等 |
| created_at | TIMESTAMP | |

明細は iwkagri_transactions.invoice_id で逆引き（請求書1件＝複数取引）。

## 6. 画面（追加）
- **取引一覧 /deals**: 状態別フィルタ、各取引のカードで現在の数量・金額・手数料を表示。
- **組合 確認/調整**: confirmed へ遷移。納品数・単価・手数料率を調整。
- **販売者 確認**: 販売数入力 → 成立承認。
- **精算 /settlement**: 期間を選び、請求書2種＋手数料レポートをプレビュー → 確定（invoice発行）→ 出力（印刷/CSV）。

## 7. 既存機能との関係
- 既存の納品(shipment)・レジ通過(sales)入力はそのまま残す（道の駅在庫ツールとして）。
- 産直/卸売ワークフローは取引(transaction)単位で別管理。将来的に「出荷入力＝取引の起点」として統合可能。
- 単価/手数料率(Phase 0)はこのワークフローの金額計算にそのまま流用。

## 8. 実装インクリメント
- **Inc.1**: データ層（iwkagri_transactions / iwkagri_invoices）＋取引API（作成・状態遷移・金額算出）。
- **Inc.2**: 画面（取引一覧、組合確認/調整、販売者確認）＋ロール権限。
- **Inc.3**: 月末締め・請求書発行・手数料レポート・出力（CSV/印刷）。
