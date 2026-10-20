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
import pathlib, re, sys

def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    t = re.sub(r'//[^\n]*', '', t)
    t = re.sub(r'"""(?:.|\n)*?"""', '""', t)
    t = re.sub(r'"(?:\\.|[^"\\])*"', '""', t)
    t = re.sub(r"'(?:\\.|[^'\\])'", "''", t)
    return t

bad = False
for f in sorted(pathlib.Path('app/src/main/java').rglob('*.kt')):
    s = strip(f.read_text())
    for o, c, n in [('{', '}', 'braces'), ('(', ')', 'parens'), ('[', ']', 'brackets')]:
        if s.count(o) != s.count(c):
            print(f'  ✗ {f}: {n} {s.count(o)} vs {s.count(c)}')
            bad = True
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
