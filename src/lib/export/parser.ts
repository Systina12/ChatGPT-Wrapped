import type {
  ExportEntry,
  JsonObject,
  ParsedAsset,
  ParsedConversation,
  ParsedExport,
  ParsedFeedback,
  ParsedGroupChat,
  ParsedLibraryFile,
  ParsedMessage,
  ParsedSetting,
  ParsedShare,
  ParsedUser,
  ParseWarning,
  SourceFile,
} from "../../types/export";
import { classifyAsset, mergeAssets, pathExtension } from "./assets";
import {
  isRelevantJson,
  ImportLimitError,
  readJsonEntry,
  type ImportProgress,
} from "./fileInput";

export async function parseExportEntries(
  entries: ExportEntry[],
  onProgress?: (progress: ImportProgress) => void,
): Promise<ParsedExport> {
  const parser = new ExportParser(entries, onProgress);
  return parser.parse();
}

class ExportParser {
  private readonly entries: ExportEntry[];
  private readonly sourceFiles: SourceFile[];
  private readonly warnings: ParseWarning[] = [];
  private readonly assetNames = new Map<string, string>();
  private readonly libraryByFileName = new Map<string, JsonObject>();
  private readonly libraryByFileId = new Map<string, JsonObject>();
  private readonly conversations: ParsedConversation[] = [];
  private readonly conversationRows = new Map<string, number>();
  private readonly messages = new Map<string, ParsedMessage>();
  private readonly assets: ParsedAsset[] = [];
  private readonly messageAssets = new Map<string, ParsedAsset[]>();
  private readonly libraryFiles: ParsedLibraryFile[] = [];
  private readonly feedback: ParsedFeedback[] = [];
  private readonly shares: ParsedShare[] = [];
  private readonly groupChats: ParsedGroupChat[] = [];
  private readonly users: ParsedUser[] = [];
  private readonly settings: ParsedSetting[] = [];
  private readonly metadata: Record<string, unknown> = {};
  private rowId = 1;

  private completed = 0;
  private readonly parseTotal: number;
  constructor(
    entries: ExportEntry[],
    private readonly onProgress?: (progress: ImportProgress) => void,
  ) {
    this.sourceFiles = entries.map(sourceFileFromEntry);
    // A large export may contain hundreds of thousands of binary attachments.
    // Only report JSON participates in parsing, ordering and duplicate detection.
    this.entries = entries
      .filter((entry) => isRelevantJson(entry.path))
      .sort((left, right) => left.path.localeCompare(right.path));
    const optionalNames = new Set<string>();
    let conversations = 0;
    for (const entry of this.entries) {
      if (!isRelevantJson(entry.path)) continue;
      if (/^conversations(?:-\d+)?\.json$/.test(entry.name)) conversations++;
      else {
        if (optionalNames.has(entry.name))
          this.warn(
            "duplicate_export_file",
            `Multiple ${entry.name}; using the first path / 重复附属文件，采用按路径排序的第一个`,
          );
        optionalNames.add(entry.name);
      }
    }
    this.parseTotal = conversations + optionalNames.size;
  }

  async parse(): Promise<ParsedExport> {
    await this.parseManifest();
    await this.parseAssetNameMap();
    await this.parseLibraryFiles();
    await this.parseConversations();
    await this.parseGroupChats();
    await this.parseFeedback();
    await this.parseShares();
    await this.parseUser();
    await this.parseUserSettings();

    // The report only needs parent links for branch selection, never the full
    // original content/metadata object graph. Keep message-free and invalid nodes.
    for (const conversation of this.conversations) {
      const raw = isObject(conversation.raw) ? conversation.raw : {};
      conversation.raw = {
        mapping: isObject(raw.mapping)
          ? Object.fromEntries(
              Object.entries(raw.mapping).map(([id, node]) => [
                id,
                isObject(node)
                  ? {
                      parent:
                        typeof node.parent === "string" ? node.parent : null,
                    }
                  : null,
              ]),
            )
          : {},
      };
    }
    for (const item of [
      ...this.groupChats,
      ...this.feedback,
      ...this.shares,
      ...this.users,
      ...this.settings,
    ])
      item.raw = null;
    for (const item of this.libraryFiles) item.raw = {};
    const assets = mergeAssets([
      ...this.assets,
      ...[...this.messageAssets.values()].flat(),
    ]);
    for (const asset of assets) {
      asset.categoryHint = classifyAsset(asset);
      asset.raw = null;
    }

    return {
      sourceFiles: this.sourceFiles,
      metadata: this.metadata,
      conversations: this.conversations,
      messages: [...this.messages.values()],
      assets,
      assetNameMap: Object.fromEntries(this.assetNames),
      libraryFiles: this.libraryFiles,
      feedback: this.feedback,
      shares: this.shares,
      groupChats: this.groupChats,
      users: this.users,
      settings: this.settings,
      warnings: this.warnings,
    };
  }

  private async parseManifest(): Promise<void> {
    const data = await this.loadOptionalJson("export_manifest.json");
    if (data !== undefined) {
      this.metadata.export_manifest = data;
    }
  }

  private async parseAssetNameMap(): Promise<void> {
    const data = await this.loadOptionalJson(
      "conversation_asset_file_names.json",
    );
    if (data === undefined) {
      return;
    }
    if (!isObject(data)) {
      this.warn(
        "invalid_asset_name_map",
        "conversation_asset_file_names.json is not an object",
      );
      return;
    }

    Object.entries(data).forEach(([localPath, displayName]) => {
      const display =
        typeof displayName === "string"
          ? displayName
          : JSON.stringify(displayName);
      this.assetNames.set(localPath, display);
    });
  }

  private async parseLibraryFiles(): Promise<void> {
    const data = await this.loadOptionalJson("library_files.json");
    if (data === undefined) {
      return;
    }
    if (!Array.isArray(data)) {
      this.warn("invalid_library_files", "library_files.json is not an array");
      return;
    }

    data.forEach((item, index) => {
      if (!isObject(item)) {
        this.warn(
          "invalid_library_file",
          `library_files[${index}] is not an object`,
        );
        return;
      }
      const id = asStr(item.id) || `library-index-${index}`;
      const fileId = asStr(item.file_id);
      const fileName = asStr(item.file_name);
      const normalizedName = asStr(item.normalized_name);
      const libraryFile: ParsedLibraryFile = {
        id,
        fileId,
        fileName,
        normalizedName,
        mimeType: asStr(item.mime_type),
        fileExtension: asStr(item.file_extension),
        fileSizeBytes: this.assetInteger(
          item.file_size_bytes,
          "library.file_size_bytes",
        ),
        state: asStr(item.state),
        initiatingConversationId: asStr(item.initiating_conversation_id),
        originationMessageId: asStr(item.origination_message_id),
        originationThreadId: asStr(item.origination_thread_id),
        raw: item,
      };

      if (fileName) {
        this.libraryByFileName.set(fileName, item);
      }
      if (normalizedName) {
        this.libraryByFileName.set(normalizedName, item);
      }
      if (fileId) {
        this.libraryByFileId.set(fileId, item);
      }

      this.libraryFiles.push(libraryFile);
      this.insertAsset({
        source: "library_file",
        localPath: fileId || fileName || id,
        displayName: fileName || normalizedName,
        mimeType: libraryFile.mimeType,
        fileExtension: libraryFile.fileExtension,
        sizeBytes: libraryFile.fileSizeBytes,
        width: null,
        height: null,
        conversationId: libraryFile.initiatingConversationId,
        messageId: libraryFile.originationMessageId,
        raw: item,
      });
    });
  }

  private async parseConversations(): Promise<void> {
    const files = this.conversationFiles();
    if (files.length === 0) {
      throw new Error("Missing conversations.json / 缺少 conversations 主文件");
    }

    let validFiles = 0;
    for (const file of files) {
      const data = await this.loadJson(file);
      if (!Array.isArray(data)) {
        this.warn("invalid_conversation_file", `${file.name} is not an array`);
        continue;
      }
      let usable = 0;
      data.forEach((conversation, index) => {
        if (!isValidConversation(conversation)) {
          this.warn(
            "invalid_conversation",
            `${file.name}[${index}] is not a valid conversation`,
          );
          return;
        }
        const fallbackId = `${file.path.replace(/\.json$/, "")}:${index}`;
        const id = conversationIdFor(conversation, fallbackId);
        const row = this.conversationRows.get(id);
        const previous =
          row === undefined ? undefined : this.conversations[row];
        const result = previous
          ? this.mergeConversation(previous.raw as JsonObject, conversation, id)
          : { merged: conversation, changes: conversation };
        if (
          !this.insertConversationMessages(result.changes, fallbackId) &&
          !previous
        ) {
          this.warn(
            "invalid_conversation",
            `${file.name}[${index}] contains only damaged message data`,
          );
          return;
        }
        this.insertConversation(result.merged, fallbackId);
        usable++;
      });
      if (data.length === 0 || usable > 0) validFiles++;
    }
    if (!validFiles)
      throw new Error(
        "All conversation files are damaged or invalid / conversations 主文件全部损坏或无效",
      );
  }

  private async parseGroupChats(): Promise<void> {
    const data = await this.loadOptionalJson("group_chats.json");
    if (data === undefined) {
      return;
    }
    if (!isObject(data)) {
      this.warn("invalid_group_chats", "group_chats.json is not an object");
      return;
    }
    if (!Array.isArray(data.chats)) {
      this.warn(
        "invalid_group_chats",
        "group_chats.json does not contain a chats array",
      );
      return;
    }

    data.chats.forEach((chat, index) => {
      if (!isObject(chat)) {
        this.warn(
          "invalid_group_chat",
          `group_chats.chats[${index}] is not an object`,
        );
        return;
      }
      const chatId = asStr(chat.id) || `group-chat-${index}`;
      const groupChat: ParsedGroupChat = {
        id: chatId,
        name: asStr(chat.name),
        assistantName: asStr(chat.assistant_name),
        workspaceId: asStr(chat.workspace_id),
        createdAt: asStr(chat.created_at),
        updatedAt: asStr(chat.updated_at),
        lastActionAt: asStr(chat.last_action_at),
        lastReadAt: asStr(chat.last_read_at),
        shouldAutoRespond: asBool(chat.should_auto_respond),
        raw: chat,
      };
      this.groupChats.push(groupChat);
      this.conversations.push({
        rowId: this.rowId++,
        conversationId: chatId,
        source: "group_chat",
        title: groupChat.name,
        createTime: null,
        updateTime: null,
        createTimeText: groupChat.createdAt,
        updateTimeText: groupChat.updatedAt,
        currentNode: null,
        defaultModelSlug: null,
        isArchived: null,
        isStarred: null,
        isShared: false,
        raw: chat,
      });

      if (Array.isArray(chat.messages)) {
        chat.messages.forEach((message, messageIndex) => {
          if (isObject(message)) {
            this.insertGroupMessage(chatId, message, messageIndex);
          }
        });
      }
    });
  }

  private async parseFeedback(): Promise<void> {
    const data = await this.loadOptionalJson("message_feedback.json");
    if (data === undefined) {
      return;
    }
    if (!Array.isArray(data)) {
      this.warn("invalid_feedback", "message_feedback.json is not an array");
      return;
    }

    data.forEach((item, index) => {
      if (!isObject(item)) {
        this.warn(
          "invalid_feedback",
          `message_feedback[${index}] is not an object`,
        );
        return;
      }
      this.feedback.push({
        id: asStr(item.id) || `feedback-${index}`,
        conversationId: asStr(item.conversation_id),
        messageId: asStr(item.message_id),
        rating: asStr(item.rating),
        createTime: asNumber(item.create_time),
        updateTime: asNumber(item.update_time),
        raw: item,
      });
    });
  }

  private async parseShares(): Promise<void> {
    const data = await this.loadOptionalJson("shared_conversations.json");
    if (data === undefined) {
      return;
    }
    if (!Array.isArray(data)) {
      this.warn("invalid_shares", "shared_conversations.json is not an array");
      return;
    }

    const byId = new Map<string, ParsedConversation[]>();
    for (const conversation of this.conversations) {
      const rows = byId.get(conversation.conversationId) || [];
      rows.push(conversation);
      byId.set(conversation.conversationId, rows);
    }
    data.forEach((item, index) => {
      if (!isObject(item)) {
        this.warn(
          "invalid_share",
          `shared_conversations[${index}] is not an object`,
        );
        return;
      }
      const conversationId = asStr(item.conversation_id);
      this.shares.push({
        id: asStr(item.id) || `share-${index}`,
        conversationId,
        title: asStr(item.title),
        isAnonymous: asBool(item.is_anonymous),
        createTime: asStr(item.create_time),
        updateTime: asStr(item.update_time),
        raw: item,
      });
      if (conversationId) {
        (byId.get(conversationId) || []).forEach((conversation) => {
          conversation.isShared = true;
        });
      }
    });
  }

  private async parseUser(): Promise<void> {
    const data = await this.loadOptionalJson("user.json");
    if (data === undefined) {
      return;
    }
    if (!isObject(data)) {
      this.warn("invalid_user", "user.json is not an object");
      return;
    }
    this.users.push({
      id: asStr(data.id) || "user",
      email: asStr(data.email),
      phoneNumber: asStr(data.phone_number),
      birthYear: asInt(data.birth_year),
      chatgptPlusUser: asBool(data.chatgpt_plus_user),
      raw: data,
    });
  }

  private async parseUserSettings(): Promise<void> {
    const data = await this.loadOptionalJson("user_settings.json");
    if (data === undefined) {
      return;
    }
    const records = Array.isArray(data) ? data : [data];
    records.forEach((item, index) => {
      if (!isObject(item)) {
        this.warn(
          "invalid_settings",
          `user_settings[${index}] is not an object`,
        );
        return;
      }
      this.settings.push({
        userId: asStr(item.user_id),
        habitatObjectVersion: asStr(item.habitat_object_version),
        raw: item,
      });
    });
  }

  private insertConversation(
    conversation: JsonObject,
    fallbackId: string,
  ): void {
    const conversationId = conversationIdFor(conversation, fallbackId);
    const row = this.conversationRows.get(conversationId);
    const record: ParsedConversation = {
      rowId: row === undefined ? this.rowId++ : this.conversations[row].rowId,
      conversationId,
      source: "conversation",
      title: asStr(conversation.title),
      createTime: asNumber(conversation.create_time),
      updateTime: asNumber(conversation.update_time),
      createTimeText: null,
      updateTimeText: null,
      currentNode: asStr(conversation.current_node),
      defaultModelSlug: asStr(conversation.default_model_slug),
      isArchived: asBool(conversation.is_archived),
      isStarred: asBool(conversation.is_starred),
      isShared: false,
      raw: conversation,
    };
    if (row === undefined) {
      this.conversationRows.set(conversationId, this.conversations.length);
      this.conversations.push(record);
    } else this.conversations[row] = record;
  }

  private mergeConversation(
    previous: JsonObject,
    next: JsonObject,
    id: string,
  ): { merged: JsonObject; changes: JsonObject } {
    this.warn(
      "duplicate_conversation",
      `Overlapping conversation merged / 重叠会话已合并: ${id}`,
    );
    const merged = { ...previous };
    for (const [key, value] of Object.entries(next))
      if (value !== null && value !== undefined && value !== "")
        Object.defineProperty(merged, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    const mapping = isObject(previous.mapping) ? previous.mapping : {};
    const changed: JsonObject = Object.create(null);
    let conflict = false;
    if (isObject(next.mapping))
      for (const [key, node] of Object.entries(next.mapping)) {
        const old = Object.hasOwn(mapping, key) ? mapping[key] : undefined;
        if (old !== undefined) {
          if (JSON.stringify(old) === JSON.stringify(node)) continue;
          conflict = true;
        }
        // Keep usable history when a later shard contains a damaged/empty duplicate.
        const hasMessage = (value: unknown) =>
          isObject(value) &&
          isObject(value.message) &&
          isObject(value.message.author) &&
          typeof value.message.author.role === "string" &&
          isObject(value.message.content);
        if (hasMessage(old) && !hasMessage(node)) continue;
        if (hasMessage(old)) {
          const oldNode = old as JsonObject;
          const oldMessage = oldNode.message as JsonObject;
          const oldId = asStr(oldMessage.id) || asStr(oldNode.id) || key;
          const nextNode = node as JsonObject;
          const nextMessage = nextNode.message as JsonObject;
          const nextId = asStr(nextMessage.id) || asStr(nextNode.id) || key;
          const messageKey = `${id}\0${oldId}`;
          if (
            nextId !== oldId &&
            this.messages.get(messageKey)?.nodeId === key
          ) {
            this.messages.delete(messageKey);
            this.messageAssets.delete(messageKey);
          }
        }
        changed[key] = node;
        Object.defineProperty(mapping, key, {
          value: node,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    merged.mapping = mapping;
    if (conflict)
      this.warn(
        "conflicting_conversation",
        `Conflicting nodes use the later usable record / 冲突节点采用后一个可用记录: ${id}`,
      );
    return { merged, changes: { ...merged, mapping: changed } };
  }

  private insertConversationMessages(
    conversation: JsonObject,
    fallbackId: string,
  ): boolean {
    const conversationId = conversationIdFor(conversation, fallbackId);
    if (conversation.mapping == null) return true;
    if (!isObject(conversation.mapping)) {
      this.warn(
        "invalid_mapping",
        `conversation ${conversationId} mapping is not an object`,
      );
      return false;
    }
    let validMessages = 0,
      damagedNodes = 0;
    Object.entries(conversation.mapping).forEach(([nodeId, node]) => {
      if (!isObject(node)) {
        this.warn(
          "invalid_mapping_node",
          `${conversationId}/${nodeId}: invalid mapping node`,
        );
        damagedNodes++;
        return;
      }
      // Message-free nodes are legitimate links in the current branch.
      if (node.message == null) return;
      if (
        !isObject(node.message) ||
        !isObject(node.message.author) ||
        typeof node.message.author.role !== "string" ||
        !isObject(node.message.content)
      ) {
        this.warn(
          "invalid_message",
          `${conversationId}/${nodeId}: damaged message`,
        );
        damagedNodes++;
        return;
      }
      const message = node.message;
      validMessages++;
      const content = isObject(message.content) ? message.content : {};
      const metadata = isObject(message.metadata) ? message.metadata : {};
      const author = isObject(message.author) ? message.author : {};
      const messageId = asStr(message.id) || asStr(node.id) || nodeId;

      this.messages.set(`${conversationId}\0${messageId}`, {
        messageId,
        conversationId,
        source: "conversation",
        nodeId,
        parentNodeId: asStr(node.parent),
        role: asStr(author.role),
        authorName: asStr(author.name),
        contentType: asStr(content.content_type),
        text: extractText(content),
        createTime: asNumber(message.create_time),
        updateTime: asNumber(message.update_time),
        createTimeText: null,
        updateTimeText: null,
        modelSlug: asStr(metadata.model_slug),
        raw: null,
      });
      const key = `${conversationId}\0${messageId}`;
      const previousAssets = this.messageAssets.get(key);
      this.messageAssets.delete(key);
      this.insertMessageAssets(conversationId, messageId, content, metadata);
      const incomingAssets = this.messageAssets.get(key);
      if (previousAssets && incomingAssets) {
        // Enrich paths still present in the later message, but never resurrect
        // attachments removed by that replacement.
        const paths = new Set(incomingAssets.map((asset) => asset.localPath));
        this.messageAssets.set(
          key,
          mergeAssets([
            ...previousAssets.filter((asset) => paths.has(asset.localPath)),
            ...incomingAssets,
          ]),
        );
      }
    });
    return damagedNodes === 0 || validMessages > 0;
  }

  private insertGroupMessage(
    chatId: string,
    message: JsonObject,
    messageIndex: number,
  ): void {
    const messageId = asStr(message.id) || `${chatId}-message-${messageIndex}`;
    this.messages.set(`${chatId}\0${messageId}`, {
      messageId,
      conversationId: chatId,
      source: "group_chat",
      nodeId: null,
      parentNodeId: null,
      role: asStr(message.role),
      authorName: null,
      contentType: "text",
      text: asStr(message.text),
      createTime: null,
      updateTime: null,
      createTimeText: asStr(message.created_at),
      updateTimeText: asStr(message.updated_at),
      modelSlug: null,
      raw: null,
    });

    if (Array.isArray(message.attachments)) {
      message.attachments.forEach((attachment) => {
        if (isObject(attachment)) {
          this.insertAttachmentAsset(chatId, messageId, attachment);
        }
      });
    }
  }

  private insertMessageAssets(
    conversationId: string,
    messageId: string,
    content: JsonObject,
    metadata: JsonObject,
  ): void {
    // Audio/image exports may put the pointer on content itself, or in nested audio data.
    this.insertPartAsset(conversationId, messageId, content);
    for (const key of ["audio", "input_audio", "output_audio"]) {
      if (isObject(content[key]))
        this.insertPartAsset(conversationId, messageId, {
          ...content[key],
          content_type: "audio",
        });
    }
    if (Array.isArray(content.parts)) {
      content.parts.forEach((part) => {
        if (isObject(part)) {
          this.insertPartAsset(conversationId, messageId, {
            ...part,
            content_type: part.content_type || content.content_type,
          });
        }
      });
    }

    if (Array.isArray(metadata.attachments)) {
      metadata.attachments.forEach((attachment) => {
        if (isObject(attachment)) {
          this.insertAttachmentAsset(conversationId, messageId, attachment);
        }
      });
    }
  }

  private insertPartAsset(
    conversationId: string,
    messageId: string,
    part: JsonObject,
  ): void {
    [
      "asset_pointer",
      "audio_asset_pointer",
      "video_container_asset_pointer",
    ].forEach((key) => {
      const localPath = asStr(part[key]);
      if (!localPath) {
        return;
      }
      const displayName = this.assetNames.get(localPath) || null;
      const library = this.libraryForAsset(localPath, displayName);
      this.insertAsset({
        source: "message_part",
        categoryHint:
          key === "audio_asset_pointer"
            ? "voice"
            : key === "video_container_asset_pointer"
              ? "file"
              : String(part.content_type || "").includes("image")
                ? "image"
                : String(part.content_type || "").includes("audio")
                  ? "voice"
                  : undefined,
        localPath,
        displayName,
        mimeType:
          asStr(part.mime_type) ||
          libraryValue(library, "mime_type") ||
          guessMime(localPath),
        fileExtension: libraryValue(library, "file_extension"),
        sizeBytes:
          this.assetInteger(part.size_bytes, "size_bytes") ??
          this.assetInteger(
            library?.file_size_bytes,
            "library.file_size_bytes",
          ),
        width: this.assetInteger(part.width, "width"),
        height: this.assetInteger(part.height, "height"),
        conversationId,
        messageId,
        raw: {
          ...part,
          content_type:
            key === "audio_asset_pointer"
              ? "audio"
              : part.content_type || contentTypeForPart(part),
        },
      });
    });

    if (Array.isArray(part.frames_asset_pointers)) {
      part.frames_asset_pointers.forEach((frame) => {
        const localPath = asStr(frame);
        if (!localPath) {
          return;
        }
        this.insertAsset({
          source: "message_part_frame",
          categoryHint: "image",
          localPath,
          displayName: this.assetNames.get(localPath) || null,
          mimeType: guessMime(localPath),
          fileExtension: null,
          sizeBytes: null,
          width: null,
          height: null,
          conversationId,
          messageId,
          raw: part,
        });
      });
    }
  }

  private insertAttachmentAsset(
    conversationId: string,
    messageId: string,
    attachment: JsonObject,
  ): void {
    const localPath =
      asStr(attachment.asset_pointer) ||
      asStr(attachment.file_id) ||
      asStr(attachment.id) ||
      asStr(attachment.name) ||
      asStr(attachment.file_name);
    if (!localPath) {
      return;
    }
    const displayName =
      asStr(attachment.file_name) ||
      asStr(attachment.name) ||
      this.assetNames.get(localPath) ||
      null;
    const library = this.libraryForAsset(localPath, displayName);
    this.insertAsset({
      source: "attachment",
      localPath,
      displayName,
      mimeType:
        asStr(attachment.mime_type) || libraryValue(library, "mime_type"),
      fileExtension: libraryValue(library, "file_extension"),
      sizeBytes:
        this.assetInteger(attachment.size_bytes, "size_bytes") ??
        this.assetInteger(library?.file_size_bytes, "library.file_size_bytes"),
      width: this.assetInteger(attachment.width, "width"),
      height: this.assetInteger(attachment.height, "height"),
      conversationId,
      messageId,
      raw: attachment,
    });
  }

  private assetInteger(value: unknown, field: string): number | null {
    if (value == null) return null;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
      return value;
    this.warn(
      "invalid_asset_metadata",
      `${field}: expected a non-negative safe integer / 附件尺寸或大小无效`,
    );
    return null;
  }

  private insertAsset(asset: ParsedAsset): void {
    if (!asset.localPath) {
      return;
    }
    if (asset.source === "library_file") this.assets.push(asset);
    else {
      const key = `${asset.conversationId}\0${asset.messageId}`;
      let assets = this.messageAssets.get(key);
      if (!assets) this.messageAssets.set(key, (assets = []));
      assets.push(asset);
    }
  }

  private libraryForAsset(
    localPath: string,
    displayName: string | null,
  ): JsonObject | null {
    return (
      this.libraryByFileName.get(localPath) ||
      this.libraryByFileId.get(localPath) ||
      (displayName ? this.libraryByFileName.get(displayName) : undefined) ||
      null
    );
  }

  private conversationFiles(): ExportEntry[] {
    return this.entries
      .filter(
        (entry) =>
          entry.name === "conversations.json" ||
          /^conversations-\d+\.json$/.test(entry.name),
      )
      .sort((left, right) => {
        if (left.name === "conversations.json") {
          return -1;
        }
        if (right.name === "conversations.json") {
          return 1;
        }
        return left.name.localeCompare(right.name);
      });
  }

  private async loadOptionalJson(name: string): Promise<unknown> {
    const entry = this.entries.find((item) => item.name === name);
    if (!entry) {
      return undefined;
    }
    return this.loadJson(entry);
  }

  private async loadJson(entry: ExportEntry): Promise<unknown> {
    try {
      this.onProgress?.({
        phase: "parsing",
        completed: ++this.completed,
        total: this.parseTotal,
      });
      return await readJsonEntry(entry);
    } catch (error) {
      if (
        error instanceof ImportLimitError ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw error;
      this.warn(
        "invalid_json",
        `${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private warn(code: string, message: string, raw?: unknown): void {
    this.warnings.push({ code, message, raw });
  }
}

function sourceFileFromEntry(entry: ExportEntry): SourceFile {
  return {
    path: entry.path,
    kind: classifyFile(entry.name),
    sizeBytes: entry.size,
  };
}

function conversationIdFor(
  conversation: JsonObject,
  fallbackId: string,
): string {
  return (
    asStr(conversation.conversation_id) || asStr(conversation.id) || fallbackId
  );
}

function extractText(content: JsonObject): string | null {
  const values: string[] = [];
  if (Array.isArray(content.parts)) {
    content.parts.forEach((part) => {
      if (typeof part === "string") {
        values.push(part);
      } else if (isObject(part) && typeof part.text === "string") {
        values.push(part.text);
      }
    });
  }
  ["text", "summary", "content"].forEach((key) => {
    const value = content[key];
    if (typeof value === "string") {
      values.push(value);
    }
  });
  const text = values.filter(Boolean).join("\n");
  return text || null;
}

function classifyFile(name: string): string {
  if (name === "chat.html") return "chat_html";
  if (name === "export_manifest.json") return "manifest";
  if (name === "conversation_asset_file_names.json") return "asset_name_map";
  if (name === "library_files.json") return "library_files";
  if (name === "message_feedback.json") return "feedback";
  if (name === "shared_conversations.json") return "shares";
  if (name === "group_chats.json") return "group_chats";
  if (name === "user.json") return "user";
  if (name === "user_settings.json") return "settings";
  if (name === "conversations.json" || /^conversations-\d+\.json$/.test(name))
    return "conversations";
  if (name.endsWith(".dat")) return "asset";
  return "unknown";
}

function libraryValue(library: JsonObject | null, key: string): string | null {
  return library ? asStr(library[key]) : null;
}

function guessMime(localPath: string): string | null {
  const extension = pathExtension(localPath);
  const byExtension: Record<string, string> = {
    aac: "audio/aac",
    bmp: "image/bmp",
    flac: "audio/flac",
    gif: "image/gif",
    heic: "image/heic",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    ogg: "audio/ogg",
    opus: "audio/opus",
    pdf: "application/pdf",
    png: "image/png",
    wav: "audio/wav",
    webm: "video/webm",
    webp: "image/webp",
  };
  return Object.hasOwn(byExtension, extension) ? byExtension[extension] : null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStr(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function contentTypeForPart(part: JsonObject): unknown {
  return part.content_type || (part.audio_asset_pointer ? "audio" : undefined);
}

function isValidConversation(value: unknown): value is JsonObject {
  return (
    isObject(value) &&
    (isObject(value.mapping) ||
      (value.mapping == null &&
        (typeof value.id === "string" ||
          typeof value.conversation_id === "string")))
  );
}
