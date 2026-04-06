/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

export function normalizeLatex(text) {
  let t = text;

  // 1. Convert align / align* to aligned (do this first)
  t = t.replace(
    /\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g,
    (_, body) => `\n$$\n\\begin{aligned}${body}\\end{aligned}\n$$\n`
  );

  // 2. Fix incorrect line breaks inside array environments
  t = t.replace(/\\begin\{array\}([\s\S]*?)\\end\{array\}/g, (full) =>
    full.replace(/([^\\])\\(?=\s*\\hline)/g, '$1\\\\')
  );

  // 3. Block-level math delimiters
  t = t.replace(/\\\[(.*?)\\\]/gs, (_, m) => `\n$$\n${m}\n$$\n`);

  // 4. Inline math delimiters
  t = t.replace(/\\\((.*?)\\\)/gs, (_, m) => `$${m}$`);

  return t;
}

export async function renderMathMarkdown(text) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeKatex, {
      throwOnError: false,
      strict: false,
    })
    .use(rehypeStringify)
    .process(text);

  return String(file);
}
