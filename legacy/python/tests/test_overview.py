import json
import tempfile
import unittest
from pathlib import Path

from chatgpt_wrapped.overview import compute_overview
from chatgpt_wrapped.parser import parse_export


class OverviewTest(unittest.TestCase):
    def test_compute_overview_counts_messages_text_assets_and_known_days(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            export_dir = Path(temp_dir) / "export"
            export_dir.mkdir()
            db_path = Path(temp_dir) / "wrapped.sqlite"

            self._write_json(
                export_dir / "conversations.json",
                [
                    {
                        "conversation_id": "conv-1",
                        "create_time": 1704067200,
                        "update_time": 1704240000,
                        "mapping": {
                            "u1": {
                                "id": "u1",
                                "message": {
                                    "id": "msg-user-1",
                                    "author": {"role": "user"},
                                    "create_time": 1704067200,
                                    "content": {
                                        "content_type": "multimodal_text",
                                        "parts": [
                                            "你好 world",
                                            {"asset_pointer": "image.dat", "size_bytes": 10},
                                            {"audio_asset_pointer": "voice.dat", "size_bytes": 20},
                                        ],
                                    },
                                    "metadata": {},
                                },
                            },
                            "a1": {
                                "id": "a1",
                                "message": {
                                    "id": "msg-assistant-1",
                                    "author": {"role": "assistant"},
                                    "create_time": 1704240000,
                                    "content": {"content_type": "text", "parts": ["回答 OK"]},
                                    "metadata": {},
                                },
                            },
                        },
                    },
                    {
                        "conversation_id": "conv-2",
                        "create_time": 1704153600,
                        "update_time": 1704153600,
                        "mapping": {
                            "u2": {
                                "id": "u2",
                                "message": {
                                    "id": "msg-user-2",
                                    "author": {"role": "user"},
                                    "create_time": 1704153600,
                                    "content": {"content_type": "text", "parts": ["第二 条"]},
                                    "metadata": {
                                        "attachments": [
                                            {
                                                "file_id": "file-doc",
                                                "file_name": "doc.pdf",
                                                "mime_type": "application/pdf",
                                            }
                                        ]
                                    },
                                },
                            }
                        },
                    },
                ],
            )
            self._write_json(
                export_dir / "conversation_asset_file_names.json",
                {"image.dat": "image.png", "voice.dat": "voice.m4a"},
            )
            self._write_json(
                export_dir / "library_files.json",
                [
                    {
                        "id": "lib-image",
                        "file_id": "image.dat",
                        "file_name": "image.png",
                        "mime_type": "image/png",
                        "file_size_bytes": 10,
                    },
                    {
                        "id": "lib-voice",
                        "file_id": "voice.dat",
                        "file_name": "voice.m4a",
                        "mime_type": "audio/mp4",
                        "file_size_bytes": 20,
                    },
                    {
                        "id": "lib-doc",
                        "file_id": "file-doc",
                        "file_name": "doc.pdf",
                        "mime_type": "application/pdf",
                        "file_size_bytes": 30,
                    },
                ],
            )

            parse_export(export_dir, db_path)
            overview = compute_overview(db_path)

            self.assertEqual(overview["conversation_count"], 2)
            self.assertEqual(overview["user_message_count"], 2)
            self.assertEqual(overview["assistant_message_count"], 1)
            self.assertEqual(overview["image_count"], 1)
            self.assertEqual(overview["file_count"], 1)
            self.assertEqual(overview["voice_count"], 1)
            self.assertEqual(overview["user_character_count"], 10)
            self.assertEqual(overview["assistant_character_count"], 4)
            self.assertEqual(overview["total_character_count"], 14)
            self.assertEqual(overview["known_days"], 3)
            self.assertEqual(overview["first_seen_at"], "2024-01-01T00:00:00+00:00")
            self.assertEqual(overview["last_seen_at"], "2024-01-03T00:00:00+00:00")

    def _write_json(self, path: Path, value: object) -> None:
        path.write_text(json.dumps(value), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
