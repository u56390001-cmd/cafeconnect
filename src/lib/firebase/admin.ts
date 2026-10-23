import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CollectionImpl,
  DocRef,
  Increment,
  Query,
  collectionFacade,
  collectionGroupFacade,
  docFacade,
} from "@/lib/db/firestore-compat";

/**
 * Admin data + auth entrypoint, now backed by Supabase.
 *
 * `getAdminDb` returns a Firestore-compatible facade over PostgREST
 * (src/lib/db/firestore-compat.ts) so all service modules keep working
 * unchanged. `getAdminAuth` wraps Supabase Auth admin for session
 * verification and user provisioning.
 */

export * from "@/lib/db/firestore-compat";

// The app imports { FieldValue } from firebase-admin/firestore and calls
// FieldValue.increment(n); keep the same facade shape.
export const FieldValue = {
  increment(n: number) {
    return new Increment(n);
  },
};

export type Firestore = {
  collection(path: string): CollectionImpl;
  doc(path: string): DocRef;
  collectionGroup(name: string): Query;
};

export type Auth = SupabaseAdminAuth;

let client: SupabaseClient | null = null;
let facade: FirestoreCompatDb | null = null;

function serviceClient(): SupabaseClient {
  if (!client) {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error(
        "Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
      );
    }
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return client;
}

class FirestoreCompatDb implements Firestore {
  collection(path: string): CollectionImpl {
    return collectionFacade(path);
  }
  doc(path: string): DocRef {
    return docFacade(path);
  }
  collectionGroup(name: string): Query {
    return collectionGroupFacade(name);
  }
}

export function getAdminDb(): FirestoreCompatDb {
  serviceClient();
  if (!facade) facade = new FirestoreCompatDb();
  return facade;
}

export class SupabaseAdminAuth {
  async verifyIdToken(token: string): Promise<{ uid: string; email?: string }> {
    const { data, error } = await serviceClient().auth.getUser(token);
    if (error || !data.user) {
      throw new Error(error?.message ?? "Invalid auth token");
    }
    return { uid: data.user.id, email: data.user.email ?? undefined };
  }

  async getUser(uid: string): Promise<{
    uid: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
    metadata?: Record<string, unknown>;
  } | null> {
    const { data, error } = await serviceClient().auth.admin.getUserById(uid);
    if (error || !data.user) return null;
    return supabaseUserShape(data.user);
  }

  async getUserByEmail(email: string): Promise<{
    uid: string;
    email?: string;
    displayName?: string;
  } | null> {
    const { data, error } = await serviceClient().auth.admin.listUsers();
    if (error) return null;
    const match = data.users.find((user) => user.email === email);
    return match ? supabaseUserShape(match) : null;
  }

  async createUser(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ uid: string; email?: string }> {
    const { data, error } = await serviceClient().auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { display_name: input.displayName ?? null },
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Could not create user");
    }
    return { uid: data.user.id, email: data.user.email ?? undefined };
  }

  async deleteUser(uid: string): Promise<void> {
    await serviceClient().auth.admin.deleteUser(uid);
  }

  async updateUser(
    uid: string,
    patch: { displayName?: string; photoURL?: string }
  ): Promise<void> {
    await serviceClient().auth.admin.updateUserById(uid, {
      user_metadata: {
        display_name: patch.displayName,
        avatar_url: patch.photoURL,
      },
    });
  }
}

type AdminUserApi = Awaited<
  ReturnType<SupabaseClient["auth"]["admin"]["getUserById"]>
>["data"]["user"];

function supabaseUserShape(user: NonNullable<AdminUserApi>): {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  metadata: Record<string, unknown>;
} {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    uid: user.id,
    email: user.email ?? undefined,
    displayName:
      (meta["display_name"] as string | undefined) ??
      (meta["name"] as string | undefined),
    photoURL:
      (meta["avatar_url"] as string | undefined) ??
      (meta["picture"] as string | undefined),
    metadata: meta,
  };
}

export function getAdminAuth(): SupabaseAdminAuth {
  return new SupabaseAdminAuth();
}
