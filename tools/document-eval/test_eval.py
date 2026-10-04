import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from run import ROOT, checked_fixture, evaluate_pages, normalize, run_worker, worker_env


class DocumentEvaluationTests(unittest.TestCase):
    def test_manifest_preserves_historical_source_page_and_exact_binary(self):
        manifest = json.loads((ROOT / "fixtures.json").read_text())
        self.assertEqual(manifest["purpose"], "historical-format-fixtures-not-current-editorial-evidence")
        self.assertEqual(len(manifest["fixtures"]), 2)
        for fixture in manifest["fixtures"]:
            self.assertRegex(fixture["sha256"], r"^[a-f0-9]{64}$")
            self.assertTrue(fixture["sourceUrl"].startswith("https://"))
            self.assertLess(fixture["sourceDate"], "2020")
            self.assertEqual(fixture["pages"], 2)

    def test_reading_order_is_not_just_presence(self):
        fixture = {"pages": 1, "checks": [{"page": 1, "orderedAnchors": ["DA start", "DA end", "EN start", "EN end"]}]}
        self.assertEqual(evaluate_pages(["DA start rest DA end EN start rest EN end"], fixture), [])
        for text in ["DA start EN start DA end EN end", "DA start DA end EN end", "EN start EN end DA start DA end"]:
            self.assertIn("page_1_column_order_not_preserved", evaluate_pages([text], fixture))

    def test_detects_date_damage_and_missing_page(self):
        fixture = {"pages": 2, "checks": [{"page": 1, "anchors": ["12.10.2020"]}, {"page": 2, "anchors": ["ending"]}]}
        findings = evaluate_pages(["12.10.20 unrelated 20"], fixture)
        self.assertIn("page_count_mismatch", findings)
        self.assertIn("page_1_missing_anchor:12.10.2020", findings)
        self.assertIn("page_2_missing", findings)

    def test_rejects_character_corruption_without_repairing_evidence(self):
        fixture = {"pages": 1, "checks": [{"page": 1}]}
        findings = evaluate_pages(["word\x02\ufffd(cid:9)"], fixture)
        self.assertIn("page_1_control_characters", findings)
        self.assertIn("page_1_unmapped_characters", findings)

    def test_photograph_is_not_invented_ocr(self):
        fixture = {"pages": 1, "checks": [{"page": 1, "expectNoNativeText": True}]}
        self.assertEqual(evaluate_pages([""], fixture), [])
        self.assertIn("page_1_unexpected_native_text", evaluate_pages(["made-up description"], fixture))

    def test_only_normalizes_whitespace_and_apostrophe(self):
        self.assertEqual(normalize(" Name’s\n  text "), "Name's text")
        self.assertEqual(normalize("fault\x02 and 12.10.20 20"), "fault\x02 and 12.10.20 20")

    def test_fixture_hash_and_size_fail_closed(self):
        # Minimal bytes are a test of the envelope, not a fabricated parser pass.
        raw = b"%PDF-not-a-real-document"
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / "fixture.pdf").write_bytes(raw)
            fixture = {"file": "fixture.pdf", "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
            self.assertEqual(checked_fixture(directory, fixture), (directory / "fixture.pdf").resolve())
            with self.assertRaisesRegex(ValueError, "hash"):
                checked_fixture(directory, {**fixture, "sha256": "0" * 64})
            with self.assertRaisesRegex(ValueError, "size"):
                checked_fixture(directory, {**fixture, "bytes": len(raw) + 1})

    def test_fixture_path_cannot_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp) / "fixtures"
            directory.mkdir()
            outside = Path(temp) / "outside.pdf"
            outside.write_bytes(b"%PDF-test")
            (directory / "link.pdf").symlink_to(outside)
            for filename in ["../outside.pdf", "link.pdf"]:
                with self.assertRaisesRegex(ValueError, "outside_directory"):
                    checked_fixture(directory, {"file": filename})

    def test_child_does_not_inherit_credentials_or_python_hooks(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "must-not-leak", "HTTPS_PROXY": "must-not-leak", "PYTHONPATH": "must-not-load"}):
            env = worker_env()
            self.assertNotIn("OPENAI_API_KEY", env)
            self.assertNotIn("HTTPS_PROXY", env)
            self.assertNotIn("PYTHONPATH", env)
            self.assertEqual(env["HF_HUB_OFFLINE"], "1")

    def test_worker_network_audit_blocks_before_lookup(self):
        code = ("import runpy,sys,socket; ns=runpy.run_path(sys.argv[1]); "
                "sys.addaudithook(ns['prohibit_network']); socket.getaddrinfo('example.invalid',443)")
        result = subprocess.run([sys.executable, "-I", "-c", code, str(ROOT / "extract.py")],
                                env=worker_env(), capture_output=True, text=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("document_evaluation_network_disabled", result.stderr)

    def test_worker_enforces_timeout_and_unverified_result(self):
        with patch("run.subprocess.run") as call:
            call.return_value = subprocess.CompletedProcess([], 0, json.dumps({"evidenceStatus": "verified", "remoteServices": False}), "")
            with self.assertRaisesRegex(ValueError, "invalid_worker_boundary"):
                run_worker(Path("/python"), "pypdf", Path("/fixture"), "hash", "/tmp")
            self.assertEqual(call.call_args.kwargs["timeout"], 40)
            self.assertEqual(call.call_args.kwargs["env"], worker_env())
            self.assertIn("-I", call.call_args.args[0])

    def test_timed_out_or_broken_worker_does_not_become_partial_success(self):
        with patch("run.subprocess.run", side_effect=subprocess.TimeoutExpired("worker", 40)):
            with self.assertRaises(subprocess.TimeoutExpired):
                run_worker(Path("/python"), "pypdf", Path("/fixture"), "hash", "/tmp")
        with patch("run.subprocess.run", return_value=subprocess.CompletedProcess([], 1, "incomplete conversion", "")):
            with self.assertRaisesRegex(RuntimeError, "incomplete conversion"):
                run_worker(Path("/python"), "pypdf", Path("/fixture"), "hash", "/tmp")


if __name__ == "__main__":
    unittest.main()
