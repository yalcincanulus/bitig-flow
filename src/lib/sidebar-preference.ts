import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

// The shadcn sidebar primitive writes this cookie whenever the User toggles the sidebar. Reading
// it back is what turns the write into persistence, and it has to happen on the server too: the
// Chrome is server-rendered, so a client-only read would hydrate against the wrong sidebar.
const SIDEBAR_COOKIE_NAME = "sidebar_state";

export const sidebarStartsOpen = createIsomorphicFn()
  .server(() => getCookie(SIDEBAR_COOKIE_NAME) !== "false")
  .client(() => readBrowserCookie(SIDEBAR_COOKIE_NAME) !== "false");

// A substring search would also match a cookie whose name merely ends in `sidebar_state`, so the
// client branch parses the pairs the same way the server's `getCookie` does.
function readBrowserCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
