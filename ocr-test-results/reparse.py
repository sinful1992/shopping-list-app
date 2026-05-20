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

# Receipt 5 — Co-op Holbury (BALANCE DUE format, inline qty, OWNED BY YOU logo)
path5 = HERE / "result5.json"
data5 = json.loads(path5.read_text(encoding="utf-8"))
blocks5 = data5.get("_raw_blocks", [])
result5 = parse_blocks(blocks5)
print("===== receipt 5 (Co-op) =====")
print(json.dumps(result5, indent=2, ensure_ascii=False))
print()

assert result5["merchant_name"] == "CO-OP", f"merchant: expected CO-OP, got {result5['merchant_name']}"
assert result5["total"] == "9.70", f"total: expected 9.70, got {result5['total']}"
assert len(result5["line_items"]) == 4, f"items: expected 4, got {len(result5['line_items'])}"
assert result5["line_items"][0]["description"] == "BATCH S/NOODLE B"
assert result5["line_items"][0]["quantity"] == 1
assert result5["line_items"][1]["description"] == "HELLMANNS MAYO"
assert result5["line_items"][2]["description"] == "UNI-EAGLE SRIRAC"
assert result5["line_items"][3]["description"] == "CP QCHE LRNE 400"
print("receipt 5 assertions PASS")
