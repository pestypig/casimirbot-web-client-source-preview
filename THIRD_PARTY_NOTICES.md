# Dependency and data notices

This source-only snapshot does not vendor third-party library packages or external datasets. The selected code imports packages including React, Vitest, Lucide, Zustand, TanStack Query, Three.js, Zod, and others; resolve and review their upstream license terms when integrating. Some map UI source links to © OpenStreetMap contributors and ODbL attribution; no OpenStreetMap dataset is bundled in this snapshot. Other external map and scientific services or data retain their own terms.

## WarpFactory unit-system inspiration

`client/src/utils/units.js` identifies the
[WarpFactory `Units/` directory](https://github.com/NerdsWithAttitudes/WarpFactory/tree/main/Units)
as its basis. WarpFactory is MIT-licensed. The unit definitions here are
JavaScript and are not a byte-for-byte copy of the upstream MATLAB files;
retain this attribution and upstream license when distributing the source.

```text
MIT License

Copyright (c) 2023 Christopher Helmerich & Jared Fuchs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## shadcn/ui component source

Some source under `client/src/components/ui/` is generated or adapted from the [shadcn/ui registry](https://github.com/shadcn-ui/ui). The included `button.tsx` and `alert.tsx` match the official default registry component content after line-ending normalization. This upstream material is MIT-licensed. Retain the following [upstream license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) with copies or substantial portions of that material:

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
