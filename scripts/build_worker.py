#!/usr/bin/env python3
"""Build optional Workers assets without changing the GitHub Pages output."""
import json
import shutil
from build import ROOT, build


def build_worker(root=ROOT):
    build(root)
    output = root / "dist-worker"
    if output.is_symlink():
        raise ValueError("dist-worker must not be a symlink")
    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(root / "dist", output)
    path = output / "config.json"
    config = json.loads(path.read_text())
    config["apiBase"] = "/api"
    path.write_text(json.dumps(config, indent=2) + "\n")
    index = output / "index.html"
    page = index.read_text()
    # The hub counter is a root-relative file available only on CoolCode.
    page = page.replace('<script defer src="/assets/tool-metrics.js" referrerpolicy="no-referrer"></script>', '')
    index.write_text(page)
    print("Built dist-worker/ with a same-origin package API")


if __name__ == "__main__":
    build_worker()
