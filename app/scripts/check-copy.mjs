// Fails when UI copy (JSX text and string literals in pages and components) uses words the product never says.
// Uses the TypeScript parser already in devDependencies, so comments and identifiers are never flagged.
// A non-copy literal (SDK config) is allowed with a `// copy-ok: <why>` comment on its line.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const BANNED = /\b(wallet|crypto|token|gas|transaction|blockchain|stake|address|default)s?\b/gi;
const root = new URL("..", import.meta.url).pathname;

function* walk(dir, match) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, match);
    else if (match(e.name)) yield p;
  }
}

const files = [
  ...walk(join(root, "app"), (n) => n === "page.tsx"),
  ...walk(join(root, "components"), (n) => n.endsWith(".tsx")),
];

const COPY = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

let hits = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    const isModulePath = ts.isImportDeclaration(node.parent ?? node) || ts.isExportDeclaration(node.parent ?? node);
    if (COPY.has(node.kind) && !isModulePath) {
      for (const m of node.getText(src).matchAll(BANNED)) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart(src) + m.index);
        if (lines[line].includes("// copy-ok")) continue;
        console.log(`${relative(root, file)}:${line + 1} ${m[0]}`);
        hits++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

if (hits) process.exit(1);
console.log(`copy ok (${files.length} files)`);
