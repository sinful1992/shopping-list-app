"""Re-run parser on saved _raw_blocks from previous OCR responses."""
import json
import sys
from pathlib import Path

sys.path.insert(0, r"C:\Users\barku\Documents\work\receipt-ocr")

from ocr.parser import parse_blocks  # noqa: E402

HERE = Path(__file__).parent

for i in (1, 2, 3, 4):
    path = HERE / f"result{i}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    blocks = data.get("_raw_blocks", [])
    result = parse_blocks(blocks)
    print(f"===== receipt {i} =====")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print()
