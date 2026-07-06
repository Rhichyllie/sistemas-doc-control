import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const errors = [];
const warnings = [];
const successes = [];

const requiredFiles = [
  ".editorconfig",
  ".prettierignore",
  ".gitattributes",
  "docs/architecture/REPOSITORY_ARCHITECTURE.md",
  "docs/architecture/MODULE_BOUNDARIES.md",
  "docs/architecture/STRUCTURAL_CLEANUP_PLAN.md",
  "docs/architecture/PHASE_ROADMAP.md",
  "docs/architecture/ROUTING_CONVENTIONS.md",
  "scripts/repo-doctor.mjs",
  "scripts/validate-structure.mjs",
  "src/app/navigation/navigation-items.ts",
  "src/app/navigation/navigation-permissions.ts",
];

for (const file of requiredFiles) {
  if (existsSync(resolve(root, file))) {
    successes.push(`Arquivo obrigatório presente: ${file}`);
  } else {
    errors.push(`Arquivo obrigatório ausente: ${file}`);
  }
}

const packagePath = resolve(root, "package.json");
if (!existsSync(packagePath)) {
  errors.push("package.json ausente.");
} else {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const expectedScripts = {
    typecheck: "tsc --noEmit",
    "repo:doctor": "node scripts/repo-doctor.mjs",
    "validate:structure": "node scripts/validate-structure.mjs",
    verify:
      "bun run typecheck && bun run validate:structure && bun run build",
  };

  for (const [name, expected] of Object.entries(expectedScripts)) {
    if (packageJson.scripts?.[name] === expected) {
      successes.push(`Script configurado: ${name}`);
    } else {
      errors.push(`Script ausente ou divergente: ${name}`);
    }
  }
}

const prettierIgnorePath = resolve(root, ".prettierignore");
if (existsSync(prettierIgnorePath)) {
  const prettierIgnore = readFileSync(prettierIgnorePath, "utf8");
  if (!prettierIgnore.includes("src/routeTree.gen.ts")) {
    errors.push("src/routeTree.gen.ts precisa constar em .prettierignore.");
  }
}

const appLayoutPath = resolve(root, "src/components/app-layout.tsx");
if (existsSync(appLayoutPath)) {
  const content = readFileSync(appLayoutPath, "utf8");
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > 450) {
    warnings.push(
      `AppLayout ainda tem ${lines.length} linhas; a decomposição visual pertence ao R2.`,
    );
  }
}

const staged = spawnSync("git", ["diff", "--cached", "--name-only"], {
  cwd: root,
  encoding: "utf8",
});
if (staged.status === 0) {
  const stagedFiles = staged.stdout.split(/\r?\n/).filter(Boolean);
  if (stagedFiles.includes("src/routeTree.gen.ts")) {
    warnings.push(
      "src/routeTree.gen.ts está staged. Confirme que foi regenerado, não editado manualmente.",
    );
  }
} else {
  warnings.push("Não foi possível verificar arquivos staged no Git.");
}

console.log("TRAMITA Structural Validation");
console.log("=============================");
for (const message of successes) console.log(`[OK] ${message}`);
for (const message of warnings) console.log(`[AVISO] ${message}`);
for (const message of errors) console.error(`[ERRO] ${message}`);
console.log("");

if (errors.length > 0) {
  console.error(`Falha: ${errors.length} guardrail(s) obrigatório(s) ausente(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `Estrutura válida com ${warnings.length} aviso(s) não bloqueante(s).`,
  );
}
