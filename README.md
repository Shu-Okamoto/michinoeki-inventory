# 道の駅在庫管理システム - セットアップ手順

## アーキテクチャ

```
Gmail（未読メール）
    ↓ Gmail API（OAuth2）
Next.js API Routes on Vercel
    ↓ Claude API（Anthropic）でメール解析
Vercel KV（Redis）でデータ永続化
    ↓
ブラウザUI（在庫ダッシュボード）
```

---

## STEP 1: Google Cloud Console の設定

1. https://console.cloud.google.com にアクセス
2. 新しいプロジェクトを作成（例: michinoeki-inventory）
3. **「APIとサービス」→「ライブラリ」** から **Gmail API** を有効化
4. **「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuthクライアントID」**
   - アプリケーションの種類: **ウェブアプリケーション**
   - 承認済みのリダイレクトURI: `https://your-app.vercel.app/api/auth/callback/google`
   - ローカル開発用: `http://localhost:3000/api/auth/callback/google`
5. クライアントID・シークレットをメモ

---

## STEP 2: Vercel にデプロイ

```bash
# 1. Vercel CLIをインストール
npm i -g vercel

# 2. このフォルダに移動してデプロイ
cd michinoeki-inventory
vercel

# 3. デプロイ後、ダッシュボードで「Storage」→「KV Database」を作成して接続
```

---

## STEP 3: 環境変数の設定

Vercelダッシュボード → Settings → Environment Variables に以下を追加：

| 変数名 | 値 |
|--------|-----|
| `GOOGLE_CLIENT_ID` | GCPで取得したクライアントID |
| `GOOGLE_CLIENT_SECRET` | GCPで取得したシークレット |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `NEXTAUTH_SECRET` | ランダム文字列（`openssl rand -base64 32` で生成） |
| `ANTHROPIC_API_KEY` | Anthropicダッシュボードで取得 |
| `KV_*` | KV作成時に自動設定される |

---

## STEP 4: 使い方

1. アプリにアクセス → Googleアカウントでログイン
2. **「設定」** タブで道の駅と商品マスタを登録
3. **「出荷登録」** タブで出荷数を入力
4. **「Gmail連携」** タブで監視するGmailフォルダ（ラベル）を選択・設定
5. **「未読メールを今すぐ取得」** → Claudeが自動解析 → 確認して反映

---

## ローカル開発

```bash
npm install
cp .env.local.example .env.local
# .env.local に各種APIキーを入力
npm run dev
# http://localhost:3000 でアクセス
```

---

## ファイル構成

```
app/
├── page.tsx              # ログインページ
├── dashboard/page.tsx    # 在庫ダッシュボード
├── send/page.tsx         # 出荷登録
├── email/page.tsx        # Gmail連携（メイン機能）
├── history/page.tsx      # 販売履歴
├── settings/page.tsx     # 設定（道の駅・商品マスタ）
└── api/
    ├── auth/             # NextAuth（Google OAuth）
    ├── gmail/            # Gmail API連携・Claude解析
    └── inventory/        # データCRUD（Vercel KV）
```
