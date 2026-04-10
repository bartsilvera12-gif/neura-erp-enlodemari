import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { usuarioEmailLookupVariants } from "@/lib/auth/usuario-email-variants";
import { supabaseDbSchemaOption, type AppSupabaseClient } from "@/lib/supabase/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";

const DIAG = process.env.NEURA_DIAG_AUTH === "1";

function logDiag(payload: Record<string, unknown>) {
  if (DIAG) {
    console.warn("[neura:diag:auth]", JSON.stringify(payload));
  }
}

export type ApiAuthFailureCode =
  | "missing_public_env"
  | "no_session"
  | "usuario_query_error"
  | "usuario_zero_rows"
  | "empresa_id_null";

export type ApiAuthContext = {
  user: User;
  /** null solo cuando forDataSchemaEndpoint y super_admin sin empresa. */
  empresa_id: string | null;
  /** Cliente anon + JWT del usuario (cookies o Bearer). PostgREST respeta RLS en zentra_erp. */
  userScopedSupabase: AppSupabaseClient;
  /** Desde `usuarios` (evita segunda query en getAuthWithRol). */
  usuarioRol?: string | null;
  usuarioNombre?: string | null;
};

export type ApiAuthResult =
  | { ok: true; ctx: ApiAuthContext }
  | { ok: false; code: ApiAuthFailureCode; detail?: string };

function extractBearerFromRequest(request?: Request | null): string | null {
  const h = request?.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

type BearerResolved = { token: string | null; source: "request" | "next-headers" | "none" };

/** Bearer del Request o de `headers()` (fallback). Incluye fuente para diagnóstico NEURA_DIAG_AUTH. */
async function resolveBearerToken(request?: Request | null): Promise<BearerResolved> {
  const fromReq = extractBearerFromRequest(request);
  if (fromReq) return { token: fromReq, source: "request" };
  try {
    const h = await headers();
    const a = h.get("authorization");
    if (a?.toLowerCase().startsWith("bearer ")) {
      const t = a.slice(7).trim();
      if (t) return { token: t, source: "next-headers" };
    }
  } catch {
    /* fuera de contexto de petición */
  }
  return { token: null, source: "none" };
}

type UsuarioRow = {
  empresa_id?: string | null;
  rol?: string | null;
  nombre?: string | null;
};

/** Payload JWT sin verificar firma (solo diagnóstico NEURA_DIAG_AUTH). */
function decodeJwtPayloadUnverified(jwt: string): { iss?: string; sub?: string } | null {
  try {
    const a = jwt.indexOf(".");
    const b = jwt.indexOf(".", a + 1);
    if (a < 0 || b < 0) return null;
    const seg = jwt.slice(a + 1, b);
    const pad = (4 - (seg.length % 4)) % 4;
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(b64, "base64").toString("utf8")
        : atob(b64);
    const o = JSON.parse(json) as { iss?: unknown; sub?: unknown };
    return {
      iss: typeof o.iss === "string" ? o.iss : undefined,
      sub: typeof o.sub === "string" ? o.sub : undefined,
    };
  } catch {
    return null;
  }
}

function hostnameFromBackendUrl(backendUrl: string): string | null {
  try {
    return new URL(backendUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Logs: iss/sub del token, hostname backend, mismatch → "JWT de otro proyecto",
 * y fila en zentra_erp.usuarios por auth_user_id = sub vía service role (sin usar getUser).
 */
async function logBearerJwtProjectDiag(bearer: string, backendUrl: string): Promise<void> {
  if (!DIAG) return;

  const backendHostname = hostnameFromBackendUrl(backendUrl);
  const claims = decodeJwtPayloadUnverified(bearer);
  if (!claims) {
    logDiag({ step: "diag_jwt_decode", ok: false });
    return;
  }

  const { iss, sub } = claims;
  let jwtIssHostname: string | null = null;
  if (iss) {
    try {
      jwtIssHostname = new URL(iss).hostname;
    } catch {
      jwtIssHostname = null;
    }
  }

  const issHostnameMatchesBackend =
    backendHostname != null &&
    jwtIssHostname != null &&
    jwtIssHostname.toLowerCase() === backendHostname.toLowerCase();

  logDiag({
    step: "diag_jwt_vs_backend",
    jwt_iss: iss ?? null,
    jwt_sub: sub ?? null,
    backend_hostname: backendHostname,
    jwt_iss_hostname: jwtIssHostname,
    iss_hostname_matches_backend: issHostnameMatchesBackend,
  });

  if (iss && !issHostnameMatchesBackend) {
    logDiag({
      step: "diag_jwt_mismatch",
      mensaje: "JWT de otro proyecto",
      jwt_iss: iss,
      backend_hostname: backendHostname,
    });
  }

  if (!sub) {
    logDiag({ step: "diag_usuario_sr", skip: true, reason: "no_sub_en_token" });
    return;
  }

  const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!srKey) {
    logDiag({ step: "diag_usuario_sr", skip: true, reason: "no_SUPABASE_SERVICE_ROLE_KEY" });
    return;
  }

  try {
    const sr = createServiceRoleClient();
    const { data, error } = await sr
      .from("usuarios")
      .select("*")
      .eq("auth_user_id", sub)
      .limit(1);
    const row = data?.[0] as Record<string, unknown> | undefined;
    logDiag({
      step: "diag_usuario_sr",
      auth_user_id_buscado: sub,
      query_ok: !error,
      query_error: error?.message ?? null,
      usuario_existe: !!row,
      empresa_id: (row?.empresa_id as string | null | undefined) ?? null,
      rol: (row?.rol as string | null | undefined) ?? null,
      usuario_email_hint:
        row?.email != null && typeof row.email === "string"
          ? row.email.replace(/^(.{2}).+(@.+)$/, "$1…$2")
          : null,
    });
  } catch (e) {
    logDiag({
      step: "diag_usuario_sr",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Resuelve usuario Supabase + empresa_id + cliente PostgREST con el mismo JWT que verá RLS.
 * No requiere SUPABASE_SERVICE_ROLE_KEY (evita 401 en Vercel si falta la service key).
 */
export type ResolveApiAuthOptions = {
  /** Si true: super_admin sin empresa_id puede resolver (data_schema → plantilla zentra_erp). */
  forDataSchemaEndpoint?: boolean;
};

export async function resolveApiAuthContext(
  request?: Request | null,
  opts?: ResolveApiAuthOptions
): Promise<ApiAuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    logDiag({ step: "env", hasUrl: !!url, hasAnon: !!anonKey });
    return { ok: false, code: "missing_public_env" };
  }

  const rawAuthOnRequest = request?.headers.get("authorization") ?? null;
  const bearerResolved = await resolveBearerToken(request);
  const bearer = bearerResolved.token;

  if (DIAG) {
    const cs = await cookies();
    logDiag({
      step: "auth_ingress",
      hasRequestObject: request != null,
      requestAuthHeaderLen: rawAuthOnRequest?.length ?? 0,
      requestAuthStartsWithBearer: rawAuthOnRequest?.toLowerCase().startsWith("bearer ") ?? false,
      bearerDetected: !!bearer,
      bearerSource: bearerResolved.source,
      bearerTokenLen: bearer?.length ?? 0,
      cookieCount: cs.getAll().length,
      cookieNames: cs.getAll().map((c) => c.name),
    });
  }

  let user: User | null = null;
  let userScopedSupabase: AppSupabaseClient;

  if (bearer) {
    await logBearerJwtProjectDiag(bearer, url);

    userScopedSupabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      ...supabaseDbSchemaOption,
    }) as AppSupabaseClient;
    const { data, error } = await userScopedSupabase.auth.getUser(bearer);
    if (error || !data.user?.id) {
      logDiag({
        step: "no_session",
        branch: "bearer_getUser",
        getUserErr: error?.message ?? null,
        hasUserId: !!data.user?.id,
        bearerSource: bearerResolved.source,
      });
      return { ok: false, code: "no_session", detail: error?.message };
    }
    user = data.user;
  } else {
    const cookieStore = await cookies();
    userScopedSupabase = createServerClient(url, anonKey, {
      ...supabaseDbSchemaOption,
      cookies: {
        getAll() {
          return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }) as AppSupabaseClient;
    const { data, error } = await userScopedSupabase.auth.getUser();
    if (error || !data.user?.id) {
      logDiag({
        step: "no_session",
        branch: "cookie_getUser",
        getUserErr: error?.message ?? null,
        hasUserId: !!data.user?.id,
        bearerSource: bearerResolved.source,
      });
      return { ok: false, code: "no_session", detail: error?.message };
    }
    user = data.user;
  }

  let row: UsuarioRow | undefined;
  let lastUsuarioErr: string | null = null;

  if (user.id) {
    const { data: byId, error: e1 } = await userScopedSupabase
      .from("usuarios")
      .select("empresa_id, rol, nombre")
      .eq("auth_user_id", user.id)
      .limit(1);
    if (e1) lastUsuarioErr = e1.message;
    else if (byId?.[0]) row = byId[0] as UsuarioRow;
  }

  if (!row && user.email) {
    for (const em of usuarioEmailLookupVariants(user.email)) {
      const { data: rows, error: uErr } = await userScopedSupabase
        .from("usuarios")
        .select("empresa_id, rol, nombre")
        .ilike("email", em)
        .limit(1);
      if (uErr) {
        lastUsuarioErr = uErr.message;
        logDiag({ step: "usuario", err: uErr.message });
        break;
      }
      if (rows?.[0]) {
        row = rows[0] as UsuarioRow;
        break;
      }
    }
  }

  if (!row && lastUsuarioErr) {
    logDiag({
      step: "fail",
      code: "usuario_query_error",
      detail: lastUsuarioErr,
      authUserIdHint: user.id?.slice(0, 8) ?? null,
    });
    return { ok: false, code: "usuario_query_error", detail: lastUsuarioErr };
  }

  if (!row) {
    logDiag({
      step: "fail",
      code: "usuario_zero_rows",
      authUserIdHint: user.id?.slice(0, 8) ?? null,
      emailHint: user.email?.replace(/^(.{2}).+(@.+)$/, "$1…$2") ?? null,
    });
    return { ok: false, code: "usuario_zero_rows" };
  }

  const empresa_id = row.empresa_id ?? null;
  const usuarioRol = row.rol ?? null;
  const usuarioNombre = row.nombre ?? null;

  if (empresa_id) {
    if (DIAG) {
      logDiag({
        step: "ok",
        emailHint: user.email?.replace(/^(.{2}).+(@.+)$/, "$1…$2"),
        empresaHint: `${empresa_id.slice(0, 8)}…`,
      });
    }
    return {
      ok: true,
      ctx: {
        user,
        empresa_id,
        userScopedSupabase,
        usuarioRol,
        usuarioNombre,
      },
    };
  }

  if (opts?.forDataSchemaEndpoint && usuarioRol === "super_admin") {
    if (DIAG) logDiag({ step: "ok_super_admin_sin_empresa" });
    return {
      ok: true,
      ctx: {
        user,
        empresa_id: null,
        userScopedSupabase,
        usuarioRol,
        usuarioNombre,
      },
    };
  }

  logDiag({
    step: "fail",
    code: "empresa_id_null",
    authUserIdHint: user.id?.slice(0, 8) ?? null,
    usuarioRol: usuarioRol ?? null,
  });
  return { ok: false, code: "empresa_id_null" };
}
