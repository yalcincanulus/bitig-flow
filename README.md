Welcome to your new TanStack Start app!

# Getting Started

```bash
pnpm install
cp .env.example .env       # then fill in the secrets — see the comments in the file
pnpm infra:up              # postgres, redis, garage, mailpit
pnpm infra:verify          # optional: smoke-test the stack end to end
pnpm dev
```

## Local infrastructure

Everything the app talks to runs in Docker, defined in [`compose.yaml`](./compose.yaml).

| Service    | What it is                               | Where                                             |
| ---------- | ---------------------------------------- | ------------------------------------------------- |
| `postgres` | Postgres 19beta — application data       | `localhost:5432`                                  |
| `redis`    | Redis 8 — gate sessions, dwell buffering | `localhost:6379`                                  |
| `garage`   | Single-node S3 for document blobs        | API `localhost:3900`, admin `localhost:3903`      |
| `mailpit`  | Catches all outbound dev mail            | SMTP `localhost:1025`, UI <http://localhost:8025> |

Scripts:

| Command             | Does                                                            |
| ------------------- | --------------------------------------------------------------- |
| `pnpm infra:up`     | Start everything and wait until healthy                         |
| `pnpm infra:down`   | Stop the stack, keep the data                                   |
| `pnpm infra:reset`  | Destroy the volumes and start clean                             |
| `pnpm infra:logs`   | Follow logs from all services                                   |
| `pnpm infra:verify` | putObject + presigned GET/PUT against Garage, SMTP into Mailpit |

### Notes

- **Garage provisions itself.** `garage server --single-node` assigns and applies the
  cluster layout on first start, and `--default-bucket` creates the bucket and imports
  the access key from `.env`. A one-shot `garage-init` sidecar then applies bucket CORS
  (plain S3 `PutBucketCors`, which the Garage CLI does not cover). No manual steps.
- **Do not rotate `S3_SECRET_ACCESS_KEY` against an existing volume.** Garage refuses
  to start if the key id already exists with a different secret. Run `pnpm infra:reset`
  first.
- **Presign with checksums off.** The AWS SDK signs `x-amz-checksum-*` headers by
  default; a browser will not send them and the PUT would 403. Use a client configured
  with `requestChecksumCalculation: "WHEN_REQUIRED"` for presigning — see
  [`infra/verify.ts`](./infra/verify.ts).
- Garage is path-style only here: `endpoint: http://127.0.0.1:3900`, `region: "garage"`,
  `forcePathStyle: true`.

# Building For Production

To build this application for production:

```bash
pnpm build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`

## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "My App" },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
});
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from "@tanstack/react-start";

const getServerTime = createServerFn({
  method: "GET",
}).handler(async () => {
  return new Date().toISOString();
});

// Use in a component
function MyComponent() {
  const [time, setTime] = useState("");

  useEffect(() => {
    getServerTime().then(setTime);
  }, []);

  return <div>Server time: {time}</div>;
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/hello")({
  server: {
    handlers: {
      GET: () => json({ message: "Hello, World!" }),
    },
  },
});
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/people")({
  loader: async () => {
    const response = await fetch("https://swapi.dev/api/people");
    return response.json();
  },
  component: PeopleComponent,
});

function PeopleComponent() {
  const data = Route.useLoaderData();
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  );
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
