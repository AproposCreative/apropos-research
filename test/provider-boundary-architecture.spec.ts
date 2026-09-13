import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

// Source-only regression check. No application import, credentials or network.
// This complements transport/ledger tests, not a claim about external services.
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.next', 'dist'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

it('keeps runtime OpenAI SDK access behind the budget transport', () => {
  const violations: string[] = [];
  for (const path of ['app', 'lib', 'scripts', 'services'].flatMap(files)) {
    const name = relative(process.cwd(), path).replaceAll('\\', '/');
    if (name === 'lib/liv/cost-openai.ts') continue;
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
        /^openai(?:\/|$)/.test(node.moduleSpecifier.text)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) return;
        const bindings = clause?.namedBindings;
        // APIError is used only for error classification; it cannot create calls.
        const safeNamed = bindings && ts.isNamedImports(bindings) && bindings.elements.every(element =>
          element.isTypeOnly || (element.propertyName || element.name).text === 'APIError');
        if (clause?.name || !safeNamed) violations.push(`${name}: runtime SDK import`);
      }
      if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
        /^openai(?:\/|$)/.test(node.arguments[0].text) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        violations.push(`${name}: dynamic SDK import`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(violations).toEqual([]);
});
