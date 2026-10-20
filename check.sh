#!/usr/bin/env bash
# 推送前的本地静态检查（本机没有编译器时能挡掉一部分 CI 失败）。
# 依据桌面文档《安卓应用云端打包经验》第 8 节。
set -uo pipefail

fail=0

echo "== 1/3 XML 合法性"
while IFS= read -r -d '' f; do
  if ! xmllint --noout "$f" 2>/dev/null; then
    echo "  ✗ $f"
    xmllint --noout "$f"
    fail=1
  fi
done < <(find app/src/main -name '*.xml' -print0)
[ $fail -eq 0 ] && echo "  ✓ 全部通过"

echo "== 2/3 资源引用比对"
defined=$(
  {
    # values 里的 @string / @color / @style
    grep -rhoE 'name="[^"]+"' app/src/main/res/values/*.xml 2>/dev/null \
      | sed 's/name="//; s/"//' | sed 's/^android://'
    # @drawable / @mipmap 是按文件名定义的
    find app/src/main/res/drawable* -name '*.xml' 2>/dev/null | xargs -n1 basename | sed 's/\.xml$//'
    find app/src/main/res/mipmap* -name '*.xml' 2>/dev/null | xargs -n1 basename | sed 's/\.xml$//'
  } | sort -u
)
files=$(find app/src/main/res -name '*.xml' -o -name 'AndroidManifest.xml' | tr '\n' ' ')
refs=$(
  grep -rhoE '@(string|drawable|mipmap|style|color)/[A-Za-z0-9_.]+' $files 2>/dev/null \
    | sed 's#@[a-z]*/##' | sort -u
)
missing=0
for r in $refs; do
  # 颜色定义在 colors.xml（name=）、其余在各自文件里
  if ! echo "$defined" | grep -qx "$r"; then
    echo "  ✗ 未定义：@$r"
    missing=1
  fi
done
[ $missing -eq 0 ] && echo "  ✓ 所有引用都有定义" || fail=1

echo "== 3/3 Kotlin 括号配平"
if python3 - <<'PY'
import pathlib, sys


def strip_source(text):
    """按字符扫描，正确跳过字符串 / 字符字面量 / 注释。

    之前的正则版本会把 "http://127.0.0.1:..." 里的 // 当成行注释，
    连后面的引号和括号一起吃掉，导致括号配平误报。
    """
    out = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in ('"', "'"):
            quote = c
            if text.startswith(quote * 3, i):          # 三引号字符串
                i += 3
                while i < n and not text.startswith(quote * 3, i):
                    i += 1
                i += 3
            else:
                i += 1
                while i < n:
                    if text[i] == '\\':
                        i += 2
                        continue
                    if text[i] == quote:
                        i += 1
                        break
                    i += 1
            out.append('""')
            continue
        if c == '/' and text.startswith('//', i):
            while i < n and text[i] != '\n':
                i += 1
            continue
        if c == '/' and text.startswith('/*', i):
            i += 2
            while i + 1 < n and not text.startswith('*/', i):
                i += 1
            i += 2
            continue
        out.append(c)
        i += 1
    return ''.join(out)


bad = False
for f in sorted(pathlib.Path('app/src/main/java').rglob('*.kt')):
    s = strip_source(f.read_text())
    counts = []
    for o, c, name in [('{', '}', 'braces'), ('(', ')', 'parens'), ('[', ']', 'brackets')]:
        if s.count(o) != s.count(c):
            print(f'  ✗ {f}: {name} {s.count(o)} vs {s.count(c)}')
            bad = True
    print(f'  · {f.name}')
sys.exit(1 if bad else 0)
PY
then echo "  ✓ 配平"; else fail=1; fi

echo
if [ $fail -eq 0 ]; then
  echo "静态检查全部通过。剩下的类型错误只能靠 CI 编译器发现。"
else
  echo "有检查项未通过，修完再推。"
fi
exit $fail
