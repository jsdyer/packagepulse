"""Deterministic UI checks; real API transport is checked separately during development."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import shutil
import tempfile
import threading
from urllib.parse import unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    config = json.loads((ROOT / "web/config.json").read_text())
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "packagepulse")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                def npm(route):
                    name = unquote(route.request.url.split("registry.npmjs.org/")[1])
                    data = {"name": name, "description": '<img src=x onerror="alert(1)"> plain metadata',
                            "maintainers": [{"name": "publisher"}], "dist-tags": {"latest": "1.0.0"},
                            "time": {"created": "2020-01-01T00:00:00Z", "1.0.0": "2026-11-01T00:00:00Z", "2.0.0-beta.1": "2026-11-10T00:00:00Z"},
                            "versions": {"1.0.0": {"dependencies": {"dep-one": "^1"}, "license": "MIT"}, "2.0.0-beta.1": {"dependencies": {}}}}
                    route.fulfill(status=200, json=data, headers={"Access-Control-Allow-Origin": "*"})
                page.route("https://registry.npmjs.org/**", npm)
                page.route("https://data.jsdelivr.com/**", lambda route: route.fulfill(status=200, json={"hits": {"total": 0, "dates": {"2026-11-01": 0}}}, headers={"Access-Control-Allow-Origin": "*"}))
                page.goto(f"http://127.0.0.1:{server.server_port}/packagepulse/")
                page.locator(".package-card").first.wait_for()
                assert page.locator(".package-card").count() == len(config["defaultPackages"])
                assert "retained" in page.locator("#status").inner_text().lower()
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.locator("#package-a").fill("brand-new-package")
                page.locator("#package-b").fill("@example/not-in-config")
                page.locator("#lookup").click()
                page.locator('.package-card[data-package="brand-new-package"]').wait_for()
                assert page.locator('.package-card[data-package="@example/not-in-config"]').count() == 1
                assert page.locator("img").count() == 0
                assert "2 of 2" in page.locator("#status").inner_text()
                assert page.locator("#dependency-table").inner_text().count("dep-one") == 1
                page.get_by_label("Release channel for brand-new-package", exact=True).select_option("prerelease")
                assert page.locator('.package-card[data-package="brand-new-package"] .release-list details').count() == 1
                page.locator('.package-card[data-package="brand-new-package"] .release-list summary').click()
                assert "None declared" in page.locator('.package-card[data-package="brand-new-package"] .release-list').inner_text()
                with page.expect_download() as info:
                    page.locator("#export-csv").click()
                assert info.value.suggested_filename.endswith(".csv")
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                assert not errors, errors
                browser.close()
            print("Browser checks passed: dynamic/scoped lookup, comparison, safe text, filters, export and mobile layout")
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
