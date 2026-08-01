# Object Storage Schema

この文書は、SeaweedFS の S3 API を利用する前提で、オブジェクトストレージ上の保存規約の正本とする。

## 前提

- オブジェクトストレージは SeaweedFS の S3 API を利用する
- 仲介サーバー `kaede` が署名付き URL の発行と保存先の決定を担う
- 解析サーバー `nozomi` は DB や SeaweedFS の接続情報を持たず、署名付き URL のみを使う
- raw データ、解析結果、ground truth は非公開で扱う
- フロア画像は用途に応じて取得用 URL を発行する

## 基本方針

- 保存先キーは DB に冗長保存せず、ID と規約から導出する
- 例外として、フロア画像だけは `floors.image_object_path` に実キーを保存する
- 当面は 1 バケット内で prefix により論理分離する
- bucket 名は環境ごとに分ける
- prefix 規約は環境をまたいで共通にする
- 当面は自動削除を行わない

## prefix 構成

- `organizations/`

```text
organizations/
```

## floor maps

施設マップ画像の保存領域。

キー規約:

```text
organizations/{organization_id}/floors/{floor_id}/map.{ext}
```

例:

```text
organizations/99999999-9999-4999-8999-999999999999/floors/22222222-2222-4222-8222-222222222222/map.svg
organizations/99999999-9999-4999-8999-999999999999/floors/33333333-3333-4333-8333-333333333333/map.png
```

ルール:

- `{organization_id}` は `buildings.organization_id`
- `{floor_id}` は `floors.id`
- `{ext}` は `svg` または `png`
- `jpg` / `jpeg` は当面許可しない
- `floors.image_object_path` に拡張子込みの実キーを保存する

## recordings

計測データの保存領域。

### raw データ

キー規約:

```text
organizations/{organization_id}/recordings/{recording_id}/raw/acce.csv
organizations/{organization_id}/recordings/{recording_id}/raw/gyro.csv
organizations/{organization_id}/recordings/{recording_id}/raw/metadata.json
organizations/{organization_id}/recordings/{recording_id}/raw/pressure.csv
organizations/{organization_id}/recordings/{recording_id}/raw/wifi.csv
```

例:

```text
organizations/99999999-9999-9999-9999-999999999999/recordings/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/raw/acce.csv
organizations/99999999-9999-9999-9999-999999999999/recordings/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/raw/gyro.csv
```

ルール:

- `{organization_id}` は `recordings.organization_id`
- `{recording_id}` は `recordings.id`
- `acce.csv` と `gyro.csv` は必須対象
- `metadata.json` は `kaede` がアップロード対象に必ず追加する
- `pressure.csv` と `wifi.csv` は任意
- 必須 / 任意の判定はアプリ側スキーマで持つ
- `complete-upload` では `upload_targets` に応じて存在確認する
- 認可判断は object key ではなく DB の `recordings.organization_id` を正とする

### ground truth

キー規約:

```text
organizations/{organization_id}/recordings/{recording_id}/ground_truth/{truth_type}.csv
```

現時点の正式値:

- `uwb`

例:

```text
organizations/99999999-9999-4999-8999-999999999999/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ground_truth/uwb.csv
```

ルール:

- 当面の運用ファイルは `uwb.csv`
- 将来 truth 種別が増えても対応できるよう、規約自体は `{truth_type}.csv` とする

## trajectories

解析結果の保存領域。

キー規約:

```text
organizations/{organization_id}/trajectories/{trajectory_id}/analyzed/result.csv
organizations/{organization_id}/trajectories/{trajectory_id}/ground_truth/result.csv
```

例:

```text
organizations/99999999-9999-4999-8999-999999999999/trajectories/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/analyzed/result.csv
organizations/99999999-9999-4999-8999-999999999999/trajectories/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/ground_truth/result.csv
```

ルール:

- `{trajectory_id}` は `trajectories.id`
- `{organization_id}` は `trajectories.organization_id`
- `result.csv` は解析結果の標準出力
- `ground_truth/result.csv` は trajectory 単位の整形済み ground truth 結果を表す
- 再解析時は既存結果を上書きせず、新しい `trajectory_id` 配下に保存する

## 完了判定

`complete-upload` の完了条件は、`upload_targets` に対応する raw ファイルが規約どおりのキーにすべて存在することである。

判定対象:

- `organizations/{organization_id}/recordings/{recording_id}/raw/acce.csv`
- `organizations/{organization_id}/recordings/{recording_id}/raw/gyro.csv`
- `organizations/{organization_id}/recordings/{recording_id}/raw/metadata.json`
- `organizations/{organization_id}/recordings/{recording_id}/raw/pressure.csv`
- `organizations/{organization_id}/recordings/{recording_id}/raw/wifi.csv`

当面の判定粒度:

- 存在確認のみ
- サイズや checksum の検証は行わない

## 公開範囲

非公開:

- `organizations/` 配下の recording raw、floor map、trajectory analyzed result、ground truth

署名付き URL 発行対象:

- スマホアプリ向け raw アップロード URL
- `nozomi` 向け raw データ取得 URL
- `nozomi` 向け解析結果アップロード URL
- フロア画像取得 URL

方針:

- オブジェクトそのものを恒久公開しない
- 必要な時だけ `kaede` が署名付き URL を発行する

## 保持期間

- `organizations/*/floors/*/map.*` は手動削除まで保持
- `organizations/*/recordings/*/raw` は当面削除しない
- `organizations/*/recordings/*/ground_truth` は当面削除しない
- `organizations/*/trajectories/*/analyzed/result.csv` は当面削除しない
- `organizations/*/trajectories/*/ground_truth/result.csv` は当面削除しない

## 環境ごとの運用

- bucket 名は環境変数 `S3_BUCKET` で管理する
- local / staging / production で bucket を分ける
- prefix 規約はすべての環境で共通とする
