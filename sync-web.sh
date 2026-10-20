#!/usr/bin/env bash
# 把网页游戏打包成单个自包含 HTML，放进 Android 的 assets。
#
# 为什么是单文件：WebView 在 file:// 下不允许加载外部模块/样式，
# 但内联在同一份 HTML 里的脚本和样式是完全正常的。这样就不需要本地服务器、
# 不需要 INTERNET 权限，也没有端口/线程这些可能出错的东西。
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../racer"
out="$here/app/src/main/assets"

if [ ! -d "$src" ]; then
  echo "找不到网页工程：$src" >&2
  exit 1
fi

if [ ! -x "$src/node_modules/.bin/esbuild" ]; then
  echo "缺少 esbuild，先在 $src 里执行：npm i -D esbuild" >&2
  exit 1
fi

mkdir -p "$out"
"$src/build-single.sh" "$out/game.html"

echo "已生成 $out/game.html"
du -h "$out/game.html"
