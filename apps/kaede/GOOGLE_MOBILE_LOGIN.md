# 通常GoogleログインのAndroid引き継ぎ

## 認証経路

Ayumiはブラウザを開く前に、アプリ用PKCE verifier・ランダムな試行ID・開始時API URL・10分の期限をprivate SharedPreferencesへまとめて保存する。
`GET /api/auth/oidc/google/login`へ以下を渡す。

| query                   | 値                                         |
| ----------------------- | ------------------------------------------ |
| `client`                | `mobile`                                   |
| `redirect_uri`          | `https://ayumi.okarin.app/auth/callback`   |
| `code_challenge`        | アプリverifierのSHA-256、base64url、43文字 |
| `code_challenge_method` | `S256`                                     |
| `mobile_state`          | 試行ごとに生成するランダム43文字           |

Kaedeはredirect URIを`MOBILE_OIDC_REDIRECT_URI`と完全一致で検証する。Google向けのstate・nonce・PKCEは従来どおり別に生成し、アプリ用情報と署名付きstate Cookieで結び付ける。Googleのcallback URIは引き続きKaedeである。

正常なcallbackで既存ユーザーのセッションを作り、60秒・単回使用の交換コードを発行する。App Linkには`mobile_session_exchange_code`と`mobile_state`だけを載せる。セッショントークン、Googleトークン、verifierは載せない。成功経路はMioを経由しない。

AndroidはApp Linkのscheme・host・path・port等、試行ID、期限、API環境を検証し、保存した開始時のAPIへ`POST /api/auth/mobile/session/exchange`で交換コードと`code_verifier`を送る。交換後の`Set-Cookie: okarin_session`は既存Cookieストアへ保存され、通常APIの`Cookie`に使われる。`GET /api/auth/me`を再取得して認証状態を更新する。

Webは従来どおりブラウザへCookieを設定して`FRONTEND_ORIGIN/`へ戻る。モバイルでは未登録ユーザーを自動作成しない。通常Googleログインでは組織認証grantを作らず、所属・権限・追加認証ルールを維持する。

組織OIDCは既存トランザクションのPKCEと交換APIを継続利用する。組織callbackには`mobile_state`がないため、試行IDの確認は行わず、保存したverifier・期限・API環境とサーバーのPKCE検証を利用する。

## 失敗・再試行・アプリ再作成

- 正しいstate付きのGoogleキャンセル、認証失敗、交換コード発行失敗は、通常Googleログインでは試行ID付きエラーApp Linkへ戻る。エラー文字列を画面にそのまま表示しない。
- state不一致、state Cookie消失・期限切れ、未許可URI、OIDC無効時はWeb失敗先へ戻る。ブラウザを閉じ、アプリで再試行する。
- ブラウザの「戻る」で中止してもログインを再実行できる。新しい開始操作で古い試行を置き換え、古い通常Google callbackは試行ID不一致で無視する。
- API環境の変更で保留中の試行を破棄する。交換中は環境変更と次の認証開始を抑止する。リンクからAPI URLは受け付けない。
- ブラウザ待機中のプロセス終了・Activity再作成では試行と設定済みAPI環境を復元し、期限切れは消去する。アプリ更新でAPI設定が変わった場合は再試行する。
- 交換の直前に保存したverifierを消去し、Intent再処理を防ぐ。交換中のプロセス終了・通信結果不明では自動再送せず、ログイン状態確認または認証開始から再試行する。コードは既に消費済みの可能性がある。
- PKCE情報とセッションCookieはクラウドバックアップ・端末移行から除外する。

## 設定・適用順

デプロイ・外部設定の変更は今回行っていない。

1. Kaedeの`db/migrations/20261118020000_google_mobile_session_exchange.sql`を先に適用する。通常Google交換は組織IDを持たないため、nullable列と直接PKCEチャレンジ列が必要。既存の組織用交換行は保持する。rollbackは通常Google交換行が残るとNOT NULL制約で失敗するため、原則roll-forwardとする。
2. 各環境の`OIDC_ENABLED=true`、`OIDC_GOOGLE_CLIENT_ID`、`OIDC_GOOGLE_CLIENT_SECRET`、`OIDC_GOOGLE_REDIRECT_URI`、`OIDC_STATE_COOKIE_SECRET`、`FRONTEND_ORIGIN`を確認する。state Cookie secretは開始とcallbackを扱う全インスタンスで一致させる。
3. `MOBILE_OIDC_REDIRECT_URI=https://ayumi.okarin.app/auth/callback`（既定値も同じ）を確認する。Android定数・Manifestとの一致が必要。
4. Google Cloudの既存Web OAuthクライアントで、各環境のKaede callback URIが承認済みredirect URIに完全一致することを確認する。App LinkをGoogleのcallbackに登録する方式ではない。OAuth同意画面・テストユーザーの利用範囲も確認する。
5. `https://ayumi.okarin.app/.well-known/assetlinks.json`をHTTPSで配信する。`delegate_permission/common.handle_all_urls`、`package_name: com.example.okarin_mobile_app`、インストールするAPKの署名証明書SHA-256が必要。debug・release・Play App Signingの証明書は異なるため、対象ビルドを確認する。Manifestは`autoVerify=true`で`/auth/callback`を許可している。
6. Ayumiの`.env`の`KAEDE_API_BASE_URL_TEST`（省略時は`KAEDE_API_BASE_URL`）、`KAEDE_API_BASE_URL_STAGING`、`KAEDE_API_BASE_URL_PRODUCTION`が対応するKaedeを指すことを確認してAPKを再ビルドする。端末からHTTPSで到達できる必要がある。
7. プロキシ・アクセス解析・エラー監視で、認証URLのquery、Location、Cookie/Set-Cookie、交換APIのbodyを記録しない設定を確認する。コード・トークン・verifierをスクリーンショットやログ共有に含めない。

古いAndroid版は`client=mobile`だけを送るため、新しいKaedeでは不完全なモバイル開始として拒否される。KaedeとAyumiの更新を合わせる。

## Android実機での確認

1. 検証環境で既存のactiveユーザーを用意し、新APKをインストールして対象API環境を選ぶ。
2. 設定画面のGoogleログインを押し、ブラウザで認証する。Mioでの操作なしでAyumiへ戻り、ログイン済みユーザーが表示されることを確認する。
3. 所属一覧・プロフィール等の認証済みAPIを使用する。組織に必要な追加認証は引き続き要求されること、終了・起動後にもセッションが利用できることを確認する。
4. Google側キャンセル、ブラウザの「戻る」、通信切断、10分の待機、連続再試行、認証中の環境変更を試す。新しい試行で再ログインできることを確認する。
5. ブラウザ待機中に`adb shell am kill com.example.okarin_mobile_app`でバックグラウンドのプロセスを終了し、認証後にcold startで復帰できることを確認する。`force-stop`はOSのリンク起動制限も変えるため通常の再作成の代用にしない。
6. 同一リンク再処理、不正verifier、60秒経過・使用済みコードの拒否を検証用ハーネスで確認する。機密値をログやシェル履歴に残さない。
7. 未登録Googleアカウントではユーザーが作成されないこと、組織OIDCのlogin/reauthenticateでも復帰・交換できること、Web版Googleログインも従来どおりCookieでMioに戻ることを確認する。

App Links診断例（機密値不要）:

```sh
adb shell pm verify-app-links --re-verify com.example.okarin_mobile_app
adb shell pm get-app-links com.example.okarin_mobile_app
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'https://ayumi.okarin.app/auth/callback'
```

最後のコマンドはルーティング確認だけで、交換コードがないためログインは成立しない。ドメイン検証状態とAndroidの「対応リンクを開く」設定を確認する。

## 自動検証と未確認事項

KaedeのルートテストとDBテストは、App Link返却、交換後Cookieによる`/me`、不正verifier、期限切れ、再使用、並行消費、失効セッション、Web遷移、キャンセル、未許可URI、既存組織OIDC、アカウント作成方針、migrationでの既存行保持を確認する。交換テーブルの型は一時PostgreSQLでcodegenして照合した。

AndroidのJVMテストは開始URL、試行ID・環境・期限の判定、既存組織callbackとの互換性、通常APIと共有するCookieパーサーを確認する。実ブラウザ・OSのApp Links検証・プロセス終了・Google認証をJVMテストで代替したとは扱わない。

実環境への適用、Google設定、assetlinks.json、署名、実機でのログイン成立は未確認。

## 検証コマンドと今回の結果（2026-11-18）

Kaede（`apps/kaede`）:

```sh
mise exec -- pnpm test
mise exec -- pnpm exec vitest run --config vitest.db.config.ts
mise exec -- pnpm exec vitest run --config vitest.db.config.ts tests/services/auth/organization-oidc-auth.test.ts tests/services/auth/auth-usecase.test.ts tests/services/auth/google-mobile-session-exchange.test.ts
mise exec -- pnpm lint
mise exec -- pnpm exec prettier --check .
mise exec -- pnpm exec tsc --noEmit
```

認証変更だけを最新mainから切り出したPR用作業ツリーで、Kaede全体のunitテスト786件、DB全体276件が成功。型チェック・全体ESLint・全体整形確認も成功。認証関連には通常Google交換、組織OIDC、アカウント作成方針、migrationの検証を含む。

Ayumi:

```sh
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew testDebugUnitTest lintDebug assembleDebug --offline
```

JVMテスト33件（新規4件を含む）、Lint、debug APKビルドが成功。機器を接続した実行、Google CloudやApp Links設定の検証は行っていない。
