#!/usr/bin/env python3
"""Patch the vendored pdf.js worker (src/lib/pdf-worker/pdf.worker.min.mjs).

Turbopack (Next 16's default bundler) fails the whole `next build` on the
worker's single fully-dynamic `import()` inside JpxImage's OpenJPEG loader:

    Module not found: Can't resolve '.'
      ...await import(/*webpackIgnore: true*/ /*@vite-ignore*/ t)...

That import loads `openjpeg_nowasm_fallback.js` (JPEG-2000 decoding) at
runtime from a computed URL — irrelevant for Cortex's text extraction, and
already wrapped in a try/catch that degrades gracefully. This script replaces
the dynamic import with a synchronous throw so the bundler sees nothing
dynamic, while runtime behavior on failure stays identical (warn + null
module). Re-run this script after every re-vendor of the worker.
"""
import pathlib
import sys

TARGET = (
    'try{r=(await import(\n'
    '/*webpackIgnore: true*/\n'
    '/*@vite-ignore*/\n'
    't)).default()}catch(e){warn(`JpxImage#getJsModule: ${e}`)}e(r)'
)
REPLACEMENT = (
    'try{throw new Error("dynamic module loading is disabled in this bundled '
    'worker (JpxImage/OpenJPEG is unused by Cortex)")}catch(e){warn('
    '`JpxImage#getJsModule: ${e}`)}e(r)'
)

path = pathlib.Path(__file__).resolve().parent.parent / 'src/lib/pdf-worker/pdf.worker.min.mjs'
src = path.read_text(encoding='utf8')

if REPLACEMENT in src and TARGET not in src:
    print('Already patched — nothing to do.')
    sys.exit(0)

count = src.count(TARGET)
if count != 1:
    print(f'ERROR: expected exactly 1 occurrence of the dynamic import, found {count}.')
    sys.exit(1)

path.write_text(src.replace(TARGET, REPLACEMENT), encoding='utf8')
print('Patched: dynamic import() in JpxImage#getJsModule replaced with a graceful throw.')
print('Remaining "import(" occurrences:', src.count('import(') - 1)  # -1 for the one just removed
