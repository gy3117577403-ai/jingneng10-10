"""Check update records and common accidental tracking errors using only stdlib."""

import argparse
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
ID = r"JN-[0-9]{4,}"
SECTIONS = ("目标与范围", "具体变化", "验证与证据", "数据与回退", "剩余事项")


def git(*args, input_bytes=None):
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def check(base=None):
    errors = []
    records = sorted((ROOT / "docs" / "changes").glob("*.md"))
    if not records:
        errors.append("No update records found in docs/changes/.")
    seen = set()
    for path in records:
        name = path.relative_to(ROOT).as_posix()
        content = path.read_text(encoding="utf-8-sig")
        identifier = path.stem
        if not re.fullmatch(ID, identifier):
            errors.append(f"{name}: invalid record filename.")
        ids = re.findall(rf"^更新编号：({ID})\s*$", content, re.M)
        if ids != [identifier]:
            errors.append(f"{name}: expected one matching update ID.")
        for item in ids:
            if item in seen:
                errors.append(f"{name}: duplicate ID {item}.")
            seen.add(item)
        for field in ("日期", "状态", "分支", "起点"):
            if not re.search(rf"^{field}：[^\r\n]+$", content, re.M):
                errors.append(f"{name}: missing metadata {field}.")
        state = re.findall(r"^状态：(.+)$", content, re.M)
        if len(state) != 1 or state[0].strip() not in {"计划中", "进行中", "已完成", "已撤回"}:
            errors.append(f"{name}: invalid status.")
        for title in SECTIONS:
            section = re.search(rf"^## {title}\s*\n(.*?)(?=^## |\Z)", content, re.M | re.S)
            if section is None or not section.group(1).strip():
                errors.append(f"{name}: missing or empty section {title}.")

    tracked = git("ls-files", "-z")
    if tracked.returncode:
        errors.append("Cannot list tracked files; run inside the Git checkout.")
    elif tracked.stdout:
        ignored = git("check-ignore", "--no-index", "-z", "--stdin", input_bytes=tracked.stdout)
        if ignored.returncode not in (0, 1):
            errors.append("Cannot check tracked paths against ignore rules.")
        elif ignored.stdout:
            for item in ignored.stdout.decode("utf-8").split("\0"):
                if item:
                    errors.append(f"Tracked file matches .gitignore: {item}")

    if base and set(base) != {"0"}:
        if not re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", base):
            errors.append("--base must be a full Git commit SHA.")
        else:
            diff = git("diff", "--name-status", "--no-renames", f"{base}...HEAD")
            if diff.returncode:
                errors.append("Cannot compare base to HEAD; fetch complete history first.")
            else:
                changes = [line.split("\t", 1) for line in diff.stdout.decode("utf-8").splitlines()]
                recorded = any(
                    status in {"A", "M"} and re.fullmatch(rf"docs/changes/{ID}\.md", path)
                    for status, path in changes
                )
                if changes and not recorded:
                    errors.append("Changed files require an added or updated docs/changes/JN-NNNN.md record.")
    return errors, len(records)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", help="Full base commit SHA; check the change batch has an update record.")
    args = parser.parse_args()
    failures, count = check(args.base)
    for failure in failures:
        print(f"ERROR: {failure}", file=sys.stderr)
    if failures:
        sys.exit(1)
    print(f"OK: {count} update record(s); tracked file checks passed.")
