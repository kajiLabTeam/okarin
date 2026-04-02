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

```txt
pnpm run deploy
```

## Linter,Formatter

Linterの実行:`pnpm lint`
Linterの実行時にFixableな箇所を直す:`pnpm lint:fix`
Formatterを実行:`pnpm format`

## Git Hook

リポジトリルートで`lefthook`を使います。
初回だけルートで`lefthook install`を実行してください。
