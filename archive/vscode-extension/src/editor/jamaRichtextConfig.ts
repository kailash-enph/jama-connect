/**
 * Jama rich-text HTML configuration — TypeScript constant (NOT in database).
 *
 * Defines which HTML tags, attributes, and styles are allowed in
 * Jama item description fields. Used by the TipTap paste sanitizer
 * and the form builder to identify rich-text fields.
 */
export const JAMA_RICHTEXT_CONFIG = {
  allowedTags: [
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "strike", "sub", "sup",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    "a", "img", "br", "hr",
    "blockquote", "pre", "code",
    "span", "div",
  ],
  blockedTags: [
    "script", "iframe", "object", "embed",
    "form", "input", "button", "select", "textarea",
  ],
  allowedAttributes: {
    a: ["href", "target"],
    img: ["src", "alt", "width", "height", "style"],
    td: ["colspan", "rowspan", "style"],
    th: ["colspan", "rowspan", "style"],
    span: ["style"],
    div: ["style"],
    table: ["style", "border", "cellpadding", "cellspacing"],
  } as Record<string, string[]>,
  allowedStyles: [
    "color", "background-color", "font-size", "text-align",
    "width", "border", "border-collapse", "padding", "margin",
  ],
  imageEmbedPattern: "/rest/v1/attachments/{id}/file",
  maxImageSizeBytes: 10 * 1024 * 1024,  // 10 MB
  maxImageDimensions: { width: 4096, height: 4096 },
  maxImagesPerItem: 50,
} as const;

/** Field types that use the TipTap rich-text editor. */
export const RICHTEXT_FIELD_TYPES = ["RICHTEXT", "DOCUMENT"] as const;

/** Check if a field type should render as rich-text. */
export function isRichTextField(fieldType: string): boolean {
  return RICHTEXT_FIELD_TYPES.includes(fieldType as typeof RICHTEXT_FIELD_TYPES[number]);
}
