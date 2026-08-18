import { defaultSerovalPlugins, isNotFound } from "@tanstack/router-core";
import makeFetchCookie from "fetch-cookie";
import { fromCrossJSON, toJSONAsync } from "seroval";
import { CookieJar } from "tough-cookie";

export function createCookieClient() {
  const jar = new CookieJar();

  return {
    jar,
    http: makeFetchCookie(fetch, jar) as typeof fetch,
  };
}

type ServerFunctionCall = {
  modulePath: string;
  exportName: string;
  method: "GET" | "POST";
  data?: unknown;
};

const serverFunctionIds = new Map<string, string>();

async function resolveServerFunctionId(modulePath: string, exportName: string) {
  const cacheKey = `${modulePath}#${exportName}`;
  const cached = serverFunctionIds.get(cacheKey);
  if (cached) return cached;

  const moduleUrl = new URL(modulePath, process.env.BETTER_AUTH_URL);
  const response = await fetch(moduleUrl);
  if (!response.ok) {
    throw new Error(`Could not load client server-function module: ${response.status}`);
  }

  // Load Vite's browser transform instead of importing the function into the test process.
  // The transform exposes the real RPC id while keeping every behavioral call on HTTP.
  const transformedModule = await response.text();
  const escapedExportName = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `export const ${escapedExportName} =[\\s\\S]*?createClientRpc\\("([^"]+)"\\)`,
  ).exec(transformedModule);
  const functionId = match?.[1];
  if (!functionId) {
    throw new Error(`Could not resolve server function ${exportName} from ${modulePath}`);
  }

  serverFunctionIds.set(cacheKey, functionId);
  return functionId;
}

export async function callServerFunction(http: typeof fetch, call: ServerFunctionCall) {
  const functionId = await resolveServerFunctionId(call.modulePath, call.exportName);
  const url = new URL(`/_serverFn/${functionId}`, process.env.BETTER_AUTH_URL);
  const headers = new Headers({
    origin: process.env.BETTER_AUTH_URL!,
    "x-tsr-serverfn": "true",
  });
  let body: string | undefined;
  const payload =
    call.data === undefined ? undefined : JSON.stringify(await toJSONAsync({ data: call.data }));

  if (call.method === "GET" && payload !== undefined) {
    url.searchParams.set("payload", payload);
  } else if (call.method === "POST" && payload !== undefined) {
    headers.set("content-type", "application/json");
    body = payload;
  }

  const response = await http(url, {
    method: call.method,
    headers,
    body,
    redirect: "manual",
  });

  if (response.headers.has("location")) {
    const redirect = (await response.json()) as {
      href?: string;
      statusCode?: number;
      isSerializedRedirect?: boolean;
    };
    if (redirect.isSerializedRedirect && redirect.href && redirect.statusCode) {
      return new Response(null, {
        status: redirect.statusCode,
        headers: { location: redirect.href },
      });
    }
  }

  if (response.headers.get("x-tss-serialized") === "true") {
    const decoded = fromCrossJSON<{
      result?: unknown;
      error?: unknown;
    }>(await response.json(), { plugins: defaultSerovalPlugins });

    if (isNotFound(decoded.error)) {
      return Response.json(decoded.error, { status: 404 });
    }

    if (
      typeof decoded.error === "object" &&
      decoded.error !== null &&
      "code" in decoded.error &&
      decoded.error.code === "FORBIDDEN"
    ) {
      return Response.json(decoded.error, { status: 403 });
    }

    if (
      typeof decoded.error === "object" &&
      decoded.error !== null &&
      "code" in decoded.error &&
      decoded.error.code === "DOCUMENT_CONFLICT"
    ) {
      return Response.json(decoded.error, { status: 409 });
    }

    if (decoded.error !== undefined) {
      return Response.json({ error: decoded.error }, { status: 500 });
    }

    return Response.json(decoded.result, { status: response.status });
  }

  return response;
}
