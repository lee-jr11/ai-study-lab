import os
import json
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app import (
    MAX_PPTX_UNCOMPRESSED_BYTES,
    _cooldown_for,
    _cleanup_secret,
    _iter_shape_text,
    app,
    make_cleanup_ticket,
    validate_pptx_archive,
    verify_cleanup_ticket,
    validate_generated_payload,
)


class UploadValidationTests(unittest.TestCase):
    @patch("app.zipfile.ZipFile")
    def test_oversized_pptx_is_rejected_before_decompression(self, zip_file):
        archive = zip_file.return_value.__enter__.return_value
        archive.infolist.return_value = [
            SimpleNamespace(file_size=MAX_PPTX_UNCOMPRESSED_BYTES + 1)
        ]

        result = validate_pptx_archive("oversized.pptx")

        self.assertIn("too much data", result)
        archive.testzip.assert_not_called()

    def test_pptx_text_includes_tables_and_grouped_shapes(self):
        cells = [
            SimpleNamespace(text="Metric"),
            SimpleNamespace(text="Value"),
        ]
        table = SimpleNamespace(rows=[SimpleNamespace(cells=cells)])
        table_shape = SimpleNamespace(has_table=True, table=table)
        grouped = SimpleNamespace(
            has_table=False,
            shapes=[SimpleNamespace(has_table=False, text="Grouped note")],
        )
        ordinary = SimpleNamespace(has_table=False, text="Slide title")

        self.assertEqual(
            ["Metric", "Value"],
            list(_iter_shape_text(table_shape)),
        )
        self.assertEqual(["Grouped note"], list(_iter_shape_text(grouped)))
        self.assertEqual(["Slide title"], list(_iter_shape_text(ordinary)))


class SessionTicketTests(unittest.TestCase):
    def test_local_cleanup_secret_is_created_once_and_reused(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            secret_path = os.path.join(temp_dir, ".cleanup_secret")
            with patch.dict(os.environ, {"CLEANUP_SECRET": ""}), patch(
                "app._CLEANUP_SECRET_PATH", secret_path
            ), patch("app._cleanup_secret_cache", None):
                first = _cleanup_secret()
                second = _cleanup_secret()

        self.assertEqual(64, len(first))
        self.assertEqual(first, second)

    def test_ticket_is_bound_to_user_and_file(self):
        with patch.dict(
            os.environ,
            {"CLEANUP_SECRET": "test-only-secret-0123456789abcdef"},
        ):
            ticket = make_cleanup_ticket("firebase-user", "files/lecture-1")
            self.assertEqual(
                "firebase-user",
                verify_cleanup_ticket(
                    "files/lecture-1", ticket, expected_uid="firebase-user"
                ),
            )
            self.assertIsNone(
                verify_cleanup_ticket(
                    "files/lecture-1", ticket, expected_uid="different-user"
                )
            )
            self.assertIsNone(verify_cleanup_ticket("files/other", ticket))


class ModelHealthTests(unittest.TestCase):
    def test_request_errors_do_not_cool_down_models(self):
        self.assertIsNone(_cooldown_for(RuntimeError("400 invalid argument")))

    def test_quota_and_outage_errors_do_cool_down_models(self):
        self.assertEqual(6 * 3600, _cooldown_for(RuntimeError("429 quota exceeded")))
        self.assertEqual(120, _cooldown_for(RuntimeError("503 unavailable")))


class GeneratedContentTests(unittest.TestCase):
    def test_duplicate_answer_choices_are_discarded(self):
        raw = json.dumps({'quiz': [
            {'question': 'Ambiguous', 'options': ['Same', 'Same'], 'answer': 'Same'},
            {'question': 'Valid', 'options': ['One', 'Two'], 'answer': 'One'},
        ]})
        items, error = validate_generated_payload(raw, 'quiz', 2)
        self.assertIsNone(error)
        self.assertEqual(['Valid'], [item['question'] for item in items])

    def test_no_valid_choices_returns_a_recoverable_error(self):
        raw = json.dumps({'quiz': [
            {'question': 'Ambiguous', 'options': ['Same', 'Same'], 'answer': 'Same'},
        ]})
        items, error = validate_generated_payload(raw, 'quiz', 1)
        self.assertIsNone(items)
        self.assertIn('valid content', error)


class RouteSmokeTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_index_and_auth_boundary(self):
        response = self.client.get("/")
        self.assertEqual(200, response.status_code)
        self.assertEqual("nosniff", response.headers["X-Content-Type-Options"])
        self.assertEqual("DENY", response.headers["X-Frame-Options"])
        self.assertEqual(
            "none", response.headers["X-Permitted-Cross-Domain-Policies"]
        )
        self.assertEqual(
            "same-origin-allow-popups",
            response.headers["Cross-Origin-Opener-Policy"],
        )
        self.assertEqual(
            "same-origin", response.headers["Cross-Origin-Resource-Policy"]
        )
        self.assertEqual("no-store", response.headers["Cache-Control"])
        self.assertEqual("0", response.headers["X-XSS-Protection"])
        self.assertIn(
            "object-src 'none'", response.headers["Content-Security-Policy"]
        )
        self.assertIn(
            "frame-ancestors 'none'", response.headers["Content-Security-Policy"]
        )
        response = self.client.post("/generate")
        self.assertEqual(401, response.status_code)

    def test_https_responses_set_hsts(self):
        response = self.client.get("/", base_url="https://localhost")
        self.assertIn("max-age=31536000", response.headers["Strict-Transport-Security"])

    def test_debug_model_endpoint_is_removed(self):
        self.assertEqual(404, self.client.get("/models").status_code)

    def test_local_frontend_assets_are_linked_and_served_with_browser_mime_types(self):
        from html.parser import HTMLParser

        assets = []

        class AssetParser(HTMLParser):
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                url = attrs.get('src') if tag == 'script' else attrs.get('href') if tag == 'link' else None
                if url and url.startswith('/static/'):
                    assets.append(url)

        AssetParser().feed(self.client.get('/').get_data(as_text=True))
        self.assertEqual(3, len(assets))
        for url in assets:
            with self.subTest(url=url):
                response = self.client.get(url)
                try:
                    self.assertEqual(200, response.status_code)
                    self.assertIn(response.mimetype, {'text/css', 'text/javascript', 'application/javascript'})
                finally:
                    response.close()

    def test_invalid_cleanup_ticket_is_a_noop(self):
        response = self.client.post(
            "/cleanup", data={"file_id": "files/example", "ct": "invalid"}
        )
        self.assertEqual(200, response.status_code)
        self.assertEqual({"status": "ok"}, response.get_json())
        self.assertEqual("no-store", response.headers["Cache-Control"])

    @patch('app.get_gemini_client')
    @patch('app.verify_firebase_id_token', return_value='history-limit-user')
    def test_oversized_history_is_rejected_before_calling_ai(self, verify, get_client):
        response = self.client.post('/chat', headers={'Authorization': 'Bearer test'}, data={
            'file_id': 'files/example', 'ct': 'unused', 'message': 'Question', 'history': 'x' * 100_001,
        })
        self.assertEqual(400, response.status_code)
        self.assertIn('too large', response.get_json()['error'])
        get_client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
