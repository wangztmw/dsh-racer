#!/usr/bin/env bash
# 把桌面上那份网页游戏同步进 Android 工程的 assets。
# 改完游戏代码后跑一次这个脚本，再提交即可。
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../racer"
out="$here/app/src/main/assets/game"

if [ ! -d "$src" ]; then
  echo "找不到网页工程：$src" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out/vendor/addons/environments" "$out/vendor/addons/utils"

cp "$src/index.html" "$out/index.html"
cp -R "$src/src" "$out/src"
cp -R "$src/styles" "$out/styles"

# 只带运行必需的那几个 three 文件（整包 node_modules 有 32MB）
cp "$src/node_modules/three/build/three.module.min.js" "$out/vendor/three.module.js"
cp "$src/node_modules/three/examples/jsm/environments/RoomEnvironment.js" "$out/vendor/addons/environments/"
cp "$src/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js" "$out/vendor/addons/utils/"

# importmap 指向随包的 three，而不是 node_modules
python3 - "$out/index.html" <<'PY'
import sys
path = sys.argv[1]
text = open(path, encoding='utf-8').read()
text = text.replace('"./node_modules/three/build/three.module.js"', '"./vendor/three.module.js"')
text = text.replace('"./node_modules/three/examples/jsm/"', '"./vendor/addons/"')
open(path, 'w', encoding='utf-8').write(text)
PY

echo "已同步到 $out"
du -sh "$out"
