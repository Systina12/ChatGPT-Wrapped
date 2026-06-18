from __future__ import annotations

import json
import mimetypes
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


JsonObject = dict[str, Any]


@dataclass(frozen=True)
class ParseResult:
    db_path: Path
    counts: dict[str, int]


def parse_export(export_dir: str | Path, out_db: str | Path) -> ParseResult:
    export_path = Path(export_dir)
    db_path = Path(out_db)
    if not export_path.exists() or not export_path.is_dir():
        raise ValueError(f"export_dir must be an existing directory: {export_path}")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    with sqlite3.connect(db_path) as conn:
        conn.execute("pragma foreign_keys = on")
        _init_schema(conn)

        parser = _ExportParser(export_path, conn)
        parser.parse()

        counts = {
            table: conn.execute(f"select count(*) from {table}").fetchone()[0]
            for table in (
                "source_files",
                "metadata",
                "conversations",
                "messages",
                "assets",
                "asset_name_map",
                "library_files",
                "feedback",
                "shares",
                "group_chats",
                "users",
                "settings",
                "parse_warnings",
            )
        }
        conn.commit()

    return ParseResult(db_path=db_path, counts=counts)


class _ExportParser:
    def __init__(self, export_path: Path, conn: sqlite3.Connection) -> None:
        self.export_path = export_path
        self.conn = conn
        self.asset_names: dict[str, str] = {}
        self.library_by_file_name: dict[str, JsonObject] = {}
        self.library_by_file_id: dict[str, JsonObject] = {}

    def parse(self) -> None:
        self._record_source_files()
        self._parse_manifest()
        self._parse_asset_name_map()
        self._parse_library_files()
        self._parse_conversations()
        self._parse_group_chats()
        self._parse_feedback()
        self._parse_shares()
        self._parse_user()
        self._parse_user_settings()

    def _record_source_files(self) -> None:
        for path in sorted(p for p in self.export_path.iterdir() if p.is_file()):
            rel = path.name
            self.conn.execute(
                """
                insert into source_files(path, kind, size_bytes)
                values (?, ?, ?)
                """,
                (rel, _classify_file(path), path.stat().st_size),
            )

    def _parse_manifest(self) -> None:
        data = self._load_optional_json("export_manifest.json")
        if data is None:
            return
        self.conn.execute(
            "insert into metadata(key, value_json) values (?, ?)",
            ("export_manifest", _json(data)),
        )

    def _parse_asset_name_map(self) -> None:
        data = self._load_optional_json("conversation_asset_file_names.json")
        if not isinstance(data, dict):
            if data is not None:
                self._warn("invalid_asset_name_map", "conversation_asset_file_names.json is not an object")
            return

        for local_path, display_name in data.items():
            if not isinstance(local_path, str):
                continue
            display = display_name if isinstance(display_name, str) else _json(display_name)
            self.asset_names[local_path] = display
            self.conn.execute(
                """
                insert or replace into asset_name_map(local_path, display_name, raw_json)
                values (?, ?, ?)
                """,
                (local_path, display, _json(display_name)),
            )

    def _parse_library_files(self) -> None:
        data = self._load_optional_json("library_files.json")
        if data is None:
            return
        if not isinstance(data, list):
            self._warn("invalid_library_files", "library_files.json is not an array")
            return

        for index, item in enumerate(data):
            if not isinstance(item, dict):
                self._warn("invalid_library_file", f"library_files[{index}] is not an object")
                continue

            row_id = _as_str(item.get("id")) or f"library-index-{index}"
            file_id = _as_str(item.get("file_id"))
            file_name = _as_str(item.get("file_name"))
            normalized_name = _as_str(item.get("normalized_name"))
            mime_type = _as_str(item.get("mime_type"))
            file_extension = _as_str(item.get("file_extension"))
            file_size = _as_int(item.get("file_size_bytes"))
            conversation_id = _as_str(item.get("initiating_conversation_id"))
            message_id = _as_str(item.get("origination_message_id"))

            if file_name:
                self.library_by_file_name[file_name] = item
            if normalized_name:
                self.library_by_file_name[normalized_name] = item
            if file_id:
                self.library_by_file_id[file_id] = item

            self.conn.execute(
                """
                insert or replace into library_files(
                    id, file_id, file_name, normalized_name, mime_type, file_extension,
                    file_size_bytes, state, initiating_conversation_id,
                    origination_message_id, origination_thread_id, raw_json
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row_id,
                    file_id,
                    file_name,
                    normalized_name,
                    mime_type,
                    file_extension,
                    file_size,
                    _as_str(item.get("state")),
                    conversation_id,
                    message_id,
                    _as_str(item.get("origination_thread_id")),
                    _json(item),
                ),
            )
            self._insert_asset(
                source="library_file",
                local_path=file_id or file_name or row_id,
                display_name=file_name or normalized_name,
                mime_type=mime_type,
                file_extension=file_extension,
                size_bytes=file_size,
                conversation_id=conversation_id,
                message_id=message_id,
                raw=item,
            )

    def _parse_conversations(self) -> None:
        files = self._conversation_files()
        if not files:
            self._warn("missing_conversations", "no conversations.json or conversations-*.json found")
            return

        for path in files:
            data = self._load_json(path)
            if not isinstance(data, list):
                self._warn("invalid_conversation_file", f"{path.name} is not an array")
                continue
            for index, conversation in enumerate(data):
                if not isinstance(conversation, dict):
                    self._warn("invalid_conversation", f"{path.name}[{index}] is not an object")
                    continue
                self._insert_conversation(conversation)
                self._insert_conversation_messages(conversation)

    def _parse_group_chats(self) -> None:
        data = self._load_optional_json("group_chats.json")
        if data is None:
            return
        if not isinstance(data, dict):
            self._warn("invalid_group_chats", "group_chats.json is not an object")
            return

        chats = data.get("chats")
        if not isinstance(chats, list):
            self._warn("invalid_group_chats", "group_chats.json does not contain a chats array")
            return

        for index, chat in enumerate(chats):
            if not isinstance(chat, dict):
                self._warn("invalid_group_chat", f"group_chats.chats[{index}] is not an object")
                continue
            chat_id = _as_str(chat.get("id")) or f"group-chat-{index}"
            self.conn.execute(
                """
                insert or replace into group_chats(
                    id, name, assistant_name, workspace_id, created_at, updated_at,
                    last_action_at, last_read_at, should_auto_respond, raw_json
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chat_id,
                    _as_str(chat.get("name")),
                    _as_str(chat.get("assistant_name")),
                    _as_str(chat.get("workspace_id")),
                    _as_str(chat.get("created_at")),
                    _as_str(chat.get("updated_at")),
                    _as_str(chat.get("last_action_at")),
                    _as_str(chat.get("last_read_at")),
                    _as_bool(chat.get("should_auto_respond")),
                    _json(chat),
                ),
            )
            self.conn.execute(
                """
                insert into conversations(
                    conversation_id, source, title, create_time_text, update_time_text, raw_json
                )
                values (?, 'group_chat', ?, ?, ?, ?)
                """,
                (
                    chat_id,
                    _as_str(chat.get("name")),
                    _as_str(chat.get("created_at")),
                    _as_str(chat.get("updated_at")),
                    _json(chat),
                ),
            )
            messages = chat.get("messages")
            if isinstance(messages, list):
                for message_index, message in enumerate(messages):
                    if isinstance(message, dict):
                        self._insert_group_message(chat_id, message, message_index)

    def _parse_feedback(self) -> None:
        data = self._load_optional_json("message_feedback.json")
        if data is None:
            return
        if not isinstance(data, list):
            self._warn("invalid_feedback", "message_feedback.json is not an array")
            return
        for index, item in enumerate(data):
            if not isinstance(item, dict):
                self._warn("invalid_feedback", f"message_feedback[{index}] is not an object")
                continue
            row_id = _as_str(item.get("id")) or f"feedback-{index}"
            self.conn.execute(
                """
                insert or replace into feedback(
                    id, conversation_id, message_id, rating, create_time, update_time, raw_json
                )
                values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row_id,
                    _as_str(item.get("conversation_id")),
                    _as_str(item.get("message_id")),
                    _as_str(item.get("rating")),
                    _as_number(item.get("create_time")),
                    _as_number(item.get("update_time")),
                    _json(item),
                ),
            )

    def _parse_shares(self) -> None:
        data = self._load_optional_json("shared_conversations.json")
        if data is None:
            return
        if not isinstance(data, list):
            self._warn("invalid_shares", "shared_conversations.json is not an array")
            return
        for index, item in enumerate(data):
            if not isinstance(item, dict):
                self._warn("invalid_share", f"shared_conversations[{index}] is not an object")
                continue
            row_id = _as_str(item.get("id")) or f"share-{index}"
            conversation_id = _as_str(item.get("conversation_id"))
            self.conn.execute(
                """
                insert or replace into shares(
                    id, conversation_id, title, is_anonymous, create_time, update_time, raw_json
                )
                values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row_id,
                    conversation_id,
                    _as_str(item.get("title")),
                    _as_bool(item.get("is_anonymous")),
                    _as_str(item.get("create_time")),
                    _as_str(item.get("update_time")),
                    _json(item),
                ),
            )
            if conversation_id:
                self.conn.execute(
                    "update conversations set is_shared = 1 where conversation_id = ?",
                    (conversation_id,),
                )

    def _parse_user(self) -> None:
        data = self._load_optional_json("user.json")
        if data is None:
            return
        if not isinstance(data, dict):
            self._warn("invalid_user", "user.json is not an object")
            return
        user_id = _as_str(data.get("id")) or "user"
        self.conn.execute(
            """
            insert or replace into users(
                id, email, phone_number, birth_year, chatgpt_plus_user, raw_json
            )
            values (?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                _as_str(data.get("email")),
                _as_str(data.get("phone_number")),
                _as_int(data.get("birth_year")),
                _as_bool(data.get("chatgpt_plus_user")),
                _json(data),
            ),
        )

    def _parse_user_settings(self) -> None:
        data = self._load_optional_json("user_settings.json")
        if data is None:
            return
        records = data if isinstance(data, list) else [data]
        for index, item in enumerate(records):
            if not isinstance(item, dict):
                self._warn("invalid_settings", f"user_settings[{index}] is not an object")
                continue
            self.conn.execute(
                """
                insert into settings(user_id, habitat_object_version, raw_json)
                values (?, ?, ?)
                """,
                (
                    _as_str(item.get("user_id")),
                    _as_str(item.get("habitat_object_version")),
                    _json(item),
                ),
            )

    def _insert_conversation(self, conversation: JsonObject) -> None:
        conversation_id = _conversation_id(conversation)
        self.conn.execute(
            """
            insert into conversations(
                conversation_id, source, title, create_time, update_time, current_node,
                default_model_slug, is_archived, is_starred, is_shared, raw_json
            )
            values (?, 'conversation', ?, ?, ?, ?, ?, ?, ?, coalesce(
                (select is_shared from conversations where conversation_id = ?), 0
            ), ?)
            """,
            (
                conversation_id,
                _as_str(conversation.get("title")),
                _as_number(conversation.get("create_time")),
                _as_number(conversation.get("update_time")),
                _as_str(conversation.get("current_node")),
                _as_str(conversation.get("default_model_slug")),
                _as_bool(conversation.get("is_archived")),
                _as_bool(conversation.get("is_starred")),
                conversation_id,
                _json(conversation),
            ),
        )

    def _insert_conversation_messages(self, conversation: JsonObject) -> None:
        conversation_id = _conversation_id(conversation)
        mapping = conversation.get("mapping")
        if mapping is None:
            return
        if not isinstance(mapping, dict):
            self._warn("invalid_mapping", f"conversation {conversation_id} mapping is not an object")
            return

        for node_id, node in mapping.items():
            if not isinstance(node, dict):
                continue
            message = node.get("message")
            if not isinstance(message, dict):
                continue
            message_id = _as_str(message.get("id")) or _as_str(node.get("id")) or str(node_id)
            content = message.get("content") if isinstance(message.get("content"), dict) else {}
            metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
            author = message.get("author") if isinstance(message.get("author"), dict) else {}
            self.conn.execute(
                """
                insert or replace into messages(
                    message_id, conversation_id, source, node_id, parent_node_id,
                    role, author_name, content_type, text, create_time, update_time,
                    model_slug, raw_json
                )
                values (?, ?, 'conversation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id,
                    conversation_id,
                    _as_str(node.get("id")) or str(node_id),
                    _as_str(node.get("parent")),
                    _as_str(author.get("role")),
                    _as_str(author.get("name")),
                    _as_str(content.get("content_type")),
                    _extract_text(content),
                    _as_number(message.get("create_time")),
                    _as_number(message.get("update_time")),
                    _as_str(metadata.get("model_slug")),
                    _json(message),
                ),
            )
            self._insert_message_assets(conversation_id, message_id, content, metadata)

    def _insert_group_message(self, chat_id: str, message: JsonObject, message_index: int) -> None:
        message_id = _as_str(message.get("id")) or f"{chat_id}-message-{message_index}"
        self.conn.execute(
            """
            insert or replace into messages(
                message_id, conversation_id, source, role, content_type, text,
                create_time_text, update_time_text, raw_json
            )
            values (?, ?, 'group_chat', ?, 'text', ?, ?, ?, ?)
            """,
            (
                message_id,
                chat_id,
                _as_str(message.get("role")),
                _as_str(message.get("text")),
                _as_str(message.get("created_at")),
                _as_str(message.get("updated_at")),
                _json(message),
            ),
        )
        attachments = message.get("attachments")
        if isinstance(attachments, list):
            for attachment in attachments:
                if isinstance(attachment, dict):
                    self._insert_attachment_asset(chat_id, message_id, attachment)

    def _insert_message_assets(
        self,
        conversation_id: str,
        message_id: str,
        content: JsonObject,
        metadata: JsonObject,
    ) -> None:
        parts = content.get("parts")
        if isinstance(parts, list):
            for part in parts:
                if isinstance(part, dict):
                    self._insert_part_asset(conversation_id, message_id, part)

        attachments = metadata.get("attachments")
        if isinstance(attachments, list):
            for attachment in attachments:
                if isinstance(attachment, dict):
                    self._insert_attachment_asset(conversation_id, message_id, attachment)

    def _insert_part_asset(self, conversation_id: str, message_id: str, part: JsonObject) -> None:
        for key in ("asset_pointer", "audio_asset_pointer", "video_container_asset_pointer"):
            local_path = _as_str(part.get(key))
            if local_path:
                display_name = self.asset_names.get(local_path)
                library = self._library_for_asset(local_path, display_name)
                self._insert_asset(
                    source="message_part",
                    local_path=local_path,
                    display_name=display_name,
                    mime_type=_library_value(library, "mime_type") or _guess_mime(local_path),
                    file_extension=_library_value(library, "file_extension"),
                    size_bytes=_as_int(part.get("size_bytes")) or _library_int(library, "file_size_bytes"),
                    width=_as_int(part.get("width")),
                    height=_as_int(part.get("height")),
                    conversation_id=conversation_id,
                    message_id=message_id,
                    raw=part,
                )
        frames = part.get("frames_asset_pointers")
        if isinstance(frames, list):
            for frame in frames:
                local_path = _as_str(frame)
                if local_path:
                    self._insert_asset(
                        source="message_part_frame",
                        local_path=local_path,
                        display_name=self.asset_names.get(local_path),
                        mime_type=_guess_mime(local_path),
                        conversation_id=conversation_id,
                        message_id=message_id,
                        raw=part,
                    )

    def _insert_attachment_asset(self, conversation_id: str, message_id: str, attachment: JsonObject) -> None:
        local_path = (
            _as_str(attachment.get("asset_pointer"))
            or _as_str(attachment.get("file_id"))
            or _as_str(attachment.get("id"))
            or _as_str(attachment.get("name"))
            or _as_str(attachment.get("file_name"))
        )
        if not local_path:
            return
        display_name = (
            _as_str(attachment.get("file_name"))
            or _as_str(attachment.get("name"))
            or self.asset_names.get(local_path)
        )
        library = self._library_for_asset(local_path, display_name)
        self._insert_asset(
            source="attachment",
            local_path=local_path,
            display_name=display_name,
            mime_type=_as_str(attachment.get("mime_type")) or _library_value(library, "mime_type"),
            file_extension=_library_value(library, "file_extension"),
            size_bytes=_as_int(attachment.get("size_bytes")) or _library_int(library, "file_size_bytes"),
            conversation_id=conversation_id,
            message_id=message_id,
            raw=attachment,
        )

    def _insert_asset(
        self,
        *,
        source: str,
        local_path: str | None,
        display_name: str | None = None,
        mime_type: str | None = None,
        file_extension: str | None = None,
        size_bytes: int | None = None,
        width: int | None = None,
        height: int | None = None,
        conversation_id: str | None = None,
        message_id: str | None = None,
        raw: Any = None,
    ) -> None:
        if not local_path:
            return
        self.conn.execute(
            """
            insert into assets(
                source, local_path, display_name, mime_type, file_extension, size_bytes,
                width, height, conversation_id, message_id, raw_json
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source,
                local_path,
                display_name,
                mime_type,
                file_extension,
                size_bytes,
                width,
                height,
                conversation_id,
                message_id,
                _json(raw),
            ),
        )

    def _library_for_asset(self, local_path: str, display_name: str | None) -> JsonObject | None:
        return (
            self.library_by_file_name.get(local_path)
            or self.library_by_file_id.get(local_path)
            or (self.library_by_file_name.get(display_name) if display_name else None)
        )

    def _conversation_files(self) -> list[Path]:
        single = self.export_path / "conversations.json"
        shards = sorted(self.export_path.glob("conversations-*.json"))
        if single.exists():
            return [single] + shards
        return shards

    def _load_optional_json(self, name: str) -> Any:
        path = self.export_path / name
        if not path.exists():
            return None
        return self._load_json(path)

    def _load_json(self, path: Path) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            self._warn("invalid_json", f"{path.name}: {exc}")
            return None

    def _warn(self, code: str, message: str, raw: Any = None) -> None:
        self.conn.execute(
            "insert into parse_warnings(code, message, raw_json) values (?, ?, ?)",
            (code, message, _json(raw)),
        )


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        create table source_files (
            path text primary key,
            kind text not null,
            size_bytes integer
        );

        create table metadata (
            key text primary key,
            value_json text not null
        );

        create table conversations (
            id integer primary key autoincrement,
            conversation_id text not null,
            source text not null,
            title text,
            create_time real,
            update_time real,
            create_time_text text,
            update_time_text text,
            current_node text,
            default_model_slug text,
            is_archived integer,
            is_starred integer,
            is_shared integer default 0,
            raw_json text not null
        );

        create table messages (
            message_id text primary key,
            conversation_id text,
            source text not null,
            node_id text,
            parent_node_id text,
            role text,
            author_name text,
            content_type text,
            text text,
            create_time real,
            update_time real,
            create_time_text text,
            update_time_text text,
            model_slug text,
            raw_json text not null
        );

        create table assets (
            id integer primary key autoincrement,
            source text not null,
            local_path text not null,
            display_name text,
            mime_type text,
            file_extension text,
            size_bytes integer,
            width integer,
            height integer,
            conversation_id text,
            message_id text,
            raw_json text
        );

        create table asset_name_map (
            local_path text primary key,
            display_name text,
            raw_json text
        );

        create table library_files (
            id text primary key,
            file_id text,
            file_name text,
            normalized_name text,
            mime_type text,
            file_extension text,
            file_size_bytes integer,
            state text,
            initiating_conversation_id text,
            origination_message_id text,
            origination_thread_id text,
            raw_json text not null
        );

        create table feedback (
            id text primary key,
            conversation_id text,
            message_id text,
            rating text,
            create_time real,
            update_time real,
            raw_json text not null
        );

        create table shares (
            id text primary key,
            conversation_id text,
            title text,
            is_anonymous integer,
            create_time text,
            update_time text,
            raw_json text not null
        );

        create table group_chats (
            id text primary key,
            name text,
            assistant_name text,
            workspace_id text,
            created_at text,
            updated_at text,
            last_action_at text,
            last_read_at text,
            should_auto_respond integer,
            raw_json text not null
        );

        create table users (
            id text primary key,
            email text,
            phone_number text,
            birth_year integer,
            chatgpt_plus_user integer,
            raw_json text not null
        );

        create table settings (
            id integer primary key autoincrement,
            user_id text,
            habitat_object_version text,
            raw_json text not null
        );

        create table parse_warnings (
            id integer primary key autoincrement,
            code text not null,
            message text not null,
            raw_json text
        );

        create index idx_messages_conversation on messages(conversation_id);
        create index idx_conversations_conversation_id on conversations(conversation_id);
        create index idx_conversations_source on conversations(source);
        create index idx_assets_conversation on assets(conversation_id);
        create index idx_assets_message on assets(message_id);
        create index idx_feedback_conversation on feedback(conversation_id);
        """
    )


def _conversation_id(conversation: JsonObject) -> str:
    return (
        _as_str(conversation.get("conversation_id"))
        or _as_str(conversation.get("id"))
        or "unknown-conversation"
    )


def _extract_text(content: JsonObject) -> str | None:
    values: list[str] = []
    parts = content.get("parts")
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, str):
                values.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                values.append(part["text"])
    for key in ("text", "summary", "content"):
        value = content.get(key)
        if isinstance(value, str):
            values.append(value)
    return "\n".join(value for value in values if value) or None


def _classify_file(path: Path) -> str:
    name = path.name
    if name == "chat.html":
        return "chat_html"
    if name == "export_manifest.json":
        return "manifest"
    if name == "conversation_asset_file_names.json":
        return "asset_name_map"
    if name == "library_files.json":
        return "library_files"
    if name == "message_feedback.json":
        return "feedback"
    if name == "shared_conversations.json":
        return "shares"
    if name == "group_chats.json":
        return "group_chats"
    if name == "user.json":
        return "user"
    if name == "user_settings.json":
        return "settings"
    if name == "conversations.json" or (name.startswith("conversations-") and name.endswith(".json")):
        return "conversations"
    if name.endswith(".dat"):
        return "asset"
    return "unknown"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _as_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    return None


def _as_number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _as_int(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _as_bool(value: Any) -> int | None:
    if isinstance(value, bool):
        return 1 if value else 0
    return None


def _library_value(library: JsonObject | None, key: str) -> str | None:
    if not library:
        return None
    return _as_str(library.get(key))


def _library_int(library: JsonObject | None, key: str) -> int | None:
    if not library:
        return None
    return _as_int(library.get(key))


def _guess_mime(local_path: str) -> str | None:
    guess, _ = mimetypes.guess_type(local_path)
    return guess
