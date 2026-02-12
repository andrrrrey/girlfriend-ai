import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

// Simple HTML -> JSX converter focused on class/style/for.
// Usage: node scripts/convert-html-to-jsx.mjs input.html output.tsx

const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error("Usage: node scripts/convert-html-to-jsx.mjs <input.html> <output.tsx>");
  process.exit(1);
}

const html = fs.readFileSync(inFile, "utf8");
const dom = new JSDOM(html);
const doc = dom.window.document;

const style = doc.querySelector("style")?.textContent ?? "";
const body = doc.body;

const voidTags = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

function camel(prop) {
  if (prop.startsWith("--")) return prop;
  return prop.replace(/-([a-z])/g, (_,c) => c.toUpperCase());
}

function styleToObj(styleStr) {
  const obj = [];
  styleStr.split(";").forEach(part => {
    const p = part.trim();
    if (!p) return;
    const idx = p.indexOf(":");
    if (idx === -1) return;
    const k = camel(p.slice(0, idx).trim());
    const v = p.slice(idx+1).trim();
    const key = k.startsWith("--") ? JSON.stringify(k) : k;
    obj.push(`${key}: ${JSON.stringify(v)}`);
  });
  return obj.length ? `style={{ { ${obj.join(", ")} } }}` : "";
}

function attrs(el) {
  const parts = [];
  for (const a of Array.from(el.attributes)) {
    let name = a.name;
    const value = a.value;
    if (name === "class") name = "className";
    if (name === "for") name = "htmlFor";
    if (name === "style") {
      const s = styleToObj(value);
      if (s) parts.push(s);
      continue;
    }
    parts.push(`${name}=${JSON.stringify(value)}`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function toJsx(node, depth=0) {
  const pad = "  ".repeat(depth);
  if (node.nodeType === 3) {
    const t = node.textContent ?? "";
    if (!t.trim()) return "";
    return pad + t;
  }
  if (node.nodeType !== 1) return "";
  const el = node;
  const tag = el.tagName.toLowerCase();
  const a = attrs(el);
  const children = Array.from(el.childNodes).map(n => toJsx(n, depth+1)).filter(Boolean);
  if (voidTags.has(tag)) return `${pad}<${tag}${a} />`;
  if (!children.length) return `${pad}<${tag}${a}></${tag}>`;
  return `${pad}<${tag}${a}>\n${children.join("\n")}\n${pad}</${tag}>`;
}

const jsx = Array.from(body.childNodes).map(n => toJsx(n, 1)).filter(Boolean).join("\n");

const out = `export const dynamic = "force-static";
const css = \`${style.replaceAll("`","\\`")}\`;

export default function HomePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
${jsx}
    </>
  );
}
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out, "utf8");
console.log("Wrote", outFile);
