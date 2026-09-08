import { createHash } from "node:crypto";

import { v7 as uuidv7 } from "uuid";

import { visitTtlSeconds } from "#/server/viewer/visit-cookies";

const hourMs = 60 * 60 * 1_000;
const visitTtlMs = visitTtlSeconds * 1_000;

const chrome =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const safari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0";

type Persona = Readonly<{
  visitorId: string;
  email: string | null;
  userAgent: string;
}>;

const personas = {
  maya: {
    visitorId: "dV_mayaChen7Qp2LmN9xK",
    email: "maya.chen@example.com",
    userAgent: chrome,
  },
  alex: {
    visitorId: "dV_alexRivera3nTq8sB2",
    email: "alex.rivera@example.com",
    userAgent: safari,
  },
  sam: {
    visitorId: "dV_samOkonkwo1fH4cR7",
    email: "sam.okonkwo@example.com",
    userAgent: firefox,
  },
  jordan: {
    visitorId: "dV_jordanLee9kM2wP5d",
    email: "jordan.lee@example.com",
    userAgent: chrome,
  },
  anonA: { visitorId: "dV_anonNorth5bY8uE1c", email: null, userAgent: chrome },
  anonB: { visitorId: "dV_anonWest2jL6qA9f", email: null, userAgent: safari },
  anonC: { visitorId: "dV_anonEast8rN3tK4h", email: null, userAgent: firefox },
  anonD: { visitorId: "dV_anonSouth4pC7vW2m", email: null, userAgent: chrome },
  anonE: { visitorId: "dV_anonHarbor6sD1xQ8", email: null, userAgent: safari },
} as const satisfies Record<string, Persona>;

type DocumentKey = "welcome" | "pdf" | "image";

type DocumentView = Readonly<{
  document: DocumentKey;
  pages: ReadonlyArray<number>;
  seconds: ReadonlyArray<number>;
  download?: true;
}>;

type VisitScript = Readonly<{
  persona: Persona;
  hoursAgo: number;
  views: ReadonlyArray<DocumentView>;
}>;

function consecutivePages(count: number, firstSeconds: number): DocumentView {
  return {
    document: "pdf",
    pages: Array.from({ length: count }, (_, index) => index + 1),
    seconds: Array.from({ length: count }, (_, index) =>
      Math.max(8, Math.round(firstSeconds * 0.9 ** index)),
    ),
  };
}

const visitScripts: ReadonlyArray<VisitScript> = [
  {
    persona: personas.maya,
    hoursAgo: 3,
    views: [
      { ...consecutivePages(12, 48), download: true },
      { document: "image", pages: [1], seconds: [36] },
    ],
  },
  {
    persona: personas.anonA,
    hoursAgo: 6,
    views: [consecutivePages(6, 32)],
  },
  {
    persona: personas.alex,
    hoursAgo: 9,
    views: [
      { document: "welcome", pages: [1], seconds: [54] },
      { document: "pdf", pages: [1, 2, 3, 8, 14], seconds: [22, 28, 31, 18, 12], download: true },
    ],
  },
  {
    persona: personas.maya,
    hoursAgo: 26,
    views: [{ document: "welcome", pages: [1], seconds: [41] }, consecutivePages(9, 38)],
  },
  {
    persona: personas.anonB,
    hoursAgo: 30,
    views: [
      { document: "image", pages: [1], seconds: [64], download: true },
      { document: "welcome", pages: [1], seconds: [19] },
    ],
  },
  {
    persona: personas.sam,
    hoursAgo: 50,
    views: [consecutivePages(15, 44), { document: "image", pages: [1], seconds: [27] }],
  },
  {
    persona: personas.anonA,
    hoursAgo: 55,
    views: [{ document: "welcome", pages: [1], seconds: [33] }],
  },
  {
    persona: personas.jordan,
    hoursAgo: 73,
    views: [
      { document: "pdf", pages: [1, 2, 4, 5, 6], seconds: [18, 24, 21, 40, 16], download: true },
    ],
  },
  {
    persona: personas.alex,
    hoursAgo: 98,
    views: [
      consecutivePages(7, 29),
      { document: "welcome", pages: [1], seconds: [22] },
      { document: "image", pages: [1], seconds: [14] },
    ],
  },
  {
    persona: personas.anonC,
    hoursAgo: 104,
    views: [{ document: "image", pages: [1], seconds: [48] }],
  },
  {
    persona: personas.maya,
    hoursAgo: 122,
    views: [{ ...consecutivePages(4, 26), download: true }],
  },
  {
    persona: personas.anonD,
    hoursAgo: 148,
    views: [{ document: "welcome", pages: [1], seconds: [67] }, consecutivePages(11, 35)],
  },
  {
    persona: personas.sam,
    hoursAgo: 170,
    views: [{ document: "welcome", pages: [1], seconds: [28] }],
  },
  {
    persona: personas.anonA,
    hoursAgo: 176,
    views: [{ document: "pdf", pages: [1, 2, 3], seconds: [14, 11, 9] }],
  },
  {
    persona: personas.anonB,
    hoursAgo: 201,
    views: [
      consecutivePages(8, 40),
      { document: "image", pages: [1], seconds: [21], download: true },
    ],
  },
  {
    persona: personas.alex,
    hoursAgo: 221,
    views: [{ document: "image", pages: [1], seconds: [55] }],
  },
  {
    persona: personas.anonE,
    hoursAgo: 230,
    views: [{ document: "welcome", pages: [1], seconds: [16] }, consecutivePages(5, 24)],
  },
  {
    persona: personas.maya,
    hoursAgo: 252,
    views: [
      {
        document: "pdf",
        pages: [1, 19, 20, 21, 25, 32, 39],
        seconds: [20, 33, 41, 18, 130, 240, 80],
      },
    ],
  },
  {
    persona: personas.jordan,
    hoursAgo: 280,
    views: [{ document: "welcome", pages: [1], seconds: [38] }],
  },
  {
    persona: personas.anonC,
    hoursAgo: 311,
    views: [{ ...consecutivePages(10, 36), download: true }],
  },
  {
    persona: personas.anonA,
    hoursAgo: 318,
    views: [{ document: "image", pages: [1], seconds: [12] }],
  },
  {
    persona: personas.sam,
    hoursAgo: 342,
    views: [
      { document: "welcome", pages: [1], seconds: [24] },
      { document: "pdf", pages: [1, 2], seconds: [15, 10] },
    ],
  },
  {
    persona: personas.anonD,
    hoursAgo: 382,
    views: [consecutivePages(3, 20)],
  },
  {
    persona: personas.maya,
    hoursAgo: 428,
    views: [
      { document: "welcome", pages: [1], seconds: [46] },
      { ...consecutivePages(18, 42), download: true },
      { document: "image", pages: [1], seconds: [31], download: true },
    ],
  },
];

function ipHash(visitorId: string) {
  return createHash("sha256").update(`demo-sample:${visitorId}`).digest("hex");
}

function addMs(value: Date, ms: number) {
  return new Date(value.getTime() + ms);
}

export type DemoSampleAnalyticsDocuments = Readonly<{
  welcome: string;
  pdf: string;
  image: string;
}>;

export function demoSampleAnalytics(options: {
  linkId: string;
  documents: DemoSampleAnalyticsDocuments;
  now: Date;
}) {
  const visits: Array<{
    id: string;
    linkId: string;
    visitorId: string;
    email: string | null;
    emailVerified: boolean;
    gateVersion: number;
    startedAt: Date;
    lastSeenAt: Date;
    expiresAt: Date;
    userAgent: string;
    ipHash: string;
  }> = [];
  const events: Array<{
    visitId: string;
    documentId: string;
    type: "document_opened" | "page_dwell" | "download";
    payload?: { page: number; ms: number } | { via: "button" };
    occurredAt: Date;
  }> = [];

  for (const script of visitScripts) {
    const visitId = uuidv7();
    const startedAt = new Date(options.now.getTime() - script.hoursAgo * hourMs);
    let cursor = addMs(startedAt, 4_000);

    for (const view of script.views) {
      const documentId = options.documents[view.document];
      events.push({
        visitId,
        documentId,
        type: "document_opened",
        occurredAt: cursor,
      });
      cursor = addMs(cursor, 1_200);

      for (const [index, page] of view.pages.entries()) {
        const seconds = view.seconds[index] ?? 12;
        events.push({
          visitId,
          documentId,
          type: "page_dwell",
          payload: { page, ms: seconds * 1_000 },
          occurredAt: cursor,
        });
        cursor = addMs(cursor, seconds * 1_000);
      }

      if (view.download) {
        events.push({
          visitId,
          documentId,
          type: "download",
          payload: { via: "button" },
          occurredAt: cursor,
        });
        cursor = addMs(cursor, 800);
      }

      cursor = addMs(cursor, 2_500);
    }

    visits.push({
      id: visitId,
      linkId: options.linkId,
      visitorId: script.persona.visitorId,
      email: script.persona.email,
      emailVerified: script.persona.email !== null,
      gateVersion: 1,
      startedAt,
      lastSeenAt: cursor,
      expiresAt: addMs(startedAt, visitTtlMs),
      userAgent: script.persona.userAgent,
      ipHash: ipHash(script.persona.visitorId),
    });
  }

  const downloadCount = events.filter((event) => event.type === "download").length;
  return {
    visits,
    events,
    visitCount: visits.length,
    eventCount: events.length,
    downloadCount,
  };
}
