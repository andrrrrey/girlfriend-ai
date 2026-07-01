"use client";

/**
 * WYSIWYG-редактор тела записи блога на Tiptap.
 * Тулбар: форматирование текста, заголовки, списки, цитата, ссылка, выбор
 * шрифта и вставка изображения (грузится через admin.uploadOptionImage,
 * URL строится через streamUrlForKey — тот же путь, что и у остальных картинок).
 * Значение отдаётся наверх как HTML (onChange).
 */

import React, { useCallback, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import { admin, streamUrlForKey } from "../../../lib/api";

const FONTS: { label: string; value: string }[] = [
  { label: "По умолчанию", value: "" },
  { label: "Sans (Syne)", value: "'Syne', sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "'Courier New', monospace" },
];

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        minWidth: 30,
        height: 30,
        padding: "0 8px",
        borderRadius: 4,
        border: "1px solid #313131",
        background: active ? "#f95bad" : "#1e1e1e",
        color: active ? "#fff" : "#c9c9c9",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'Syne', sans-serif",
      }}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const addImage = useCallback(
    async (file: File) => {
      try {
        const { fullKey } = await admin.uploadOptionImage(file);
        const url = streamUrlForKey(fullKey, { w: 1080 });
        if (url) editor.chain().focus().setImage({ src: url }).run();
      } catch {
        alert("Не удалось загрузить изображение");
      }
    },
    [editor],
  );

  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL ссылки", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: 8,
        borderBottom: "1px solid #313131",
        background: "#161616",
      }}
    >
      <ToolbarButton title="Жирный" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>B</b>
      </ToolbarButton>
      <ToolbarButton title="Курсив" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <i>I</i>
      </ToolbarButton>
      <ToolbarButton title="Подчёркнутый" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton title="Заголовок H2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton title="Заголовок H3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>
      <ToolbarButton title="Маркированный список" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        • List
      </ToolbarButton>
      <ToolbarButton title="Нумерованный список" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1. List
      </ToolbarButton>
      <ToolbarButton title="Цитата" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        &ldquo; &rdquo;
      </ToolbarButton>
      <ToolbarButton title="Ссылка" active={editor.isActive("link")} onClick={setLink}>
        🔗
      </ToolbarButton>

      <select
        title="Шрифт"
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        style={{
          height: 30,
          borderRadius: 4,
          border: "1px solid #313131",
          background: "#1e1e1e",
          color: "#c9c9c9",
          fontSize: 12,
          fontFamily: "'Syne', sans-serif",
          padding: "0 6px",
        }}
      >
        {FONTS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <ToolbarButton title="Вставить изображение" onClick={() => fileRef.current?.click()}>
        🖼 Изобр.
      </ToolbarButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addImage(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function BlogEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    // Next SSR: не рендерим сразу, чтобы избежать несовпадения гидрации.
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) {
    return (
      <div style={{ border: "1px solid #313131", borderRadius: 4, minHeight: 320, background: "#1e1e1e" }} />
    );
  }

  return (
    <div style={{ border: "1px solid #313131", borderRadius: 4, overflow: "hidden", background: "#1e1e1e" }}>
      <style>{editorCss}</style>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="blog-editor-content" />
    </div>
  );
}

const editorCss = `
  .blog-editor-content .ProseMirror {
    min-height: 320px;
    padding: 16px;
    color: #e6e6e6;
    font-size: 15px;
    line-height: 1.7;
    outline: none;
    font-family: 'Syne', sans-serif;
  }
  .blog-editor-content .ProseMirror:focus { outline: none; }
  .blog-editor-content .ProseMirror h2 { font-size: 24px; font-weight: 700; color: #fff; margin: 18px 0 10px; }
  .blog-editor-content .ProseMirror h3 { font-size: 19px; font-weight: 700; color: #fff; margin: 16px 0 8px; }
  .blog-editor-content .ProseMirror p { margin: 0 0 12px; }
  .blog-editor-content .ProseMirror ul, .blog-editor-content .ProseMirror ol { padding-left: 22px; margin: 0 0 12px; }
  .blog-editor-content .ProseMirror blockquote { border-left: 3px solid #f95bad; margin: 0 0 12px; padding-left: 14px; color: #b9b9b9; }
  .blog-editor-content .ProseMirror a { color: #ff99ce; text-decoration: underline; }
  .blog-editor-content .ProseMirror img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; }
  .blog-editor-content .ProseMirror p.is-editor-empty:first-child::before {
    content: "Напишите текст записи..."; color: #5a5a5a; float: left; height: 0; pointer-events: none;
  }
`;
