#!/usr/bin/env python3
"""Blocks dashboard-builder from touching anything outside .dashboard/ and its memory."""
import json
import os
import sys

data = json.load(sys.stdin)
tool_input = data.get("tool_input", {})
project = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
path = tool_input.get("file_path") or tool_input.get("path") or "."

allowed = [
    os.path.realpath(os.path.join(project, ".dashboard")),
    os.path.realpath(os.path.join(project, ".claude", "agent-memory", "dashboard-builder")),
]
target = os.path.realpath(os.path.join(project, path))
inside = any(target == a or target.startswith(a + os.sep) for a in allowed)
sneaky_glob = ".." in tool_input.get("pattern", "")

if inside and not sneaky_glob:
    sys.exit(0)
print(f"dashboard-builder may only use .dashboard/ and its memory folder (tried: {path})", file=sys.stderr)
sys.exit(2)  # exit code 2 = block the tool call
