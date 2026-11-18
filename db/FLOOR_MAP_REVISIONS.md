# 地図の版管理（#192）

## データと移行

- `floor_map_revisions` が画像キー・寸法・縮尺・作成日時の正本。`floors.initial_map_revision_id` と `current_map_revision_id` は同一フロア・組織の版だけを参照できる。
- `floors` の画像・寸法・縮尺は既存API向けの現在版の投影。画像・縮尺の更新と版の追加・参照切替は同じDBトランザクションで行う。
- 移行時点の現存地図を各フロアの初期版とし、既存Recording・Trajectory・滞在分析を関連付ける。その初期版で表示・再解析できる。版情報のない旧アプリからの新規登録も常に初期版を使う。
- 版IDが送られたら指定版を使う。他フロア・他組織・存在しない版は拒否する。生の計測ファイルは変更しない。
- 地図画像・縮尺・確定済み寸法は版の作成後に書き換えない。寸法nullだけはストレージを読み出して一度補完できる。

SQL migration適用後、ストレージの資格情報を設定したKaede環境で実行する。

```sh
pnpm exec tsx src/cli/backfill-floor-map-dimensions.ts
pnpm exec tsx src/cli/backfill-floor-map-dimensions.ts --execute
```

既定はdry run。取得不能・形式不適合は版ID付きで `unavailable` として出力し、終了コード1を返す。再実行では寸法nullの版だけを処理する。未補完の寸法を画像の描画サイズで代用しない。

## API

- `GET /api/floors/{floorId}`: 現在版。
- `GET /api/floors/{floorId}?revision_id={id}`: 指定版。既存フロア取得と同じ組織認可。
- `GET /api/organizations/{organizationId}/floors/{floorId}/map-revisions`: 版一覧。
- `GET /api/organizations/{organizationId}/floors/{floorId}/map-revisions/{revisionId}`: 指定版。
- `POST /api/organizations/{organizationId}/floors/{floorId}/map-revisions`: 管理者がmultipartの `map_image`（PNG/SVG）、任意の `scale`（m/px）で画像を更新。scale省略は現在値を維持、空文字は未設定。
- 既存のfloor PATCHでscaleを変更しても新しい版になる。名前・階層だけの変更では版を追加しない。
- Recording initの任意の `floor_map_revision_id` に、ayumiが実際に取得した版を渡す。
- `beacons/recording-config?revision_id={id}` は対応版のビーコン配置を返す。

## ビーコンと表示

新版には現在のビーコン座標を引き継ぎ、旧版の配置を保存する。画像更新ではMioに確認・修正を促すが、確認前のBLE計測・解析は止めない。ユーザーが保存した時点で現在配置を変更する。縮尺だけの変更で新たな再確認は求めない。

解析は計測metadataの配置スナップショットを優先する。スナップショットのない旧計測は、その版の保存配置を使う。実行時の配置は既存のchecksum付きオブジェクトとして固定し、実行manifestを正本とする。

Mioに旧版選択UIは設けない。通常画面は現在版、過去の計測・軌跡・滞在分析は対応版を自動取得する。軌跡を表示するときはAPIの `map_width_px` / `map_height_px` を座標基準に使う。版の異なる軌跡を同じ地図へ重ねず、滞在分析も異なる版の混在を拒否する。

Pipelineの実行manifestは `__floor_map__` に使用した地図の版・object key・checksum・寸法・縮尺を保持する。実行履歴は既存の `positioning_analysis_run_items` に保存し、Trajectoryへ同じJSONを重複保存しない。再試行では元の入力manifest・パラメーターを引き継ぐ。

## 旧単一軌跡APIの互換性

旧APIからの新規実行もPDR Pipelineを1つのanalysis run itemとして登録し、1つのOutboxジョブで配送する。軌跡IDは受付時から状態取得に使える。完了前の軌跡参照を認めるDB制約は、互換マーカーを持ちitemと同一IDの軌跡だけに限定する。

旧入口で未指定方位を90°、未設定縮尺を0.01m/pxに補完し、実際に渡す値をitemのparametersへ保存する。明示された方位・計測の地図版に設定された縮尺はその値を使う。通常Pipelineへこれらの互換用補完は適用しない。

`input_manifest.__legacy_trajectory__` には互換プロファイル、CSV列、時刻原点、座標系、補完したパラメーター名、開始・経由・終了点を保存する。経由・終了点の推定への適用は追加しない。旧CSVの6列と各列の意味、最初のステップを0秒とする時刻基準を維持する。開始点なしの場合は従来どおりローカルm座標で、開始点ありの場合は地図px座標へ変換する。既存の結果・計測ファイルは変更しない。

main `536114a` と当時の固定Rikka `fd486f6` で生成した数値比較データをNozomiの `tests/fixtures/legacy-pdr-main-536114a.json` に保持する。公開済み依存に対し、既定値・明示指定・小数/負の開始座標・開始点なしの4ケースで、全CSV列と座標・方位・時刻を回帰検証する。
