# nozomi

## 開発コマンド

python versionは`3.14`
パッケージ管理は`uv`

## 実行コマンド

```sh
$ uv sync --all-groups
$ uv run dev
```

Sentry を使う場合は `SENTRY_DSN` を設定してください。必要に応じて `SENTRY_TRACES_SAMPLE_RATE` と `SENTRY_SEND_DEFAULT_PII` も使えます。

本番相当の起動
```sh
$ uv run start
```

`HOST` と `PORT` は環境変数で上書きできます。

```sh
$ HOST=0.0.0.0 PORT=8080 uv run start
```

## Pipeline実行APIの運用条件

- 入出力URLは`S3_INTERNAL_ENDPOINT`と`S3_PUBLIC_ENDPOINT`のoriginだけを許可します。追加originが必要な場合は`NOZOMI_ALLOWED_STORAGE_ORIGINS`へカンマ区切りで指定します。
- callback先は`NOZOMI_PIPELINE_CALLBACK_URL`（既定はKaedeの`/api/internal/pipeline-executions/callbacks`）に固定し、`KAEDE_API_SHARED_TOKEN`をBearer認証に使用します。リクエストの`callback.secret`は後段PRとの互換性のため受理しますが利用・保存せず、URLや秘密値は実行DBへ保存しません。
- 1入力の上限は既定で200 MiBです。`NOZOMI_MAX_INPUT_BYTES`で変更できます。
- 実行予約とcallback配信待ちは`NOZOMI_EXECUTION_DB_PATH`のSQLiteへ保存します。Docker Composeでは永続volumeを割り当て、callbackが未達の場合は再起動後も指数バックオフで再送します。再起動で中断した実行は`execution_interrupted`へ収束し、失敗callbackを再送します。複数ホストへ水平分割する場合は共有DBへ移行してください。

### 軌跡とパーティクルフィルター動画の完了タイミング

軌跡CSV・評価結果などの保存後、動画のエンコードを待たずに`completed`を通知します。動画は計算済みの粒子履歴を使って同じバックグラウンドタスク内で生成し、アップロード後に別の`event_id`で`completed`を再通知します。2回目の通知には既存の成果物も含めるため、最初の通知が未達でも軌跡と動画を反映できます。

生成中の動画はmanifest上で`available: false`、`generation_status: processing`とし、未生成なのでchecksumやダウンロードURLは付けません。完成するとchecksum付きの利用可能な成果物に置き換わります。mioは生成中だけ5秒間隔でmanifestを取得し、完成後に動画を自動表示します。

動画の生成・アップロードに失敗した場合は動画だけを`generation_status: failed`にし、軌跡の`completed`は維持します。粒子履歴・地図・BLE補正などの描画用データは、圧縮したNPZ形式で実行DBの`artifact_sources`へ保存します。動画生成中にNozomiが再起動した場合は動画のみ失敗として通知し、軌跡と描画用データは維持します。動画のアップロードに成功した後は描画用データを削除します。

mioの失敗した動画に表示される「動画を再生成」から、`POST /api/trajectories/{trajectoryId}/particle-animation/retry`を呼び出せます。Kaedeが組織の管理権限を検証し、新しいアップロードURLを発行してNozomiの`POST /internal/pipeline-executions/{analysis_run_item_id}/particle-animation/retry`へ渡します。軌跡計算は行わず、保存した描画用データから動画だけを再生成します。生成中の重複リクエストは同じ試行を返します。再生成の通知には`generation_attempt`を付け、古い試行の通知で新しい状態が上書きされないようにします。

描画用データを保存できなかった場合や、導入前に失敗した動画は動画単体では再生成できません。manifestの`retry_available`が`true`でない場合はmioでその旨を表示します。新たに歩行データから解析してください。

反映時は先にKaedeとmioを更新し、新しいmanifest形式を受け取れるようにしてからNozomiを更新してください。

### uvのセットアップ

`uv venv`
`. .venv/bin/activate`
`uv sync --all-groups`
`uv run dev`

### uvでパッケージの追加

`uv add hoge`

## Git Hook

リポジトリルートで`lefthook`を使います。
`brew install lefthook`
初回だけルートで`lefthook install`を実行してください。

## コミット前に以下のコマンドを実行
## フォーマッター

```sh
uv run ruff format --check .
```

## リンター

```sh
uv run ruff check .
```

## リンター（自動修正）

```sh
uv run ruff check --fix .
```

## 型チェック

```sh
uv run mypy .
```

### callback再送と処理時間の確認

callbackが`404`かつJSONの`error_code: RUN_ITEM_NOT_FOUND`を返した場合は、対象の解析アイテムが存在しないため、その通知の再送を停止します。配信履歴はSQLiteに`status: failed`、`next_attempt_at: null`で残します。既存の再送待ち通知も、反映後の次回送信でこの応答を受けると停止します。通信エラー・5xx・別の404は従来どおり再送します。解析結果や動画用データは削除しません。

標準起動では、サーバーのINFOログに`Nozomi stage started/finished`を出力します。`item_id`で絞ると、同時実行中でも各処理を追えます。終了ログの`duration_seconds`は単調時計による実経過時間、`outcome`はその処理区間で例外が出たかどうかです（解析そのものの成否は`status`で確認します）。

| stage | 計測範囲 |
| --- | --- |
| input_download | 全入力と正解軌跡の取得・検証 |
| component | コンポーネント全体（前処理・計算・評価など） |
| pdr | RikkaのPDR計算 |
| particle_filter | RikkaのPF計算 |
| pipeline | 入力取得から全コンポーネント終了まで |
| trajectory_upload | 軌跡CSV・同期成果物の生成とアップロード |
| animation_source_serialize | 動画用データのNPZ圧縮 |
| animation_source_save | 動画用データのSQLite保存（ロック待ちを含む） |
| trajectory_event_save | 完了・失敗イベントのSQLite保存 |
| trajectory_callback | 初回結果通知（失敗時の即時再試行を含む） |
| animation_render | 動画の描画・エンコード（再生成時は復元も含む） |
| animation_upload | 動画のアップロード・manifest生成 |

`Nozomi trajectory publication finished`は、バックグラウンド実行開始から初回結果の通知試行終了までの合計です。通知が失敗した場合も出力するため、mioへの反映時刻を保証するログではありません。後続の動画処理時間は含みません。

区間には親子関係があり、`pipeline`の中に`input_download`と`component`が含まれます。共通API移行後はRikka内部のPDR・PFをNozomiでは個別計測しません。全区間を単純に足さないでください。CPU使用量や受付からバックグラウンド開始までの待機時間は計測しません。過去の実行の内訳は復元できないため、反映後に同一条件で再計測してください。

## Rikkaとの責務境界

パイプライン一覧はRikkaの `analysis_api.list_methods()` から起動時に構築します。
`registry/catalog.py` はRikkaの契約をNozomiのスロット・バインディングへ変換し、
`registry/rikka_executor.py` は方式IDとダウンロード済みbytesを
`execute_method()` へ渡します。PF/BLEの使用判断、前処理、設定変換、評価、描画は
Rikkaにあります。旧 `/analyze` もRikkaの互換窓口を通じて共通APIを使用します。

Nozomiは受付、入力取得・digest検証、実行状態・再送・復旧、成果物アップロード、
Kaedeへの通知を担当します。動画は軌跡公開後に生成し、素材は不透明なbytesとして
保存します。単体再生成は `render_artifact(source)` に委譲し、Rikkaの粒子型やNPZ構造を
参照しません。従来の素材、HTTPパス、成果物名、generation_attempt、event_id、
通知の重複対策は維持します。

方式定義のversionとsnapshot digest、入力digest、パラメータを使う既存の実行識別を
維持します。Rikkaの固定コミットはlockと合わせて記録し、契約・既定値・計算条件を
変える変更ではRikkaの方式バージョンも更新してください。

新方式はRikka内の定義・実行処理の明示登録後、依存コミット更新と再起動で取得できます。
テスト `test_rikka_extension.py` は方式固有コードを追加せず、追加方式の一覧取得、
可用性、入力・パラメータ検証、実行までを確認します。
新data_type、新しい入力取得元、軌跡以外の主出力、現在の部分JSON Schema契約を
超える検証、新たな通知や再試行エンドポイントが必要な場合はNozomi側の対応も必要です。

### 配布・依存更新

Rikkaの公開コミット `bbaea8b9e5fd8d16196db220f5539a27ce041df1` を
`pyproject.toml` / `uv.lock` へ固定しています。共通APIを含むコミットはGitから取得でき、
通常の依存解決で起動・テストできます。[Rikka PR #33](https://github.com/kajiLabTeam/rikka/pull/33)
を先にマージしてください。squash/rebaseで最終コミットが変わる場合は、Nozomiのpin・lockも
マージ後のコミットへ更新して再検証します。

新方式を公開した場合の更新手順:

1. Rikkaの変更をレビュー・コミットし、取得可能なGitリモートへ公開します。
2. Nozomiの `[tool.uv.sources].rikka.rev` をその実在するコミットへ更新します。
3. `uv lock` で `uv.lock` を更新します。他の依存は一括更新しません。
4. `PYTHONPATH` の指定を外し、`uv sync --locked --all-groups` 後に
   Ruff・format・Mypy・pytestとDockerビルドを実施します。
5. 通常のレビュー・リリース手順で反映します。ローカル検証やPR作成はデプロイ完了を意味しません。

既存の保存済み動画素材を維持し、新形式の素材が残る間は
対応するRikkaの復元処理も維持してください。

隣接ワークスペースでの検証例（Nozomiディレクトリから）:

```sh
PYTHONPATH=../../../rikka/src uv run ruff check .
PYTHONPATH=../../../rikka/src uv run ruff format --check .
PYTHONPATH=../../../rikka/src uv run mypy .
PYTHONPATH=../../../rikka/src uv run pytest
```

### 旧Trajectory APIからのPDR実行

Kaedeの `POST /api/recordings/:recordingId/trajectories` は、今後の新規要求を
`pdr` のanalysis run itemとOutboxへ登録する。旧 `/analyze` へ同時送信しない。
受付時に軌跡を作成し、itemと同じIDを返すため、既存の軌跡IDによる状態取得と
結果URL取得を継続できる。過去の結果へitemを遡及作成したり、CSVを書き換えたりしない。

内部実行要求の `legacy_trajectory: true` は `pdr` のみで使用する。
共通PDRを1回だけ呼ぶ `rikka.legacy_analysis` を通し、従来のセンサー列別名、
任意metadata、初期方位の既定値、開始位置と縮尺による座標変換、CSVの列順と
最初の歩を0秒とする時刻基準を保持する。通常Pipelineの入出力契約は変えない。
開始座標は旧APIに合わせて有限の小数・負値も受け付ける。経由点・終了点は従来どおり
保存するが、PDRの補正には使わない。条件省略時は計測の条件を使い、明示した空配列は維持する。

地図は計測に記録された版（版のない旧計測は初期版）で解決する。
版・checksum・縮尺・寸法はitemの `input_manifest.__floor_map__` に固定し、
地図を取得できない場合は受付を失敗させる。`__legacy_trajectory__` に互換処理の版と
元の制約点を保存し、再実行でも引き継ぐ。配送の再試行は同じitem IDを使用し、
Nozomiの実行予約とfingerprintで解析の重複起動を防ぐ。
