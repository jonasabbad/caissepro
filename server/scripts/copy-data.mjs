// Build step: the server reads its catalogues from dist/data at run time (tsc only compiles the .ts files).
import { cpSync } from 'node:fs';

cpSync(new URL('../src/data', import.meta.url), new URL('../dist/data', import.meta.url), { recursive: true });
