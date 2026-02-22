import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: [
    /^@giulio-leone\//,
    '@prisma/client',
    /^@prisma\/client/,
    /^node:/,
  ],
  noExternal: [],
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
});
