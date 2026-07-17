import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['cjs'],
  target: 'node18',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
});
