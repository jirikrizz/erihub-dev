import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

const secret = process.env.REVALIDATION_SECRET ?? process.env.HUB_API_TOKEN;

type RevalidatePayload = {
  paths?: string[];
  tags?: string[];
  secret?: string;
};

export async function POST(request: NextRequest) {
  let body: RevalidatePayload = {};

  const contentType = request.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    body = (await request.json().catch(() => ({}))) as RevalidatePayload;
  }

  const headerSecret = request.headers.get("x-revalidate-secret") ?? body.secret;

  if (secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const paths = Array.isArray(body.paths) && body.paths.length ? body.paths : ["/", "/products"];
  const tags = Array.isArray(body.tags) ? body.tags : [];

  paths.forEach((path) => revalidatePath(path, "page"));
  tags.forEach((tag) => revalidateTag(tag));

  return NextResponse.json({ revalidated: true, paths, tags });
}
