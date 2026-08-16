import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

export function createCookieClient() {
  const jar = new CookieJar();

  return {
    jar,
    http: makeFetchCookie(fetch, jar) as typeof fetch,
  };
}
