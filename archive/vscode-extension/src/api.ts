import { getApiBaseUrl } from "./utils/config";

/**
 * Lightweight HTTP client for the Jama MCP REST API backend (localhost).
 * All methods throw on non-2xx responses.
 */
export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? getApiBaseUrl();
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jama API ${res.status}: ${text || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  /** Check if the backend is reachable via the unified health endpoint. */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request("/api/health");
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Settings ----------

  async getCredentialStatus(): Promise<{ configured: boolean; source: string | null }> {
    return this.request("/settings/credentials");
  }

  // ---------- Projects ----------

  async getProjects(): Promise<JamaProject[]> {
    return this.request("/api/projects");
  }

  // ---------- Items ----------

  async getItem(itemId: number, live = false): Promise<JamaItem> {
    return this.request(`/api/items/${itemId}${live ? "?live=true" : ""}`);
  }

  async getItemChildren(itemId: number, live = false): Promise<JamaItem[]> {
    return this.request(`/api/items/${itemId}/children${live ? "?live=true" : ""}`);
  }

  async getItemTree(projectId: number): Promise<JamaTreeNode[]> {
    return this.request(`/api/projects/${projectId}/tree`);
  }

  async updateItem(itemId: number, fields: Record<string, unknown>): Promise<JamaItem> {
    return this.request(`/api/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  async createItem(
    projectId: number,
    itemTypeId: number,
    parentId: number,
    fields: Record<string, unknown>
  ): Promise<JamaItem> {
    return this.request("/api/items", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        item_type_id: itemTypeId,
        parent_id: parentId,
        fields,
      }),
    });
  }

  // ---------- Item Sub-endpoints ----------

  async getItemComments(itemId: number): Promise<JamaComment[]> {
    return this.request(`/api/items/${itemId}/comments`);
  }

  async addItemComment(itemId: number, text: string): Promise<JamaComment> {
    return this.request(`/api/items/${itemId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }

  async getItemAttachments(itemId: number): Promise<JamaAttachment[]> {
    return this.request(`/api/items/${itemId}/attachments`);
  }

  async getItemTags(itemId: number): Promise<JamaTag[]> {
    return this.request(`/api/items/${itemId}/tags`);
  }

  async getItemLinks(itemId: number): Promise<JamaLink[]> {
    return this.request(`/api/items/${itemId}/links`);
  }

  async getItemLock(itemId: number): Promise<JamaLockState> {
    return this.request(`/api/items/${itemId}/lock`);
  }

  async setItemLock(itemId: number, locked: boolean): Promise<JamaLockState> {
    return this.request(`/api/items/${itemId}/lock`, {
      method: "PUT",
      body: JSON.stringify({ locked }),
    });
  }

  // ---------- Workflow Transitions ----------

  async getWorkflowTransitions(itemId: number): Promise<JamaWorkflowTransition[]> {
    return this.request(`/api/items/${itemId}/workflowtransitions`);
  }

  async executeWorkflowTransition(
    itemId: number,
    transitionId: string,
    comment = ""
  ): Promise<unknown> {
    return this.request(`/api/items/${itemId}/workflowtransitions`, {
      method: "POST",
      body: JSON.stringify({ transitionId, comment }),
    });
  }

  // ---------- Relationships ----------

  async getItemUpstream(itemId: number): Promise<JamaRelatedItem[]> {
    return this.request(`/api/items/${itemId}/upstream`);
  }

  async getItemDownstream(itemId: number): Promise<JamaRelatedItem[]> {
    return this.request(`/api/items/${itemId}/downstream`);
  }

  async createRelationship(
    fromItem: number,
    toItem: number,
    relationshipTypeId?: number
  ): Promise<unknown> {
    return this.request("/api/relationships", {
      method: "POST",
      body: JSON.stringify({
        from_item: fromItem,
        to_item: toItem,
        relationship_type_id: relationshipTypeId,
      }),
    });
  }

  async getRelationshipTypes(): Promise<JamaRelationshipType[]> {
    return this.request("/api/relationshiptypes");
  }

  // ---------- Versions ----------

  async getItemVersions(itemId: number): Promise<JamaItemVersion[]> {
    return this.request(`/api/items/${itemId}/versions`);
  }

  async getItemAtVersion(itemId: number, version: number): Promise<JamaItemVersion> {
    return this.request(`/api/items/${itemId}/versions/${version}`);
  }

  // ---------- Search ----------

  async search(query: string, projectId?: number, limit = 20): Promise<JamaSearchResult[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (projectId) {
      params.set("project", String(projectId));
    }
    return this.request(`/api/search?${params}`);
  }

  async deepSearch(
    query: string,
    projectId?: number,
    limit = 10
  ): Promise<JamaDeepSearchResult[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (projectId) {
      params.set("project", String(projectId));
    }
    return this.request(`/api/deepsearch?${params}`);
  }

  // ---------- Sync ----------

  async syncProject(projectId: number): Promise<{ status: string }> {
    return this.request(`/api/projects/${projectId}/sync`, { method: "POST" });
  }

  async incrementalSync(projectId: number): Promise<{ status: string }> {
    return this.request(`/api/projects/${projectId}/incremental-sync`, { method: "POST" });
  }

  async getSyncProgress(): Promise<JamaSyncProgress> {
    return this.request("/api/sync/progress");
  }

  // ---------- Item Types & Pick Lists ----------

  async getItemTypes(): Promise<JamaItemType[]> {
    return this.request("/api/itemtypes");
  }

  async getPickLists(): Promise<JamaPickList[]> {
    return this.request("/api/picklists");
  }

  async getPickListOptions(pickListId: number): Promise<JamaPickListOption[]> {
    return this.request(`/api/picklists/${pickListId}/options`);
  }

  // ---------- Test Management ----------

  async getTestPlans(projectId: number, live = false): Promise<JamaTestPlan[]> {
    return this.request(`/api/projects/${projectId}/testplans${live ? "?live=true" : ""}`);
  }

  async getTestCycles(planId: number, live = false): Promise<JamaTestCycle[]> {
    return this.request(`/api/testplans/${planId}/cycles${live ? "?live=true" : ""}`);
  }

  async getTestRuns(cycleId: number, live = false): Promise<JamaTestRun[]> {
    return this.request(`/api/testcycles/${cycleId}/runs${live ? "?live=true" : ""}`);
  }

  async updateTestRun(
    runId: number,
    status: string,
    actualResults?: string
  ): Promise<JamaTestRun> {
    return this.request(`/api/testruns/${runId}`, {
      method: "PUT",
      body: JSON.stringify({ status, actual_results: actualResults }),
    });
  }

  // ---------- Tags ----------

  async getTags(projectId: number): Promise<JamaTag[]> {
    return this.request(`/api/projects/${projectId}/tags`);
  }

  // ---------- Users ----------

  async getCurrentUser(): Promise<JamaUser> {
    return this.request("/api/users/current");
  }

  async getUsers(): Promise<JamaUser[]> {
    return this.request("/api/users");
  }

  // ---------- Attachments ----------

  getAttachmentDownloadUrl(attachmentId: number): string {
    return `${this.baseUrl}/api/attachments/${attachmentId}/base64`;
  }

  // ---------- Baselines ----------

  async getBaselines(projectId: number): Promise<JamaBaseline[]> {
    return this.request(`/api/projects/${projectId}/baselines`);
  }

  // ---------- Releases ----------

  async getReleases(projectId: number): Promise<JamaRelease[]> {
    return this.request(`/api/projects/${projectId}/releases`);
  }

  // ---------- Reviews ----------

  async getReviews(projectId: number): Promise<JamaReview[]> {
    return this.request(`/api/projects/${projectId}/reviews`);
  }
}

// ---------- Type Definitions ----------

export interface JamaProject {
  id: number;
  project_key: string;
  name: string;
  description: string;
  is_folder: number;
  parent_id: number | null;
  synced_at: number;
}

export interface JamaItem {
  id: number;
  project_id: number;
  item_type: number;
  document_key: string;
  global_id: string;
  name: string;
  description: string;
  parent_id: number | null;
  created_date: string | null;
  modified_date: string | null;
  version: number;
  current_version: number;
  fields_json: string;
  resources_json: string;
  location_json: string;
  synced_at: number;
}

export interface JamaTreeNode {
  id: number;
  name: string;
  document_key: string;
  item_type: number;
  item_type_display: string;
  parent_id: number | null;
  has_children: boolean;
  level: number;
  section_label: string;
  children: JamaTreeNode[];
}

export interface JamaComment {
  id: number;
  body?: { text: string };
  createdDate?: string;
  createdBy?: { id: number; username: string; firstName?: string; lastName?: string };
  inReplyTo?: number;
  status?: string;
}

export interface JamaAttachment {
  id: number;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  description?: string;
  lastModifiedDate?: string;
}

export interface JamaTag {
  id: number;
  name: string;
  project?: number;
}

export interface JamaLink {
  id: number;
  url: string;
  description?: string;
}

export interface JamaLockState {
  locked: boolean;
  lockedBy?: { id: number; username: string };
  lastLockedDate?: string;
}

export interface JamaWorkflowTransition {
  id: string;
  action: string;
  newStatus?: number;
}

export interface JamaRelatedItem {
  item_id: number;
  document_key: string;
  name: string;
  relationship_type?: number | null;
  suspect?: boolean;
}

export interface JamaRelationshipType {
  id: number;
  name: string;
  isDefault?: boolean;
}

export interface JamaItemVersion {
  item_id: number;
  version_num: number;
  fields_json: string;
  description_html: string;
  modified_by: string | number | null;
  modified_date: string | null;
  created_date: string | null;
  type: string;
  version_comment: string;
}

export interface JamaSearchResult {
  entity_id: number;
  doc_type: string;
  project_id: number;
  document_key: string;
  name: string;
  snippet: string;
  status: string;
  rank: number;
}

export interface JamaDeepSearchResult {
  item_id: number;
  project_id: number;
  document_key: string;
  name: string;
  description: string;
  item_type: number;
  version: number;
  modified_date: string | null;
  rank: number;
  fields: Record<string, unknown>;
  upstream_items: JamaRelatedItem[];
  downstream_items: JamaRelatedItem[];
}

export interface JamaSyncProgress {
  state: string;
  project_id: number | null;
  project_name: string;
  total_items: number;
  processed_items: number;
  changed_items: number;
  new_items: number;
  deleted_items: number;
  errors: number;
  message: string;
  progress_pct: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface JamaItemType {
  id: number;
  display: string;
  typeKey: string;
  category?: string;
  system?: boolean;
  image?: string;
  fields?: Record<string, unknown>[];
}

export interface JamaPickList {
  id: number;
  name: string;
  description?: string;
}

export interface JamaPickListOption {
  id: number;
  name: string;
  value?: string;
  description?: string;
  default?: boolean;
  active?: boolean;
  sortOrder?: number;
  color?: string;
}

export interface JamaTestPlan {
  id: number;
  project_id: number;
  name: string;
  description: string;
  status: string;
  archived: number;
  fields_json: string;
}

export interface JamaTestCycle {
  id: number;
  test_plan_id: number;
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  fields_json: string;
}

export interface JamaTestRun {
  id: number;
  test_cycle_id: number;
  test_case_id: number | null;
  name: string;
  status: string;
  assigned_to: number | null;
  actual_results: string;
  planned_results: string;
  execution_date: string | null;
  fields_json: string;
}

export interface JamaUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  active?: boolean;
}

export interface JamaBaseline {
  id: number;
  name: string;
  description?: string;
  project: number;
  origin?: string;
  createdDate?: string;
}

export interface JamaRelease {
  id: number;
  name: string;
  description?: string;
  project: number;
  releaseDate?: string;
  archived?: boolean;
}

export interface JamaReview {
  id: number;
  name: string;
  description?: string;
  project?: number;
  status?: string;
  moderator?: { id: number; username: string };
  createdDate?: string;
}

// ============================================================
// Editor Backend Client (mounted at /editor on unified backend)
// ============================================================

/**
 * HTTP client for the Editor Backend REST API.
 * Routes are served under /editor/ on the unified backend (same port).
 */
export class EditorApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? `${getApiBaseUrl()}/editor`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Editor API ${res.status}: ${text || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("/health");
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Drafts ----------

  async saveDraft(
    itemId: number,
    serverVersion: number,
    fieldsJson: string,
    descriptionHtml: string,
    isAutosave = true,
    changeSummary = ""
  ): Promise<EditorDraftSaveResult> {
    return this.request(`/api/drafts/${itemId}`, {
      method: "POST",
      body: JSON.stringify({
        server_version: serverVersion,
        fields_json: fieldsJson,
        description_html: descriptionHtml,
        is_autosave: isAutosave,
        change_summary: changeSummary,
      }),
    });
  }

  async getDrafts(itemId: number): Promise<EditorDraftsResponse> {
    return this.request(`/api/drafts/${itemId}`);
  }

  async getLatestDraft(itemId: number): Promise<EditorDraft> {
    return this.request(`/api/drafts/${itemId}/latest`);
  }

  async getDraft(itemId: number, draftVersion: number): Promise<EditorDraft> {
    return this.request(`/api/drafts/${itemId}/${draftVersion}`);
  }

  async clearDrafts(itemId: number): Promise<{ item_id: number; deleted: number }> {
    return this.request(`/api/drafts/${itemId}`, { method: "DELETE" });
  }

  async getDraftState(itemId: number): Promise<EditorDraftState> {
    return this.request(`/api/drafts/${itemId}/state`);
  }

  async getDirtyItems(): Promise<{ count: number; items: EditorDraftState[] }> {
    return this.request("/api/drafts/dirty");
  }

  // ---------- Undo ----------

  async getUndoStack(itemId: number): Promise<EditorUndoResponse> {
    return this.request(`/api/undo/${itemId}`);
  }

  async pushUndo(
    itemId: number,
    fieldName: string,
    oldValue: string | null,
    newValue: string | null
  ): Promise<{ status: string; item_id: number; field_name: string }> {
    return this.request(`/api/undo/${itemId}`, {
      method: "POST",
      body: JSON.stringify({
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
      }),
    });
  }

  async popUndo(itemId: number): Promise<EditorUndoEntry> {
    return this.request(`/api/undo/${itemId}/pop`, { method: "POST" });
  }

  // ---------- Lock ----------

  async getLock(itemId: number): Promise<JamaLockState> {
    return this.request(`/api/items/${itemId}/lock`);
  }

  async acquireLock(itemId: number): Promise<{ item_id: number; locked: boolean; status: string }> {
    return this.request(`/api/items/${itemId}/lock`, { method: "POST" });
  }

  async releaseLock(itemId: number): Promise<{ item_id: number; locked: boolean; status: string }> {
    return this.request(`/api/items/${itemId}/lock`, { method: "DELETE" });
  }

  // ---------- Push to Jama ----------

  async pushToJama(
    itemId: number,
    fields: Record<string, unknown>,
    expectedVersion?: number
  ): Promise<EditorPushResult> {
    return this.request(`/api/items/${itemId}/push`, {
      method: "POST",
      body: JSON.stringify({
        fields,
        expected_version: expectedVersion,
      }),
    });
  }

  // ---------- Schema ----------

  async getItemTypes(): Promise<{ count: number; itemTypes: JamaItemType[] }> {
    return this.request("/api/schema/itemtypes");
  }

  async getFieldDefinitions(
    itemTypeId: number
  ): Promise<{ itemTypeId: number; count: number; fields: EditorFieldDefinition[] }> {
    return this.request(`/api/schema/itemtypes/${itemTypeId}/fields`);
  }

  async getPickListOptions(
    pickListId: number
  ): Promise<{ pickListId: number; count: number; options: JamaPickListOption[] }> {
    return this.request(`/api/schema/picklists/${pickListId}/options`);
  }

  async getWorkflowTransitions(
    itemId: number
  ): Promise<{ itemId: number; count: number; transitions: JamaWorkflowTransition[] }> {
    return this.request(`/api/schema/workflows/${itemId}`);
  }

  // ---------- Attachments ----------

  async uploadAttachment(
    itemId: number,
    filePath: string,
    fileName: string
  ): Promise<{ attachmentId: number; status: string }> {
    return this.request(`/api/items/${itemId}/attachments`, {
      method: "POST",
      body: JSON.stringify({ file_path: filePath, file_name: fileName }),
    });
  }

  async syncAttachments(
    itemId: number
  ): Promise<{ item_id: number; count: number; attachments: EditorAttachment[] }> {
    return this.request(`/api/items/${itemId}/attachments/sync`);
  }

  async listAttachments(
    itemId: number
  ): Promise<{ item_id: number; count: number; attachments: EditorAttachment[] }> {
    return this.request(`/api/items/${itemId}/attachments/list`);
  }


  async replaceAttachment(
    attachmentId: number,
    filePath: string,
    fileName: string
  ): Promise<{ attachment_id: number; file_name: string }> {
    return this.request(`/api/attachments/${attachmentId}/replace`, {
      method: "PUT",
      body: JSON.stringify({ file_path: filePath, file_name: fileName }),
    });
  }

  async retryPendingUploads(
    itemId?: number
  ): Promise<{ count: number; results: unknown[] }> {
    const url = itemId
      ? `/api/attachments/retry?item_id=${itemId}`
      : "/api/attachments/retry";
    return this.request(url, { method: "POST" });
  }

  async getPendingUploads(
    itemId?: number
  ): Promise<{ count: number; uploads: unknown[] }> {
    const url = itemId
      ? `/api/attachments/pending?item_id=${itemId}`
      : "/api/attachments/pending";
    return this.request(url);
  }

  async getCacheStats(): Promise<EditorCacheStats> {
    return this.request("/api/attachments/cache/stats");
  }

  async clearAttachmentCache(): Promise<{ files_deleted: number; bytes_freed: number }> {
    return this.request("/api/attachments/cache", { method: "DELETE" });
  }

  // ---------- Test Plan Lock ----------

  async getTestPlanLock(planId: number): Promise<JamaLockState> {
    return this.request(`/api/testplans/${planId}/lock`);
  }

  async acquireTestPlanLock(planId: number): Promise<{ plan_id: number; locked: boolean }> {
    return this.request(`/api/testplans/${planId}/lock`, { method: "POST" });
  }

  async releaseTestPlanLock(planId: number): Promise<{ plan_id: number; locked: boolean }> {
    return this.request(`/api/testplans/${planId}/lock`, { method: "DELETE" });
  }

  // ---------- Test Entity Push ----------

  async pushTestPlan(
    planId: number,
    fields: Record<string, unknown>,
    expectedVersion?: number
  ): Promise<TestEntityPushResult> {
    return this.request(`/api/testplans/${planId}/push`, {
      method: "POST",
      body: JSON.stringify({ fields, expected_version: expectedVersion }),
    });
  }

  async pushTestCycle(
    cycleId: number,
    fields: Record<string, unknown>,
    expectedVersion?: number
  ): Promise<TestEntityPushResult> {
    return this.request(`/api/testcycles/${cycleId}/push`, {
      method: "POST",
      body: JSON.stringify({ fields, expected_version: expectedVersion }),
    });
  }

  async pushTestRun(
    runId: number,
    fields: Record<string, unknown>,
    expectedVersion?: number
  ): Promise<TestEntityPushResult> {
    return this.request(`/api/testruns/${runId}/push`, {
      method: "POST",
      body: JSON.stringify({ fields, expected_version: expectedVersion }),
    });
  }

  // ---------- Web Session (JSESSIONID for image downloads) ----------

  async setSessionCookie(jsessionid: string): Promise<{ status: string; valid: boolean; message: string }> {
    return this.request("/api/session/set", {
      method: "POST",
      body: JSON.stringify({ jsessionid }),
    });
  }

  async sessionStatus(): Promise<{ authenticated: boolean; has_cookie: boolean }> {
    return this.request("/api/session/status");
  }

  async clearSession(): Promise<{ status: string }> {
    return this.request("/api/session/clear", { method: "POST" });
  }

  async prefetchStatus(): Promise<{ status: string; message: string }> {
    return this.request("/api/session/prefetch-status");
  }

  async triggerPrefetch(): Promise<{ status: string; message: string }> {
    return this.request("/api/session/prefetch", { method: "POST" });
  }

  async clearImageCache(): Promise<{ files_deleted: number; bytes_freed: number }> {
    return this.request("/api/images/cache", { method: "DELETE" });
  }

  // ---------- Attachment Upload ----------

  async uploadItemAttachment(
    itemId: number,
    filePath: string,
    fileName: string = ""
  ): Promise<{ attachment_id: number; file_name: string; status: string }> {
    return this.request(`/api/items/${itemId}/attachments`, {
      method: "POST",
      body: JSON.stringify({ file_path: filePath, file_name: fileName }),
    });
  }
}

// ---------- Editor Type Definitions ----------

export interface EditorDraft {
  item_id: number;
  draft_version: number;
  server_version: number;
  fields_json: string;
  description_html: string;
  created_at: number;
  is_autosave: number;
  change_summary: string;
}

export interface EditorDraftSaveResult {
  item_id: number;
  draft_version: number;
  status: string;
}

export interface EditorDraftsResponse {
  item_id: number;
  count: number;
  drafts: EditorDraft[];
}

export interface EditorDraftState {
  item_id: number;
  current_draft_version: number;
  server_version_base: number;
  is_dirty: number;
  opened_at: number;
  last_autosave_at: number;
  lock_held: number;
  editor_instance_id: string;
}

export interface EditorUndoEntry {
  id: number;
  item_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  timestamp: number;
}

export interface EditorUndoResponse {
  item_id: number;
  count: number;
  stack: EditorUndoEntry[];
}

export interface EditorPushResult {
  item_id: number;
  version: number;
  status: string;
  item: JamaItem;
}

export interface TestEntityPushResult {
  plan_id?: number;
  cycle_id?: number;
  run_id?: number;
  version: number;
  status: string;
  item?: Record<string, unknown>;
}

export interface EditorFieldDefinition {
  name: string;
  label: string;
  fieldType: string;
  required?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  pickList?: number;
  textType?: string;
}

export interface EditorAttachment {
  id: number;
  item_id: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  description: string;
  jama_url: string;
  local_cached: number;
  local_path: string | null;
  is_image: number;
  is_embedded: number;
  saml_only: number;
  upload_status: string;
  last_accessed_at: number;
  synced_at: number;
}

export interface EditorCacheStats {
  cache_dir: string;
  total_size_bytes: number;
  total_size_mb: number;
  max_size_mb: number;
  file_count: number;
  cached_attachments: number;
  pending_uploads: number;
  usage_pct: number;
}
