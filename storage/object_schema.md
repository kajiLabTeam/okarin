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

- `maps/`
- `recordings/`
- `trajectories/`

```text
maps/
recordings/
trajectories/
```

## maps

施設マップ画像の保存領域。

キー規約:

```text
maps/{building_id}/{floor_id}.{ext}
```

例:

```text
maps/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.svg
maps/11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333.png
```

ルール:

- `{building_id}` は `buildings.id`
- `{floor_id}` は `floors.id`
- `{ext}` は `svg` または `png`
- `jpg` / `jpeg` は当面許可しない
- `floors.image_object_path` に拡張子込みの実キーを保存する

## recordings

計測データの保存領域。

### raw データ

キー規約:

```text
recordings/{recording_id}/raw/acce.csv
recordings/{recording_id}/raw/gyro.csv
recordings/{recording_id}/raw/pressure.csv
recordings/{recording_id}/raw/wifi.csv
```

例:

```text
recordings/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/raw/acce.csv
recordings/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/raw/gyro.csv
```

ルール:

- `{recording_id}` は `recordings.id`
- `acce.csv` と `gyro.csv` は必須対象
- `pressure.csv` と `wifi.csv` は任意
- 必須 / 任意の判定はアプリ側スキーマで持つ
- `complete-upload` では `upload_targets` に応じて存在確認する

### ground truth

キー規約:

```text
recordings/{recording_id}/ground_truth/{truth_type}.csv
```

現時点の正式値:

- `uwb`

例:

```text
recordings/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/ground_truth/uwb.csv
```

ルール:

- 当面の運用ファイルは `uwb.csv`
- 将来 truth 種別が増えても対応できるよう、規約自体は `{truth_type}.csv` とする

## trajectories

解析結果の保存領域。

キー規約:

```text
trajectories/{trajectory_id}/analyzed/result.csv
```

例:

```text
trajectories/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/analyzed/result.csv
```

ルール:

- `{trajectory_id}` は `trajectories.id`
- `result.csv` は解析結果の標準出力
- 再解析時は既存結果を上書きせず、新しい `trajectory_id` 配下に保存する

## 完了判定

`complete-upload` の完了条件は、`upload_targets` に対応する raw ファイルが規約どおりのキーにすべて存在することである。

判定対象:

- `recordings/{recording_id}/raw/acce.csv`
- `recordings/{recording_id}/raw/gyro.csv`
- `recordings/{recording_id}/raw/pressure.csv`
- `recordings/{recording_id}/raw/wifi.csv`

当面の判定粒度:

- 存在確認のみ
- サイズや checksum の検証は行わない

## 公開範囲

非公開:

- `recordings/` 配下の raw データ
- `recordings/` 配下の ground truth
- `trajectories/` 配下の解析結果

署名付き URL 発行対象:

- スマホアプリ向け raw アップロード URL
- `nozomi` 向け raw データ取得 URL
- `nozomi` 向け解析結果アップロード URL
- フロア画像取得 URL

方針:

- オブジェクトそのものを恒久公開しない
- 必要な時だけ `kaede` が署名付き URL を発行する

## 保持期間

- `maps/` は手動削除まで保持
- `recordings/raw` は当面削除しない
- `recordings/ground_truth` は当面削除しない
- `trajectories/analyzed/result.csv` は当面削除しない

## 環境ごとの運用

- bucket 名は環境変数 `S3_BUCKET` で管理する
- local / staging / production で bucket を分ける
- prefix 規約はすべての環境で共通とする
