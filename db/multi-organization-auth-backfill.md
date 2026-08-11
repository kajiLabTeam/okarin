# Multi-Organization Auth Backfill Runbook

この手順は、multi-organization authのExpand schema適用後に既存データを移行するためのものです。
旧column/API/sessionはこの手順では削除・切替しません。

## 安全原則

- 本番と同等のsnapshotで事前リハーサルする。
- `preflight` のblocking issueを手動で解消し、データを推測で修正しない。
- backfillはbatch実行し、再実行可能であることを確認する。
- Organizationの認証方式はglobal runtime設定から推測しない。各Organizationについて明示的に決定する。
- 既存Sessionのrevoke、auth cutover、旧column削除、Membership PK切替は後続PRで行う。

## 測定値の正規化

`pedestrians.height` と `pedestrians.stride_length` は次の規則でmeterへ統一する。

| 既存値                      | 判定       | 保存値                             |
| --------------------------- | ---------- | ---------------------------------- |
| `NULL`                      | 未設定     | `NULL`                             |
| `0 < value <= 3`            | 既にmeter  | 小数第3位へ丸める                  |
| `3 < value <= 300`          | centimeter | `value / 100`後、小数第3位へ丸める |
| 上記以外、または丸め後に`0` | 不正       | blocking issue。自動修正しない     |

`preflight` は `already_m / converted_cm / invalid` の値数を返す。`backfill-core`も実際に書き込んだ
`measurement_values_already_m / measurement_values_converted_cm`を返す。

## 実行コマンド

Kaede directoryで実行する。

```sh
pnpm multi-org-auth-backfill preflight
pnpm multi-org-auth-backfill backfill-core --batch-size 500
pnpm multi-org-auth-backfill verify
```

`backfill-core`の対象は次の通り。

- Organization status
- Membership UUID/status/joined_at（`joined_at`は旧Membershipの`created_at`を使用）
- User contact emailと共通Profile
- PedestrianとMembershipの関連
- Organization member profile（表示名override、meterへ正規化した身長・歩幅）
- Invite creator Membership

## 認証設定とCredential移行

先に各Organizationの`organization_auth_settings`を運用者が明示的に登録する。OIDCを有効にする場合は、
そのOrganizationにcanonical issuer `https://accounts.google.com`を持つ有効なProviderを1件登録する。
作成者のemail domainやglobal環境変数からpolicy/hosted domainを自動設定しない。

設定後に再度preflightを実行する。

```sh
pnpm multi-org-auth-backfill preflight
pnpm multi-org-auth-backfill backfill-auth --batch-size 500
```

`backfill-auth`は次を行う。

- Local auth有効Organizationだけ、現在Membershipとlegacy passwordからLocal Credentialを作る。
- login emailは`lower(btrim(email))`で正規化し、Organization内collisionがあれば全auth backfillを停止する。
- legacy Google Identityをcanonical `issuer + subject`へ移す。emailはIdentity keyにしない。
- OIDC auth有効かつGoogle Providerが一意に決まるOrganizationだけMembership Linkを作る。

認証policy不足、Providerの不足/複数候補、Identity owner conflictがある場合は何も自動修正せず停止する。

## Constraint validation

core verifyが全て0になった後だけ実行する。

```sh
pnpm multi-org-auth-backfill validate
```

これはExpandで`NOT VALID`として追加した、今回のbackfillで安全に検証できるconstraintを`VALIDATE`し、
Organization statusとMembership UUID/status/joined_atを`NOT NULL`へ昇格する。
NOT NULL昇格では短い`lock_timeout`と一時的な`NOT VALID` CHECKの事前検証を利用し、長時間のlockと再scanを避ける。
Membershipの旧`(organization_id, user_id)` PKと同じ意味になるcurrent Membership partial unique indexはこのPRでは追加しない。
現行Repositoryが同制約をupsert conflict targetとして使っているため、UUID PKへの切替はRepository互換対応と同じPRで行う。

## blocking issueの扱い

- `LOCAL_LOGIN_EMAIL_COLLISION`: 対象のlogin emailを運用判断で変更してから再実行する。
- `MISSING_ORGANIZATION_AUTH_POLICY`: OrganizationごとのLocal/OIDC policyを明示する。
- `OIDC_PROVIDER_MAPPING_MISSING_OR_AMBIGUOUS`: Providerを一意に確定する。
- `OIDC_IDENTITY_OWNER_CONFLICT`: account linkを自動統合せず、本人確認を伴う別手順で解消する。
- `PEDESTRIAN_MEMBERSHIP_NOT_FOUND`: Membershipとの対応を確認する。
- `PEDESTRIAN_MEASUREMENT_OUT_OF_RANGE`: 元データの単位・値を確認して修正する。
- `INVITE_CREATOR_MEMBERSHIP_NOT_FOUND`: 発行者Membershipを確認する。
- `LEGACY_MULTI_USE_INVITE`: 権限を持つmanager/ownerが新しいsingle-use Inviteを発行する。
- `PENDING_ACTIVATION_USER`: cutover前にactivation状態を運用判断する。
