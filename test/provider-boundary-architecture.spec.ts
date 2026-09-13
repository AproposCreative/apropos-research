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

function runtimeImports(text: string, name: string): string[] {
    const violations: string[] = [];
    const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
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
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
        /^openai(?:\/|$)/.test(node.moduleSpecifier.text) && !node.isTypeOnly) {
        const bindings = node.exportClause;
        const safeNamed = bindings && ts.isNamedExports(bindings) && bindings.elements.every(element =>
          element.isTypeOnly || (element.propertyName || element.name).text === 'APIError');
        if (!safeNamed) violations.push(`${name}: runtime SDK re-export`);
      }
      if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly &&
        ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression &&
        ts.isStringLiteral(node.moduleReference.expression) && /^openai(?:\/|$)/.test(node.moduleReference.expression.text)) {
        violations.push(`${name}: runtime SDK import-equals`);
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
    return violations;
}

it.each([
  "import OpenAI from 'openai'",
  "export { default as Client } from 'openai'",
  "export * from 'openai'",
  "export * as SDK from 'openai'",
  "import SDK = require('openai')",
  "const SDK = require('openai')",
  "const SDK = import('openai')",
])('detects an unguarded provider dependency: %s', text => {
  expect(runtimeImports(text, 'fixture.ts')).toHaveLength(1);
});

it.each([
  "import type OpenAI from 'openai'",
  "export type { ClientOptions } from 'openai'",
  "export { type ClientOptions, APIError } from 'openai'",
  "import { APIError as ProviderError, type ClientOptions } from 'openai'",
])('allows types and error classification: %s', text => {
  expect(runtimeImports(text, 'fixture.ts')).toEqual([]);
});

it('keeps runtime OpenAI SDK access behind the budget transport', () => {
  const violations: string[] = [];
  for (const path of [...['app', 'lib', 'scripts', 'services', 'src', 'components'].flatMap(files), 'proxy.ts', 'instrumentation.ts']) {
    const name = relative(process.cwd(), path).replaceAll('\\', '/');
    if (name === 'lib/liv/cost-openai.ts') continue;
    violations.push(...runtimeImports(readFileSync(path, 'utf8'), name));
  }
  expect(violations).toEqual([]);
});
