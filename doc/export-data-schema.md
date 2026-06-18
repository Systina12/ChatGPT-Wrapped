# ChatGPT Export Data Schema

本文档说明 OpenAI ChatGPT 官方导出数据包中常见文件的用途、schema 和解析注意事项。文档是通用说明，不依赖任何具体用户导出数据，也不包含真实文件的统计、内容或样本特征。

## Directory Layout

官方导出解压后通常是一个目录，里面包含结构化 JSON、一个 HTML 查看页，以及若干附件文件。

```text
<export-directory>/
  chat.html
  conversations.json 或 conversations-000.json ...
  export_manifest.json
  conversation_asset_file_names.json
  library_files.json
  message_feedback.json
  shared_conversations.json
  group_chats.json
  user.json
  user_settings.json
  file-*.dat / file_*.dat
```

不同时间、不同账号、不同产品功能开关导出的文件可能不完全一致。解析器应把除 conversation 主文件以外的文件视为可选输入。

## `conversations.json` / `conversations-*.json`

用途：普通 ChatGPT 会话的主数据源，包含会话元数据、消息图、消息角色、正文、多模态资源引用、模型元数据等。

导出较小时可能是单个 `conversations.json`；导出较大时可能被拆成 `conversations-000.json`、`conversations-001.json` 等分片。单文件和分片文件的元素 schema 通常一致。

```ts
type ConversationFile = Conversation[];

interface Conversation {
  id?: string;
  conversation_id?: string;
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  current_node?: string | null;
  mapping?: Record<string, ConversationNode> | null;
  default_model_slug?: string | null;
  conversation_template_id?: string | null;
  memory_scope?: string | null;
  plugin_ids?: string[] | null;
  pinned_time?: number | null;
  voice?: unknown | null;
  is_archived?: boolean;
  is_do_not_remember?: boolean;
  is_read_only?: boolean;
  is_starred?: boolean;
  is_study_mode?: boolean;
}
```

`mapping` 是消息节点图，不是简单数组。key 通常是 node id，value 是节点。

```ts
interface ConversationNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: Message | null;
}

interface Message {
  id?: string;
  author?: MessageAuthor;
  create_time?: number | null;
  update_time?: number | null;
  content?: MessageContent;
  metadata?: MessageMetadata;
  status?: string;
  end_turn?: boolean | null;
  weight?: number;
  recipient?: string;
  channel?: string | null;
}

interface MessageAuthor {
  role?: "system" | "user" | "assistant" | "tool" | string;
  name?: string | null;
  metadata?: Record<string, unknown>;
}
```

消息内容：

```ts
interface MessageContent {
  content_type?: string;
  parts?: Array<string | MessagePart>;
  text?: string;
  result?: unknown;
  summary?: string;
  thoughts?: unknown[];
  source_analysis_msg_id?: string;
  [key: string]: unknown;
}

interface MessagePart {
  content_type?: string;
  text?: string;
  asset_pointer?: string;
  audio_asset_pointer?: string;
  video_container_asset_pointer?: string;
  frames_asset_pointers?: string[];
  width?: number;
  height?: number;
  size_bytes?: number;
  format?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
```

常见 `content_type`：

- `text`：普通文本消息。
- `multimodal_text`：包含文本和附件/图片/音频/视频引用的消息。
- `code` 或 tool 相关类型：工具调用、代码解释器或执行结果相关内容。
- `reasoning_recap`、`thoughts`：部分导出中可能出现的助手内部/摘要类内容。

消息元数据：

```ts
interface MessageMetadata {
  model_slug?: string;
  parent_id?: string;
  response_message_id?: string;
  attachments?: unknown[];
  content_references?: unknown[];
  code_blocks?: unknown[];
  search_result_groups?: unknown[];
  citations?: unknown[];
  finish_details?: unknown;
  timestamp_?: string;
  message_type?: string;
  is_complete?: boolean;
  request_id?: string;
  image_prompt_id?: string;
  image_results?: unknown[];
  image_send_uuid?: string;
  serialization_metadata?: unknown;
  conversation_context_citation_metadata?: unknown;
  [key: string]: unknown;
}
```

解析注意事项：

- `mapping` 可能为 `null`，节点的 `message` 也可能为 `null`。
- 不要假设 `mapping` 的 key 顺序就是消息顺序。需要顺序时，可以按 `create_time` 排序；需要分支语义时，应从 `current_node` 沿 `parent` 回溯，或显式遍历节点图。
- `parts` 里可能既有字符串，也有对象。
- 模型信息可能在 conversation 的 `default_model_slug`，也可能在 message 的 `metadata.model_slug`。
- 字段会随 ChatGPT 产品功能变化而增加，解析器应保留未知字段或至少忽略未知字段。

## `chat.html`

用途：官方导出的静态聊天查看页面，供用户在浏览器中查看导出记录。

schema：HTML 文档，不建议作为主解析源。

解析注意事项：

- 结构化分析应优先读取 `conversations.json` 或 `conversations-*.json`。
- `chat.html` 适合人工核对，不适合可靠抽取 schema。
- 该文件可能包含完整聊天内容，日志和文档中不应输出其内容。

## `export_manifest.json`

用途：导出包清单，描述导出文件路径、大小，以及逻辑文件与实际文件之间的映射关系。

```ts
interface ExportManifest {
  version?: number;
  manifest_file?: string;
  export_files?: ExportedFile[];
  logical_files?: Record<string, LogicalFile>;
}

interface ExportedFile {
  path: string;
  size_bytes?: number;
}

interface LogicalFile {
  files?: string[];
  sharded?: boolean;
  [key: string]: unknown;
}
```

解析用途：

- 检查导出包是否完整。
- 找出 `conversations` 是否分片。
- 枚举附件文件和 JSON 文件。
- 避免硬编码具体文件名。

## `conversation_asset_file_names.json`

用途：conversation 附件文件名索引，通常用于把导出目录中的本地资源文件名映射到原始显示名。

```ts
type ConversationAssetFileNames = Record<string, string>;
```

解析注意事项：

- key 通常是导出目录中的资源文件名，例如 `.dat` 文件名。
- value 可能是用户上传文件的原始名称，属于敏感信息。
- 该文件只提供名称映射，不一定包含 MIME、大小、上传时间等完整文件元数据。

## `file-*.dat` / `file_*.dat`

用途：聊天中引用的附件、上传文件、生成图片、音频、视频帧、文档等二进制或文本资源。

schema：无统一 JSON schema。扩展名 `.dat` 不代表真实文件类型。

解析方式：

- 通过文件魔数或 MIME sniffing 判断真实类型。
- 通过 `conversation_asset_file_names.json` 补充显示名。
- 通过 `library_files.json` 补充 MIME、大小、上传时间、来源 conversation 等元数据。
- 通过 conversation 消息中的 `asset_pointer`、`audio_asset_pointer`、`video_container_asset_pointer`、`frames_asset_pointers` 或 `metadata.attachments` 建立消息关联。

解析注意事项：

- 不要把 `.dat` 当作固定格式。
- 不要信任文件名扩展判断类型。
- 附件内容可能高度敏感，默认不应写入日志、测试快照或公开报告。

## `library_files.json`

用途：文件库元数据。通常记录用户上传文件、项目文件、知识库文件、生成资源等文件级信息。

```ts
type LibraryFiles = LibraryFile[];

interface LibraryFile {
  id?: string;
  file_id?: string | null;
  file_name?: string | null;
  normalized_name?: string | null;
  file_extension?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  sha256_digest?: string | null;
  client_sha256_digest?: string | null;
  state?: string | null;
  content_backing_kind?: string | null;
  library_file_category?: string | null;
  library_artifact_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  file_upload_time?: string | null;
  file_processed_time?: string | null;
  file_failure_time?: string | null;
  error_msg?: string | null;
  initiating_conversation_id?: string | null;
  origination_message_id?: string | null;
  origination_thread_id?: string | null;
  uploading_account_user_id?: string | null;
  app_id?: string | null;
  gizmo_id?: string | null;
  knowledge_store_id?: string | null;
  directory_id?: string | null;
  root_directory_id?: string | null;
  is_project?: boolean | null;
  is_visible?: boolean | null;
  hide_from_file_search?: boolean | null;
  expires_at?: string | null;
  deleted_at?: string | null;
  trashed_at?: string | null;
  thumbnail_sources?: unknown;
  context_scopes?: unknown;
  context_scopes_v2?: unknown;
  version_provenance?: unknown;
  [key: string]: unknown;
}
```

解析用途：

- 文件类型分布。
- 文件大小统计。
- 文件处理状态统计。
- 将文件关联到 conversation/message/thread。

隐私注意：

- `file_name`、`normalized_name` 可能包含用户信息。
- hash 可用于去重，但仍应谨慎展示。

## `message_feedback.json`

用途：用户对消息的反馈记录，例如点赞、点踩、反馈文本或反馈原因。

```ts
type MessageFeedbackFile = MessageFeedback[];

interface MessageFeedback {
  id?: string;
  conversation_id?: string;
  message_id?: string;
  user_id?: string | null;
  workspace_id?: string | null;
  rating?: "thumbs_up" | "thumbs_down" | string;
  content?: unknown;
  create_time?: number | null;
  update_time?: number | null;
  [key: string]: unknown;
}
```

解析用途：

- 统计点赞/点踩数量。
- 按 conversation 关联反馈。
- 分析用户显式评价过的回复。

注意：`content` 可能包含用户写的反馈文字，默认视为敏感内容。

## `shared_conversations.json`

用途：记录用户分享过的 conversation。

```ts
type SharedConversationsFile = SharedConversation[];

interface SharedConversation {
  id?: string;
  conversation_id?: string;
  title?: string | null;
  is_anonymous?: boolean;
  create_time?: number | string | null;
  update_time?: number | string | null;
  [key: string]: unknown;
}
```

解析用途：

- 标记哪些会话被分享过。
- 统计分享行为。

注意：`title` 可能包含敏感信息，公开展示前应脱敏或避免展示。

## `group_chats.json`

用途：群聊或共享聊天相关数据。它的结构通常不同于普通 conversation 的 `mapping` 图。

```ts
interface GroupChatsFile {
  chats?: GroupChat[];
  [key: string]: unknown;
}

interface GroupChat {
  id?: string;
  name?: string | null;
  assistant_name?: string | null;
  workspace_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_action_at?: string | null;
  last_read_at?: string | null;
  should_auto_respond?: boolean;
  members?: GroupChatMember[];
  messages?: GroupChatMessage[];
  [key: string]: unknown;
}

interface GroupChatMember {
  id?: string;
  role?: string;
  name?: string | null;
  [key: string]: unknown;
}

interface GroupChatMessage {
  id?: string;
  role?: string;
  text?: string | null;
  attachments?: unknown[];
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}
```

解析注意事项：

- group chat 消息通常是数组结构，不是 `mapping` 图。
- 普通 conversation 和 group chat 应先分别解析，再归一化到统一消息模型。

## `user.json`

用途：账户基础信息。

```ts
interface User {
  id?: string;
  email?: string | null;
  phone_number?: string | null;
  birth_year?: number | null;
  chatgpt_plus_user?: boolean;
  [key: string]: unknown;
}
```

隐私注意：

- 该文件包含直接个人信息。
- 除非产品功能明确需要，否则不应纳入聊天分析报告。
- 不应提交到仓库、写入日志或放入测试 fixture。

## `user_settings.json`

用途：用户设置快照，包括界面、语音、训练偏好、模型偏好等设置。

```ts
type UserSettingsFile = UserSettingsRecord[];

interface UserSettingsRecord {
  user_id?: string;
  habitat_object_version?: number | string | null;
  announcements?: unknown;
  beta_settings?: unknown;
  settings?: UserSettings;
  [key: string]: unknown;
}

interface UserSettings {
  chat_theme?: string;
  last_used_model_config?: unknown;
  training_allowed?: boolean;
  voice_training_allowed?: boolean;
  voice_background_enabled?: boolean;
  voice_name?: string;
  show_expanded_code_view?: boolean;
  show_legacy_models?: boolean;
  [key: string]: unknown;
}
```

解析用途：

- 作为导出时用户设置上下文。
- 不应替代消息级模型字段。分析每条消息模型时，优先看 `message.metadata.model_slug`；分析会话默认模型时，优先看 `conversation.default_model_slug`。

## Suggested Normalized Model

为了让后续分析逻辑不直接依赖官方导出格式，可以先转换为内部统一模型。

```ts
interface NormalizedConversation {
  conversation_id: string;
  source: "conversation" | "group_chat";
  title?: string | null;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  is_archived?: boolean;
  is_starred?: boolean;
  is_shared?: boolean;
}

interface NormalizedMessage {
  message_id: string;
  conversation_id: string;
  source: "conversation" | "group_chat";
  role: "system" | "user" | "assistant" | "tool" | string;
  content_type?: string;
  text?: string;
  created_at?: string | number | null;
  model_slug?: string | null;
  parent_message_id?: string | null;
  attachment_refs?: string[];
}

interface NormalizedAsset {
  asset_id: string;
  local_path?: string;
  display_name?: string;
  mime_type?: string;
  file_extension?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  conversation_id?: string;
  message_id?: string;
}
```

## General Parsing Rules

- Treat all files except the main conversation JSON as optional.
- Treat all unknown fields as forward-compatible additions.
- Never log raw message text, user identity fields, or original file names by default.
- Normalize timestamps at the boundary, but keep the raw timestamp if precision matters.
- Separate parsing from analysis: parser should produce normalized records; analysis should compute metrics from normalized records.
- Keep `data/` ignored by git. Real exports should remain local-only.
