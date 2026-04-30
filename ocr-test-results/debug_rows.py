"""Show row structure for receipt 1 line-item section."""
import json
import sys
from pathlib import Path

sys.path.insert(0, r"C:\Users\barku\Documents\work\receipt-ocr")

from ocr.parser import (  # noqa: E402
    _build_rows, _estimate_receipt_width, _find_sections, _is_readable, _top_y, _left_x,
)

data = json.loads(Path("result1.json").read_text(encoding="utf-8"))
blocks = [b for b in data["_raw_blocks"] if _is_readable(b["text"])]
rows = _build_rows(blocks)
rw = _estimate_receipt_width(blocks)
h_end, t_start = _find_sections(rows, rw)

print(f"receipt_width={rw}, header_end={h_end}, totals_start={t_start}")
print(f"total rows: {len(rows)}")
print()

for i, row in enumerate(rows):
    tag = ""
    if i < h_end:
        tag = "[HEADER]"
    elif i >= t_start:
        tag = "[TOTALS]"
    else:
        tag = "[ITEM]"
    y = min(_top_y(b["bbox"]) for b in row)
    items_str = "  ||  ".join(
        f"x={int(_left_x(b['bbox'])):4d} '{b['text']}'" for b in row
    )
    print(f"{tag:>10} r{i:2d} y={int(y):4d} : {items_str}")
