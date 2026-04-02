# kaede

## 実行

以下のバージョンでしか動きません。`package.json`で指定しているので確認してください。

```
node.js : >= 22.13.0
pnpm : >= 10.0.0
```

```txt
pnpm install
pnpm run dev
```

## Linter,Formatter

Linterの実行:`pnpm lint`
Linterの実行時にFixableな箇所を直す:`pnpm lint:fix`
Formatterを実行:`pnpm format`

## Git Hook

リポジトリルートで`lefthook`を使います。

`lefthook`をインストールしていない場合はインストールをしてください。

brewの場合:`brew install lefthook`

初回だけルートで`lefthook install`を実行してください。

コミット前の確認を手動で行う場合:

```txt
pnpm lint
pnpm exec prettier --check .
pnpm exec tsc --noEmit
```
