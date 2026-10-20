import { getAdminAuth } from "@/lib/firebase/admin";
import type { NextRequest } from "next/server";

export interface SessionContext {
  uid: string;
}

export async function getSession(request: NextRequest): Promise<SessionContext | null> {
  const header = request.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.uid) return null;
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}
