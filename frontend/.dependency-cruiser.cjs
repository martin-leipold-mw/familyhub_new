/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make the module graph impossible to reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan modules are usually dead code — or a missing wire-up.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)[.][^/]+[.](js|cjs|mjs|ts)$', // dot files
          '[.]d[.]ts$', // type declarations
          '(^|/)(main|vite-env)[.][^/]+$', // entry points
          '(^|/)src/test/setup[.]ts$', // vitest setup, wired via vite.config
          'src/api/generated/', // machine-generated client
        ],
      },
      to: {},
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: 'Production code must never depend on test code.',
      from: { pathNot: ['[.](test|spec)[.][jt]sx?$', '(^|/)src/test/'] },
      to: { path: ['[.](test|spec)[.][jt]sx?$', '(^|/)src/test/'] },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Production code must not import a devDependency (ships only in tests/build).',
      from: { path: '^src', pathNot: ['[.](test|spec)[.][jt]sx?$', '(^|/)src/test/'] },
      to: { dependencyTypes: ['npm-dev'], pathNot: ['node_modules/@types/'] },
    },
    {
      name: 'no-phantom-deps',
      severity: 'error',
      comment: 'Imported npm module is not declared in package.json.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown', 'unknown', 'undetermined'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
