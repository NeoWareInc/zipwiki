"""Print one value from a dotenv file. Used by local scripts; does not log the value."""

import sys
from pathlib import Path

path, name = sys.argv[1], sys.argv[2]
value = ""
for line in Path(path).read_text().splitlines():
    if line.startswith(f"{name}="):
        value = line.split("=", 1)[1].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        break
sys.stdout.write(value)
