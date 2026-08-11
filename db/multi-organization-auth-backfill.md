# Multi-Organization Auth One-shot Cutover Runbook

この手順は、multi-organization authの旧データを1回のメンテナンス時間内で新形式へ全件移行するためのものです。
新旧Applicationや新旧認証データを並行運用しません。Applicationを停止してからSchema追加、全件移行、検証、
Membership主キー昇格、旧契約削除までを完了し、新Applicationだけを起動します。

## 原則

- 本番相当snapshotで同じ手順を事前にrehearsalする。
- 開始前に書込みとbackground workerをすべて停止する。
- `preflight`のblocking issueを事前に解消し、値を推測して自動修正しない。
- 移行中に旧Applicationを再起動しない。
- 既存SessionからMembership Grantを推測せず、全Sessionをrevokeする。
- 失敗時は新旧混在状態でサービスを再開せず、切替前backupへDatabase全体をrestoreする。
- 成功後は新構造だけをsource of truthとし、旧Columnへのread/writeやdual-writeを行わない。

## 事前準備

1. 本番snapshotで所要時間、WAL量、必要disk容量、restore時間を計測する。
2. `pnpm multi-org-auth-backfill preflight`を実行する。
3. 次のblocking issueをすべて解消する。
   - `LOCAL_LOGIN_EMAIL_COLLISION`
   - `MISSING_ORGANIZATION_AUTH_POLICY`
   - `OIDC_PROVIDER_MAPPING_MISSING_OR_AMBIGUOUS`
   - `OIDC_IDENTITY_OWNER_CONFLICT`
   - `PEDESTRIAN_MEMBERSHIP_NOT_FOUND`
   - `PEDESTRIAN_MEASUREMENT_OUT_OF_RANGE`
   - `INVITE_CREATOR_MEMBERSHIP_NOT_FOUND`
   - `LEGACY_MULTI_USE_INVITE`
   - `PENDING_ACTIVATION_USER`
4. Organizationごとの認証PolicyとOIDC Providerを明示的に決定する。email domainやglobal設定から推測しない。
5. Database backupを取得し、restoreできることを確認する。

`pedestrians.height`と`stride_length`はmeterとして扱います。`0 < value <= 3`以外はblocking issueとし、
centimeterと推測して変換しません。

## Cutover手順

Kaede directoryで実行します。

```sh
# 1. maintenance modeへ切り替え、Kaede/Mio/workerからの全書込みを停止

# 2. 新Table・Columnを追加するmigrationを適用
make db-up ENV=production

# 3. OrganizationごとのAuth Settings / OIDC Providerを確定・登録

# 4. 最終preflight
pnpm multi-org-auth-backfill preflight

# 5. 全データを1 transactionで移行・検証し、全Sessionをrevoke
pnpm multi-org-auth-backfill cutover --batch-size 500

# 6. Membership UUID primary key昇格と同時リリース対象のContract migrationを適用
make db-up ENV=production

# 7. 新Kaedeを起動し、smoke test後に新Mioを公開
```

`cutover`は次を単一transactionで実行します。

1. 全scopeのpreflightを再検証する。
2. Organization、Membership、contact email、User Profile、Member Profile、Pedestrian、Invite creatorを全件移行する。
3. Membership単位Local Credential、canonical OIDC Identity、Membership OIDC Linkを全件移行する。
4. core migrationの未移行件数がすべて0であることを検証する。
5. auth backfillを再実行し、追加行が0であることを検証する。
6. FK/CHECK/NOT NULL制約をvalidateする。
7. 既存Sessionをすべてrevokeする。

途中で失敗した場合はtransaction全体がrollbackされます。原因を修正して最初から再実行します。

## 移行内容

- `users.email`を`users.contact_email`へ移す。contact emailはLocal login keyにしない。
- `users.display_name`を`user_profiles.display_name`へ移す。
- MembershipにUUID、status、joined_atを設定する。
- Pedestrianを対応するMembershipへ関連付ける。
- 身長・歩幅をmeterのままOrganization Member Profileへ移す。
- Local auth有効Organizationでは、現在Membershipごとにlegacy password hashをLocal Credentialへ複製する。
- Google Identityはcanonical issuer `https://accounts.google.com`と`subject`で移す。
- OIDC auth有効Organizationでは、ProviderとMembership Identity Linkを作る。
- 旧multi-use Inviteとpending activationは自動変換せず、事前に失効・解消して新Inviteを発行する。

## 成功判定

- `cutover`が`validated: true`を返す。
- coreのpending件数がすべて0である。
- authの2回目backfillが0件である。
- 全旧Sessionがrevoke済みである。
- Membership UUID primary key migrationが成功する。
- 新しいLocal/OIDC login、Organization切替、Invite受領、Profile取得が成功する。
- 旧endpointと旧ColumnへのApplication read/writeが存在しない。

## Rollback

一括Cutover後に旧Applicationだけを再起動してはいけません。新Credentialの変更を旧`users.password_hash`へ
逆同期しないため、Application rollbackだけでは認証データが一致しません。

サービス再開前に失敗した場合はtransaction rollbackまたは切替前backup restoreを行います。サービス再開後に
重大障害が見つかった場合も、旧形式へ部分的に戻さず、DatabaseとApplicationを同じ時点へ全体restoreするか、
新形式のままroll-forwardします。
