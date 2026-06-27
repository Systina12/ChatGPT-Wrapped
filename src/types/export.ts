export type JsonObject = Record<string, unknown>;

export interface ExportEntry {
  path: string;
  name: string;
  size: number;
  text?: string;
  file?: File;
}

export interface SourceFile {
  path: string;
  kind: string;
  sizeBytes: number;
}

export interface ParsedConversation {
  rowId: number;
  conversationId: string;
  source: "conversation" | "group_chat";
  title: string | null;
  createTime: number | null;
  updateTime: number | null;
  createTimeText: string | null;
  updateTimeText: string | null;
  currentNode: string | null;
  defaultModelSlug: string | null;
  isArchived: boolean | null;
  isStarred: boolean | null;
  isShared: boolean;
  raw: unknown;
}

export interface ParsedMessage {
  messageId: string;
  conversationId: string | null;
  source: "conversation" | "group_chat";
  nodeId: string | null;
  parentNodeId: string | null;
  role: string | null;
  authorName: string | null;
  contentType: string | null;
  text: string | null;
  createTime: number | null;
  updateTime: number | null;
  createTimeText: string | null;
  updateTimeText: string | null;
  modelSlug: string | null;
  raw: unknown;
}

export interface ParsedAsset {
  source: "library_file" | "message_part" | "message_part_frame" | "attachment";
  localPath: string;
  displayName: string | null;
  mimeType: string | null;
  fileExtension: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  conversationId: string | null;
  messageId: string | null;
  raw: unknown;
}

export interface ParsedFeedback {
  id: string;
  conversationId: string | null;
  messageId: string | null;
  rating: string | null;
  createTime: number | null;
  updateTime: number | null;
  raw: unknown;
}

export interface ParsedShare {
  id: string;
  conversationId: string | null;
  title: string | null;
  isAnonymous: boolean | null;
  createTime: string | null;
  updateTime: string | null;
  raw: unknown;
}

export interface ParsedLibraryFile {
  id: string;
  fileId: string | null;
  fileName: string | null;
  normalizedName: string | null;
  mimeType: string | null;
  fileExtension: string | null;
  fileSizeBytes: number | null;
  state: string | null;
  initiatingConversationId: string | null;
  originationMessageId: string | null;
  originationThreadId: string | null;
  raw: JsonObject;
}

export interface ParsedGroupChat {
  id: string;
  name: string | null;
  assistantName: string | null;
  workspaceId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastActionAt: string | null;
  lastReadAt: string | null;
  shouldAutoRespond: boolean | null;
  raw: unknown;
}

export interface ParsedUser {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  birthYear: number | null;
  chatgptPlusUser: boolean | null;
  raw: unknown;
}

export interface ParsedSetting {
  userId: string | null;
  habitatObjectVersion: string | null;
  raw: unknown;
}

export interface ParseWarning {
  code: string;
  message: string;
  raw?: unknown;
}

export interface ParsedExport {
  sourceFiles: SourceFile[];
  metadata: Record<string, unknown>;
  conversations: ParsedConversation[];
  messages: ParsedMessage[];
  assets: ParsedAsset[];
  assetNameMap: Record<string, string>;
  libraryFiles: ParsedLibraryFile[];
  feedback: ParsedFeedback[];
  shares: ParsedShare[];
  groupChats: ParsedGroupChat[];
  users: ParsedUser[];
  settings: ParsedSetting[];
  warnings: ParseWarning[];
}

