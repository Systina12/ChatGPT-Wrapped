import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from chatgpt_wrapped.parser import parse_export


class ParserTest(unittest.TestCase):
    def test_parse_export_loads_all_supported_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            export_dir = Path(temp_dir) / "export"
            export_dir.mkdir()
            out_db = Path(temp_dir) / "wrapped.sqlite"

            self._write_json(
                export_dir / "conversations-000.json",
                [
                    {
                        "id": "conv-1",
                        "conversation_id": "conv-1",
                        "title": "Synthetic title",
                        "create_time": 10,
                        "update_time": 20,
                        "current_node": "assistant-node",
                        "default_model_slug": "gpt-test",
                        "is_archived": False,
                        "is_starred": True,
                        "mapping": {
                            "root": {
                                "id": "root",
                                "parent": None,
                                "children": ["user-node"],
                                "message": None,
                            },
                            "user-node": {
                                "id": "user-node",
                                "parent": "root",
                                "children": ["assistant-node"],
                                "message": {
                                    "id": "msg-user",
                                    "author": {"role": "user", "name": None},
                                    "create_time": 11,
                                    "content": {
                                        "content_type": "multimodal_text",
                                        "parts": [
                                            "hello",
                                            {
                                                "content_type": "image_asset_pointer",
                                                "asset_pointer": "file-test.dat",
                                                "width": 640,
                                                "height": 480,
                                                "size_bytes": 12,
                                            },
                                        ],
                                    },
                                    "metadata": {"attachments": []},
                                },
                            },
                            "assistant-node": {
                                "id": "assistant-node",
                                "parent": "user-node",
                                "children": [],
                                "message": {
                                    "id": "msg-assistant",
                                    "author": {"role": "assistant", "name": None},
                                    "create_time": 12,
                                    "content": {
                                        "content_type": "text",
                                        "parts": ["world"],
                                    },
                                    "metadata": {"model_slug": "gpt-test"},
                                },
                            },
                        },
                    }
                ],
            )
            self._write_json(
                export_dir / "conversation_asset_file_names.json",
                {"file-test.dat": "original-name.png"},
            )
            self._write_json(
                export_dir / "library_files.json",
                [
                    {
                        "id": "lib-1",
                        "file_id": "file-test",
                        "file_name": "original-name.png",
                        "normalized_name": "original-name.png",
                        "mime_type": "image/png",
                        "file_extension": "png",
                        "file_size_bytes": 12,
                        "initiating_conversation_id": "conv-1",
                        "origination_message_id": "msg-user",
                    }
                ],
            )
            self._write_json(
                export_dir / "message_feedback.json",
                [
                    {
                        "id": "feedback-1",
                        "conversation_id": "conv-1",
                        "message_id": "msg-assistant",
                        "rating": "thumbs_up",
                        "create_time": 13,
                    }
                ],
            )
            self._write_json(
                export_dir / "shared_conversations.json",
                [{"id": "share-1", "conversation_id": "conv-1", "title": "Shared"}],
            )
            self._write_json(
                export_dir / "group_chats.json",
                {
                    "chats": [
                        {
                            "id": "group-1",
                            "name": "Synthetic group",
                            "messages": [
                                {
                                    "id": "group-msg-1",
                                    "role": "user",
                                    "text": "group hello",
                                    "attachments": [],
                                    "created_at": "2026-01-01T00:00:00Z",
                                }
                            ],
                        }
                    ]
                },
            )
            self._write_json(export_dir / "user.json", {"id": "user-1", "email": "u@example.test"})
            self._write_json(export_dir / "user_settings.json", [{"user_id": "user-1", "settings": {}}])
            self._write_json(
                export_dir / "export_manifest.json",
                {"version": 1, "export_files": [{"path": "conversations-000.json", "size_bytes": 1}]},
            )
            (export_dir / "file-test.dat").write_bytes(b"fake image")

            result = parse_export(export_dir, out_db)

            self.assertEqual(result.counts["conversations"], 2)
            self.assertEqual(result.counts["messages"], 3)
            self.assertEqual(result.counts["assets"], 2)
            self.assertEqual(result.counts["feedback"], 1)
            self.assertEqual(result.counts["shares"], 1)
            self.assertEqual(result.counts["library_files"], 1)
            self.assertEqual(result.counts["users"], 1)
            self.assertEqual(result.counts["settings"], 1)

            with sqlite3.connect(out_db) as conn:
                message_texts = {
                    row[0]: row[1]
                    for row in conn.execute("select message_id, text from messages")
                }
                self.assertEqual(message_texts["msg-user"], "hello")
                self.assertEqual(message_texts["msg-assistant"], "world")
                self.assertEqual(message_texts["group-msg-1"], "group hello")

                assets = list(
                    conn.execute(
                        "select local_path, display_name, mime_type, conversation_id, message_id "
                        "from assets order by local_path, message_id"
                    )
                )
                self.assertIn(("file-test.dat", "original-name.png", "image/png", "conv-1", "msg-user"), assets)

                raw = conn.execute(
                    "select raw_json from conversations where conversation_id = 'conv-1'"
                ).fetchone()[0]
                self.assertEqual(json.loads(raw)["conversation_id"], "conv-1")

    def test_parse_export_supports_single_conversations_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            export_dir = Path(temp_dir) / "export"
            export_dir.mkdir()
            out_db = Path(temp_dir) / "wrapped.sqlite"
            self._write_json(
                export_dir / "conversations.json",
                [{"conversation_id": "single", "mapping": {}}],
            )

            result = parse_export(export_dir, out_db)

            self.assertEqual(result.counts["conversations"], 1)

    def _write_json(self, path: Path, value: object) -> None:
        path.write_text(json.dumps(value), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
