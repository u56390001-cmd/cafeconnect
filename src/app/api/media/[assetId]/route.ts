import { getAdminDb } from "@/lib/firebase/admin";
import { downloadObject, listObjects } from "@/lib/media/storage";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public delivery of product images.
 *
 * Images live in a private bucket; this route streams them only when a
 * published, available product references the asset, so one tenant's images
 * can never be guessed or reused by another.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { assetId: string } }
): Promise<Response> {
  try {
    const assetId = params.assetId;
    if (!/^img_[a-f0-9]{18}$/.test(assetId)) {
      return new Response("Not found", { status: 404 });
    }

    const db = getAdminDb();
    const snap = await db
      .collectionGroup("menuItems")
      .where("imageReferences.assetId", "==", assetId)
      .limit(1)
      .get();

    if (snap.empty) {
      return new Response("Not found", { status: 404 });
    }

    const item = snap.docs[0].data();
    if (item.publicationStatus !== "published" || item.status === "archived") {
      return new Response("Not found", { status: 404 });
    }

    const prefix = `tenants/${item.tenantId}/menu-items/${item.itemId}/`;
    const names = await listObjects(prefix).catch(() => [] as string[]);
    const fileName = names.find((name) => name.includes(assetId));
    if (!fileName) return new Response("Not found", { status: 404 });

    const stored = await downloadObject(fileName).catch(() => null);
    if (!stored) return new Response("Not found", { status: 404 });

    return new Response(new Uint8Array(stored.body), {
      headers: {
        "Content-Type": stored.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: unknown) {
    console.error(
      `[api-error] scope=mediaAsset message=${
        error instanceof Error ? error.message.slice(0, 160) : "unknown"
      }`
    );
    return new Response("Not found", { status: 404 });
  }
}
