import "server-only";

import { remark } from "remark";
import html from "remark-html";

const processor = remark().use(html, { sanitize: false });

export const markdownToHtml = async (markdown?: string | null): Promise<string> => {
  if (!markdown) {
    return "";
  }

  const file = await processor.process(markdown);
  return String(file);
};
