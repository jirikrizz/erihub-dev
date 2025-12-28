const rawBasePath = process.env.NEXT_PUBLIC_MICROSHOP_BASE_PATH?.trim() ?? "";

const normalizedBasePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";

export const MICROSHOP_BASE_PATH = normalizedBasePath;

export const withBasePath = (path: string): string => {
  if (!MICROSHOP_BASE_PATH) {
    return path;
  }

  if (!path || path === "/") {
    return MICROSHOP_BASE_PATH;
  }

  const [pathname, hash] = path.split("#", 2);
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const joined =
    normalizedPath === "/"
      ? MICROSHOP_BASE_PATH
      : `${MICROSHOP_BASE_PATH}${normalizedPath}`.replace(/\/{2,}/g, "/");

  return hash ? `${joined}#${hash}` : joined;
};

const applySlugBase = (slugBase: string | undefined, target: string): string => {
  if (target.startsWith("#")) {
    if (slugBase && slugBase !== "/") {
      return `${slugBase}${target}`;
    }

    return `/${target}`;
  }

  if (!slugBase || slugBase === "/") {
    return target;
  }

  const normalized = target.startsWith("/") ? target : `/${target}`;
  return `${slugBase}${normalized}`.replace(/\/{2,}/g, "/");
};

export const withSlugBasePath = (target: string, slugBase?: string): string => {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return target;
  }

  const withSlug = applySlugBase(slugBase, target);
  return withBasePath(withSlug);
};
