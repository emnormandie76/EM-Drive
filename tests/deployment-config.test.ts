// tests/deployment-config.test.ts — Configuration de la mise en ligne (étape 4) : région des fonctions (D46),
// intégration continue sans secret et sans accès à la base (D42, D30), variables nommées dans .env.example (D6).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/** Les fichiers de code qui peuvent lire une variable d'environnement (hors client Prisma généré). */
function codeFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (path.replaceAll("\\", "/") === "src/generated") return [];
    if (statSync(join(ROOT, path)).isDirectory()) return codeFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("D46 : région des fonctions Vercel", () => {
  it("vercel.json fixe fra1, à côté de la base (aws-eu-central-1), et ne porte aucune variable", () => {
    const config = JSON.parse(read("vercel.json"));
    expect(config.regions).toEqual(["fra1"]);
    expect(config).not.toHaveProperty("env");
    expect(config).not.toHaveProperty("build");
  });
});

describe("D42 : intégration continue", () => {
  const workflowPath = ".github/workflows/ci.yml";

  it("le workflow existe", () => {
    expect(existsSync(join(ROOT, workflowPath))).toBe(true);
  });

  it("tests, lint, build puis tsc (piège 14), sur les push de dev-claude et main", () => {
    const workflow = read(workflowPath);
    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\[\s*dev-claude,\s*main\s*\]/);
    const steps = ["npm ci", "npm test", "npm run lint", "npm run build", "npx tsc --noEmit"];
    const positions = steps.map((step) => workflow.indexOf(`run: ${step}`));
    for (const [i, position] of positions.entries()) expect(position, steps[i]).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("aucun secret, et une DATABASE_URL factice : le build ne peut pas lire une base (D30)", () => {
    const workflow = read(workflowPath);
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).toContain('DATABASE_URL: "postgresql://build:build@build.invalid:5432/build"');
    expect(workflow).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });
});

describe("variables nommées dans .env.example", () => {
  it("chaque variable de .env.example est lue par le code (D6 : plus de MAIL_SENDER_ADDRESS)", () => {
    const names = [...read(".env.example").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(0);
    const code = [...codeFiles("src"), ...codeFiles("prisma"), "prisma.config.ts", "next.config.ts"]
      .map(read)
      .join("\n");
    for (const name of names) {
      expect(code, `${name} n'est lue nulle part`).toMatch(new RegExp(`process\\.env\\.${name}\\b|env\\("${name}"\\)`));
    }
  });
});
