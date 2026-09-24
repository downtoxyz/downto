#!/usr/bin/env bash
# scripts/check-enums.sh — ARCHITECTURE §3.2 / §12.
# For every enum in Downto/Domain/Enums.swift tagged with a `// column: table.column` comment, finds the LAST
# `CHECK (column IN (...))` for that column across supabase/migrations (sorted by version) and diffs the value
# set against the Swift raw values (ignoring `unknown`). A future migration that adds a value fails here
# instead of silently decoding to `.unknown`. Columns with no CHECK constraint are reported and skipped.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENUMS="${ENUMS_FILE:-$HERE/Downto/Domain/Enums.swift}"
MIGRATIONS="${MIGRATIONS_DIR:-$HERE/../../supabase/migrations}"

[ -f "$ENUMS" ] || { echo "check-enums: $ENUMS missing" >&2; exit 1; }
[ -d "$MIGRATIONS" ] || { echo "check-enums: migrations dir $MIGRATIONS missing" >&2; exit 1; }

python3 - "$ENUMS" "$MIGRATIONS" <<'EOF'
import re, sys, pathlib

enums_path, mig_dir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
src = enums_path.read_text()

# --- Swift side -------------------------------------------------------------
enum_re = re.compile(
    r"//\s*column:\s*(?P<table>\w+)\.(?P<col>\w+)[^\n]*\n\s*(?:nonisolated\s+)?enum\s+(?P<name>\w+)\s*:[^{]*\{(?P<body>.*?)\n\}",
    re.S,
)
swift = {}
for m in enum_re.finditer(src):
    body = re.sub(r"//[^\n]*", "", m.group("body"))
    values = set()
    for case in re.finditer(r"\bcase\s+(.*?)(?=\n\s*case\b|\Z)", body, re.S):
        for item in case.group(1).split(","):
            item = item.strip()
            if not item:
                continue
            mm = re.match(r"`?(\w+)`?\s*(?:=\s*\"([^\"]*)\")?", item)
            if not mm:
                continue
            name, raw = mm.group(1), mm.group(2)
            values.add(raw if raw is not None else name)
    swift[(m.group("table"), m.group("col"))] = (m.group("name"), values - {"unknown"})

if not swift:
    print("check-enums: no `// column:` tagged enums found in Enums.swift", file=sys.stderr)
    sys.exit(1)

# --- SQL side ---------------------------------------------------------------
# A constraint is attributed to a table only when the SQL *statement* that carries it is a
# `CREATE TABLE <table>` or `ALTER TABLE <table>` — not merely because the file mentions the table
# somewhere (a trigger or policy in the same file must not attach another table's CHECK to this one).
files = sorted(p for p in mig_dir.iterdir() if p.suffix == ".sql")
sql_last = {}
for f in files:
    text = f.read_text()
    statements = text.split(";")
    for (table, col) in swift:
        owner = re.compile(
            r"\b(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?(?:\s+ONLY)?)\s+(?:public\.)?%s\b" % re.escape(table),
            re.I,
        )
        # CHECK (col IN ('a','b')) or CHECK (col IS NULL OR col IN (...)); constraints are multi-line for notifications.type
        pat = re.compile(r"CHECK\s*\(\s*(?:%s\s+IS\s+NULL\s+OR\s+)?%s\s+IN\s*\((.*?)\)\s*\)" % (col, col), re.S | re.I)
        for stmt in statements:
            if not owner.search(stmt):
                continue
            for m in pat.finditer(stmt):
                vals = set(re.findall(r"'([^']*)'", m.group(1)))
                sql_last[(table, col)] = (f.name, vals)

status = 0
for key, (name, sv) in sorted(swift.items()):
    table, col = key
    if key not in sql_last:
        print(f"check-enums: {name:<20} {table}.{col}: no CHECK constraint in migrations — skipped ({len(sv)} Swift cases)")
        continue
    fname, dv = sql_last[key]
    if sv == dv:
        print(f"check-enums: {name:<20} {table}.{col}: OK ({len(dv)} values, {fname})")
    else:
        status = 1
        print(f"check-enums: {name:<20} {table}.{col}: MISMATCH vs {fname}", file=sys.stderr)
        if dv - sv:
            print(f"    in DB, missing from Swift: {sorted(dv - sv)}", file=sys.stderr)
        if sv - dv:
            print(f"    in Swift, not in DB:       {sorted(sv - dv)}", file=sys.stderr)

sys.exit(status)
EOF
