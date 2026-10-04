"""Compare pinned local PDF fixtures without network, app secrets or model calls."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unicodedata

ROOT = Path(__file__).resolve().parent
ENGINES = ["pypdf", "pdfplumber", "docling-native"]
MAX_BYTES = 8 * 1024 * 1024


def normalize(text):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text).replace("’", "'")).strip()


def evaluate_pages(pages, fixture):
    findings = []
    if len(pages) != fixture["pages"]:
        findings.append("page_count_mismatch")
    for check in fixture["checks"]:
        page = check["page"]
        if not 1 <= page <= len(pages):
            findings.append(f"page_{page}_missing")
            continue
        text = normalize(pages[page - 1])
        for anchor in check.get("anchors", []):
            if normalize(anchor) not in text:
                findings.append(f"page_{page}_missing_anchor:{anchor}")
        ordered = check.get("orderedAnchors", [])
        positions = [text.find(normalize(anchor)) for anchor in ordered]
        if ordered and (any(pos < 0 for pos in positions)
                        or positions != sorted(set(positions))):
            findings.append(f"page_{page}_column_order_not_preserved")
        if check.get("expectNoNativeText") and text:
            findings.append(f"page_{page}_unexpected_native_text")
        if any(ord(c) < 32 and c not in "\n\r\t" for c in pages[page - 1]):
            findings.append(f"page_{page}_control_characters")
        if "\ufffd" in text or "(cid:" in text:
            findings.append(f"page_{page}_unmapped_characters")
    return findings


def checked_fixture(directory, fixture):
    base = directory.resolve(strict=True)
    path = (base / fixture["file"]).resolve(strict=True)
    if path.parent != base or not path.is_file():
        raise ValueError("fixture_path_outside_directory")
    if path.stat().st_size != fixture["bytes"] or path.stat().st_size > MAX_BYTES:
        raise ValueError("fixture_size_changed")
    raw = path.read_bytes()
    if not raw.startswith(b"%PDF-") or hashlib.sha256(raw).hexdigest() != fixture["sha256"]:
        raise ValueError("fixture_hash_or_type_changed")
    return path


def worker_env():
    # No inherited .env, API keys, proxies, Python hooks or cloud credentials.
    return {"PATH": "/usr/bin:/bin", "LANG": "en_US.UTF-8", "PYTHONUTF8": "1",
            "OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "2",
            "HF_HUB_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1",
            "TRANSFORMERS_OFFLINE": "1", "DO_NOT_TRACK": "1"}


def run_worker(python, engine, path, digest, cwd):
    started = time.monotonic()
    result = subprocess.run(
        [str(python), "-I", str(ROOT / "extract.py"), engine, str(path), digest],
        cwd=cwd, env=worker_env(), capture_output=True, text=True, timeout=40,
    )
    if result.returncode:
        # These are known public fixtures, not private app documents or credentials.
        raise RuntimeError((result.stdout or result.stderr)[-2000:])
    output = json.loads(result.stdout)
    if output.get("evidenceStatus") != "extracted_unverified" or output.get("remoteServices") is not False:
        raise ValueError("invalid_worker_boundary")
    output["workerWallMs"] = round((time.monotonic() - started) * 1000)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", type=Path, required=True)
    parser.add_argument("--python", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    python = args.python.absolute()
    manifest = json.loads((ROOT / "fixtures.json").read_text())
    fixtures = [(fixture, checked_fixture(args.fixtures, fixture)) for fixture in manifest["fixtures"]]
    # Keep raw extracted text outside version control; never overwrite a prior run.
    args.output.mkdir(parents=True, exist_ok=False)
    report = {"schemaVersion": 1, "observedAt": datetime.now(timezone.utc).isoformat(),
              "scope": "two_historical_born_digital_pdfs_not_current_news",
              "humanQualityScores": None, "paidCalls": 0, "results": []}
    with tempfile.TemporaryDirectory(prefix="apropos-document-eval-") as cwd:
        for fixture, path in fixtures:
            for engine in ENGINES:
                row = {"fixture": fixture["id"], "engine": engine,
                       "sourceUrl": fixture["sourceUrl"], "sourceDate": fixture["sourceDate"],
                       "pdfSha256": fixture["sha256"], "evidenceStatus": "extracted_unverified"}
                try:
                    data = run_worker(python, engine, path, fixture["sha256"], cwd)
                    findings = evaluate_pages(data["pages"], fixture)
                    row.update({"versions": data["versions"], "durationMs": data["durationMs"],
                                "workerWallMs": data["workerWallMs"],
                                "findings": findings, "checkStatus": "fail" if findings else "pass",
                                "pages": [{"page": n + 1, "characters": len(text),
                                           "textSha256": hashlib.sha256(text.encode()).hexdigest(),
                                           "sourceUrl": fixture["sourceUrl"] + f"#page={n + 1}",
                                           "nativeTextPresent": bool(text.strip()), "ocrPerformed": False}
                                          for n, text in enumerate(data["pages"])],
                                "itemProvenanceCount": len(data["itemProvenance"])})
                    (args.output / f"{fixture['id']}-{engine}.json").write_text(
                        json.dumps(data, ensure_ascii=False, indent=2) + "\n")
                except Exception as error:
                    row.update({"checkStatus": "error", "error": str(error)[:2000]})
                report["results"].append(row)
                print(json.dumps(row, ensure_ascii=False), flush=True)
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    # A comparison can legitimately expose parser defects. Nonzero never means
    # the article is rejected; this tool has no article/approval integration.
    return 1 if any(r["checkStatus"] != "pass" for r in report["results"]) else 0


if __name__ == "__main__":
    sys.exit(main())
