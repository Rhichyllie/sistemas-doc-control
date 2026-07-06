import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "dist-ssr",
  "build",
  "out",
  ".output",
  "release",
  "coverage",
  ".git",
  ".tanstack",
]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
]);

function normalize(filePath) {
  return relative(root, filePath).split(sep).join("/");
}

function extensionOf(filePath) {
  const name = filePath.split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function walk(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function countLines(filePath) {
  const content = readFileSync(filePath, "utf8");
  if (!content) return 0;
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

const files = walk(root);
const normalizedFiles = files.map(normalize);
const fileSet = new Set(normalizedFiles);
const areas = {
  routes: "src/routes/",
  components: "src/components/",
  hooks: "src/hooks/",
  lib: "src/lib/",
  contexts: "src/contexts/",
  docs: "docs/",
  migrations: "supabase/migrations/",
};

console.log("TRAMITA Repository Doctor");
console.log("=========================");
console.log(`Raiz: ${root}`);
console.log("");
console.log("Arquivos por área");

for (const [area, prefix] of Object.entries(areas)) {
  const count = normalizedFiles.filter((file) => file.startsWith(prefix)).length;
  console.log(`- ${area}: ${count}`);
}

const largeFiles = files
  .map((filePath) => ({
    path: normalize(filePath),
    lines: textExtensions.has(extensionOf(normalize(filePath)))
      ? countLines(filePath)
      : 0,
  }))
  .filter((file) => file.lines > 450)
  .sort((a, b) => b.lines - a.lines);

console.log("");
console.log("Arquivos com mais de 450 linhas");
if (largeFiles.length === 0) {
  console.log("- Nenhum.");
} else {
  for (const file of largeFiles) {
    console.log(`- ${file.path}: ${file.lines} linhas`);
  }
}

const routePairs = [
  {
    label: "documents / documentos",
    english: ["src/routes/authenticated/documents.tsx"],
    portuguesePrefix: "src/routes/authenticated/documentos/",
  },
  {
    label: "projects / projetos",
    english: ["src/routes/authenticated/projects.tsx"],
    portuguesePrefix: "src/routes/authenticated/projetos",
  },
  {
    label: "dashboard / Home",
    english: ["src/routes/authenticated/dashboard.tsx"],
    portuguesePrefix: "src/components/dashboard/OperationalHome",
  },
  {
    label: "schema-doctor / configurações/diagnóstico",
    english: ["src/routes/authenticated/schema-doctor.tsx"],
    portuguesePrefix: "src/routes/authenticated/configuracoes/diagnostico",
  },
];

console.log("");
console.log("Convivência de nomes e rotas");
for (const pair of routePairs) {
  const hasEnglish = pair.english.some((file) => fileSet.has(file));
  const hasPortuguese = normalizedFiles.some((file) =>
    file.startsWith(pair.portuguesePrefix),
  );
  const status = hasEnglish && hasPortuguese ? "ATENÇÃO" : "OK";
  console.log(`- [${status}] ${pair.label}`);
}

const routeTree = "src/routeTree.gen.ts";
console.log("");
console.log(
  fileSet.has(routeTree)
    ? `AVISO: ${routeTree} é gerado pelo TanStack Router; não edite manualmente.`
    : `AVISO: ${routeTree} não foi encontrado; confirme a geração de rotas.`,
);

const appLayoutPath = resolve(root, "src/components/app-layout.tsx");
const appLayoutLines = statSync(appLayoutPath).isFile()
  ? countLines(appLayoutPath)
  : 0;
console.log(
  appLayoutLines > 450
    ? `AVISO: AppLayout tem ${appLayoutLines} linhas e ainda precisa de decomposição gradual.`
    : `OK: AppLayout tem ${appLayoutLines} linhas.`,
);

console.log("");
console.log("Próximos refactors recomendados");
console.log("- R2: separar shell, sidebar, topbar e diálogos do AppLayout.");
console.log("- R3: organizar novos códigos por domínio sem mover módulos estáveis em massa.");
console.log("- R4: centralizar contratos Supabase, formatters e utilitários duplicados.");
console.log("- Preservar rotas legadas até existir plano explícito de redirecionamento.");
console.log("- Manter migrations imutáveis depois de aplicadas e o SQL remoto manual.");
