import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";

import { ThemeScript } from "#/components/theme-script";
import { UnmatchedNotFound } from "#/components/unmatched-not-found";
import {
  documentContentSecurityPolicy,
  isViewerPath,
  storageOriginFromEndpoint,
  viewerContentSecurityPolicy,
} from "#/lib/content-security-policy";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  headers: ({ matches }) => ({
    "Content-Security-Policy": matches.some((match) => isViewerPath(match.pathname))
      ? viewerContentSecurityPolicy()
      : documentContentSecurityPolicy(storageOriginFromEndpoint(process.env.S3_ENDPOINT ?? "")),
  }),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Bitig Flow",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: UnmatchedNotFound,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The theme class is written onto `<html>` before hydration, so React finds an attribute it
    // did not render and would otherwise warn about it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <ThemeScript />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
