// tests/helpers/where-matcher.ts — Évalue un `where` de Prisma sur des lignes en mémoire
// Les requêtes SQL ne sont pas exécutées (limite assumée, architecture §7) : pour les bornes d'un créneau,
// on rejoue ici la clause sur de vraies dates. Opérateurs couverts : égalité, null, lt, lte, gt, gte, not, in,
// et OR / AND. Comme en SQL, une comparaison avec null est fausse.

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const isDate = (value: unknown): value is Date => value instanceof Date;
const same = (a: unknown, b: unknown) => (isDate(a) && isDate(b) ? a.getTime() === b.getTime() : a === b);
const compare = (a: unknown, b: unknown) => (isDate(a) && isDate(b) ? a.getTime() - b.getTime() : (a as number) - (b as number));

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object" || isDate(condition)) return same(value, condition);

  return Object.entries(condition as Row).every(([operator, arg]) => {
    if (operator === "not") return !matchesCondition(value, arg);
    if (operator === "in") return (arg as unknown[]).some((item) => same(value, item));
    if (value === null || value === undefined) return false;
    switch (operator) {
      case "lt":
        return compare(value, arg) < 0;
      case "lte":
        return compare(value, arg) <= 0;
      case "gt":
        return compare(value, arg) > 0;
      case "gte":
        return compare(value, arg) >= 0;
      default:
        throw new Error(`Opérateur non géré par le test : ${operator}`);
    }
  });
}

export function matchesWhere(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Where[]).some((branch) => matchesWhere(row, branch));
    if (key === "AND") return (condition as Where[]).every((branch) => matchesWhere(row, branch));
    return matchesCondition(row[key], condition);
  });
}

/** Une implémentation de `findFirst` ou `findMany` qui filtre `rows` par le `where` reçu. */
export const findFirstIn = (rows: Row[]) => async ({ where }: { where?: Where }) =>
  rows.find((row) => matchesWhere(row, where)) ?? null;
export const findManyIn = (rows: Row[]) => async ({ where }: { where?: Where } = {}) =>
  rows.filter((row) => matchesWhere(row, where));
