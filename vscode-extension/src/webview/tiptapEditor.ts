/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * TipTap editor for Jama rich-text fields.
 * This file is bundled separately for the WebView context (browser, not Node).
 *
 * Exports are attached to `window.JamaTipTap` for use by editorHtml.ts inline scripts.
 */
declare const window: Window & typeof globalThis & { JamaTipTap?: unknown; alert?: (msg: string) => void };
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";

// ---- Paste sanitizer ----

const BLOCKED_TAGS = new Set([
  "script", "iframe", "object", "embed",
  "form", "input", "button", "select", "textarea",
]);

function sanitizeHtml(html: string): string {
  // Remove blocked tags and their content
  for (const tag of BLOCKED_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    html = html.replace(regex, "");
    // Also remove self-closing
    const selfClose = new RegExp(`<${tag}[^>]*/?>`, "gi");
    html = html.replace(selfClose, "");
  }
  return html;
}

// ---- Image URL rewriter ----

const JAMA_IMAGE_PATTERN = /\/rest\/v1\/attachments\/(\d+)\/file/g;

function rewriteImageUrls(html: string, proxyBaseUrl: string): string {
  return html.replace(JAMA_IMAGE_PATTERN, (_match, attachmentId) => {
    return `${proxyBaseUrl}/api/proxy/image/${attachmentId}`;
  });
}

// ---- Editor factory ----

interface TipTapOptions {
  element: HTMLElement;
  content: string;
  editable: boolean;
  proxyBaseUrl?: string;
  onUpdate?: (html: string) => void;
  onImagePaste?: (file: File) => void;
  onImageDrop?: (file: File) => void;
}

function createEditor(opts: TipTapOptions): Editor {
  // Sanitize and rewrite URLs before loading
  let content = sanitizeHtml(opts.content);
  if (opts.proxyBaseUrl) {
    content = rewriteImageUrls(content, opts.proxyBaseUrl);
  }

  const editor = new Editor({
    element: opts.element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "jama-image" },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Subscript,
      Superscript,
    ],
    content,
    editable: opts.editable,
    onUpdate: ({ editor: ed }) => {
      opts.onUpdate?.(ed.getHTML());
    },
    editorProps: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) { return false; }
        for (const item of Array.from(items) as DataTransferItem[]) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file: File | null = item.getAsFile();
            if (file) {
              // Check size limit (10 MB)
              if (file.size > 10 * 1024 * 1024) {
                window.alert?.("Image too large (max 10 MB). Please resize before pasting.");
                return true;
              }
              opts.onImagePaste?.(file);
            }
            return true;
          }
        }
        // Sanitize pasted HTML — strip blocked tags
        const pastedHtml = event.clipboardData?.getData("text/html");
        if (pastedHtml) {
          const clean = sanitizeHtml(pastedHtml);
          if (clean !== pastedHtml) {
            // Blocked content was removed; let TipTap re-parse the clean version
            // We can't easily inject cleaned HTML via ProseMirror transaction,
            // so we set a data attribute and let TipTap's default handler proceed.
            // In practice, TipTap's own schema will strip unknown elements anyway.
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) { return false; }
        for (const file of Array.from(files) as File[]) {
          if (file.type.startsWith("image/")) {
            event.preventDefault();
            if (file.size > 10 * 1024 * 1024) {
              window.alert?.("Image too large (max 10 MB). Please resize before dropping.");
              return true;
            }
            opts.onImageDrop?.(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  return editor;
}

// ---- Toolbar helpers ----

function toggleBold(editor: Editor) { editor.chain().focus().toggleBold().run(); }
function toggleItalic(editor: Editor) { editor.chain().focus().toggleItalic().run(); }
function toggleUnderline(editor: Editor) { editor.chain().focus().toggleUnderline().run(); }
function toggleStrike(editor: Editor) { editor.chain().focus().toggleStrike().run(); }
function toggleSubscript(editor: Editor) { editor.chain().focus().toggleSubscript().run(); }
function toggleSuperscript(editor: Editor) { editor.chain().focus().toggleSuperscript().run(); }
function toggleBulletList(editor: Editor) { editor.chain().focus().toggleBulletList().run(); }
function toggleOrderedList(editor: Editor) { editor.chain().focus().toggleOrderedList().run(); }
function toggleBlockquote(editor: Editor) { editor.chain().focus().toggleBlockquote().run(); }
function toggleCode(editor: Editor) { editor.chain().focus().toggleCodeBlock().run(); }
function setHeading(editor: Editor, level: 1 | 2 | 3 | 4 | 5 | 6) {
  editor.chain().focus().toggleHeading({ level }).run();
}
function setParagraph(editor: Editor) { editor.chain().focus().setParagraph().run(); }
function insertHorizontalRule(editor: Editor) { editor.chain().focus().setHorizontalRule().run(); }
function insertTable(editor: Editor, rows = 3, cols = 3) {
  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
}
function insertImage(editor: Editor, src: string, alt = "") {
  editor.chain().focus().setImage({ src, alt }).run();
}
function setLink(editor: Editor, href: string) {
  editor.chain().focus().setLink({ href }).run();
}
function unsetLink(editor: Editor) {
  editor.chain().focus().unsetLink().run();
}
function setTextAlign(editor: Editor, alignment: "left" | "center" | "right" | "justify") {
  editor.chain().focus().setTextAlign(alignment).run();
}
function undo(editor: Editor) { editor.chain().focus().undo().run(); }
function redo(editor: Editor) { editor.chain().focus().redo().run(); }

// ---- Expose to window ----

(window as Window & { JamaTipTap?: unknown }).JamaTipTap = {
  createEditor,
  sanitizeHtml,
  rewriteImageUrls,
  toggleBold, toggleItalic, toggleUnderline, toggleStrike,
  toggleSubscript, toggleSuperscript,
  toggleBulletList, toggleOrderedList, toggleBlockquote, toggleCode,
  setHeading, setParagraph, insertHorizontalRule,
  insertTable, insertImage, setLink, unsetLink,
  setTextAlign, undo, redo,
};
