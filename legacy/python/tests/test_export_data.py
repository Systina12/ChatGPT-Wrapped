import json
import tempfile
import unittest
from pathlib import Path

from chatgpt_wrapped.parser import parse_export
from chatgpt_wrapped.stats import build_web_data


class ExportDataTest(unittest.TestCase):
    def test_build_web_data_contains_web_modules_and_raw_excerpts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            export_dir = Path(temp_dir) / "export"
            export_dir.mkdir()
            db_path = Path(temp_dir) / "wrapped.sqlite"
            self._write_json(
                export_dir / "conversations.json",
                [
                    {
                        "conversation_id": "conv-1",
                        "title": "Useful synthetic chat",
                        "create_time": 1704067200,
                        "mapping": {
                            "u1": {
                                "id": "u1",
                                "message": {
                                    "id": "user-msg",
                                    "author": {"role": "user"},
                                    "create_time": 1704067200,
                                    "content": {"content_type": "text", "parts": ["请帮我分析这个链接 https://example.test"]},
                                    "metadata": {},
                                },
                            },
                            "a1": {
                                "id": "a1",
                                "message": {
                                    "id": "assistant-msg",
                                    "author": {"role": "assistant"},
                                    "create_time": 1704067300,
                                    "content": {"content_type": "text", "parts": ["可以，我会先整理重点。"]},
                                    "metadata": {"model_slug": "gpt-test"},
                                },
                            },
                        },
                    }
                ],
            )

            parse_export(export_dir, db_path)
            data = build_web_data(db_path)

            self.assertEqual(
                set(data),
                {
                    "meta",
                    "overview",
                    "timeline",
                    "activity",
                    "conversations",
                    "messages",
                    "models",
                    "assets",
                    "language",
                    "frequent_words",
                    "quality",
                    "highlights",
                },
            )
            self.assertEqual(data["overview"]["conversation_count"], 1)
            self.assertEqual(data["messages"]["url_count"], 1)
            self.assertEqual(data["models"]["most_used_model"]["model"], "gpt-test")
            self.assertEqual(data["highlights"]["first_conversation"]["title"], "Useful synthetic chat")
            self.assertIn("https://example.test", data["highlights"]["longest_user_message"]["text_excerpt"])

    def _write_json(self, path: Path, value: object) -> None:
        path.write_text(json.dumps(value), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
