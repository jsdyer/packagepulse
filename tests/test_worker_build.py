import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build import ROOT
from build_worker import build_worker


class WorkerBuildTests(unittest.TestCase):
    def test_worker_build_preserves_static_output_and_sets_same_origin_api(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / "web", root / "web")
            for name in ["tool.json", "README.md"]:
                shutil.copyfile(ROOT / name, root / name)
            build_worker(root)
            self.assertIsNone(json.loads((root / "dist/config.json").read_text())["apiBase"])
            self.assertEqual(json.loads((root / "dist-worker/config.json").read_text())["apiBase"], "/api")
            self.assertNotIn('/assets/tool-metrics.js', (root / "dist-worker/index.html").read_text())
            self.assertIn('/assets/tool-metrics.js', (root / "dist/index.html").read_text())
            self.assertFalse((root / "dist-worker/worker/index.mjs").exists())
