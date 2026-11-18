/**
 * A stand-in for the PostgREST query builder that records what was asked for.
 *
 * The hooks in `lib/api/` build a chain (`from(t).select(c).eq(k, v).single()`)
 * and await it. Asserting on a hook's return value alone would miss half of
 * what these hooks do: the org scoping, the status the row is written with, the
 * column order of a PostGIS point. So the mock keeps every link of every chain
 * and the tests assert against that as well as against the mapped output.
 *
 * Responses are queued per table and consumed in call order. A single queued
 * response is reused for every call to that table, which keeps the common case
 * short; a table with no queued response throws rather than resolving empty, so
 * a hook that starts querying something new fails loudly instead of silently
 * reading `null`.
 */

export interface ChainLink {
  method: string;
  args: unknown[];
}

export interface RecordedQuery {
  table: string;
  chain: ChainLink[];
}

export interface PostgrestResult {
  data?: unknown;
  error?: unknown;
}

export interface RecordedUpload {
  bucket: string;
  path: string;
  body: unknown;
  options?: { contentType?: string };
}

export interface SupabaseMockOptions {
  /** `auth.getUser()` resolves to this user; `null` means no session. */
  user?: { id: string } | null;
  /** Per-table responses, consumed in call order. */
  tables?: Record<string, PostgrestResult | PostgrestResult[]>;
  /** Per-bucket `upload()` results, consumed in call order. */
  uploads?: Record<string, PostgrestResult | PostgrestResult[]>;
  /** What `getPublicUrl()` returns, regardless of path. */
  publicUrl?: string;
}

export interface SupabaseMock {
  supabase: {
    from: jest.Mock;
    auth: { getUser: jest.Mock };
    storage: { from: jest.Mock };
  };
  /** Every chain that was awaited, in the order the hook awaited it. */
  queries: RecordedQuery[];
  uploads: RecordedUpload[];
  /** Queries against one table, oldest first. */
  on(table: string): RecordedQuery[];
  /** The single query against one table; throws unless there is exactly one. */
  only(table: string): RecordedQuery;
}

/** The arguments the chain passed to `method`, or undefined if it never did. */
export function argsOf(
  query: RecordedQuery | undefined,
  method: string,
): unknown[] | undefined {
  return query?.chain.find((link) => link.method === method)?.args;
}

/** Every `method` call in a chain, for chains that call one twice (`.order`). */
export function allArgsOf(
  query: RecordedQuery | undefined,
  method: string,
): unknown[][] {
  return (query?.chain ?? [])
    .filter((link) => link.method === method)
    .map((link) => link.args);
}

function takeNext(
  label: string,
  key: string,
  queued: Record<string, PostgrestResult | PostgrestResult[]> | undefined,
  consumed: Record<string, number>,
): PostgrestResult {
  const entry = queued?.[key];

  if (entry === undefined) {
    throw new Error(
      `supabase mock: no ${label} response queued for "${key}". ` +
        `Queued: ${Object.keys(queued ?? {}).join(", ") || "(none)"}`,
    );
  }

  if (!Array.isArray(entry)) return entry;

  const index = consumed[key] ?? 0;
  consumed[key] = index + 1;

  if (index >= entry.length) {
    throw new Error(
      `supabase mock: "${key}" was queried ${index + 1} time(s) but only ` +
        `${entry.length} ${label} response(s) were queued`,
    );
  }

  return entry[index];
}

export function createSupabaseMock(
  options: SupabaseMockOptions = {},
): SupabaseMock {
  const queries: RecordedQuery[] = [];
  const uploads: RecordedUpload[] = [];
  const consumedTables: Record<string, number> = {};
  const consumedUploads: Record<string, number> = {};

  function makeChain(query: RecordedQuery): PromiseLike<PostgrestResult> {
    const settle = () => {
      const result = takeNext("table", query.table, options.tables, consumedTables);
      return Promise.resolve({ data: null, error: null, ...result });
    };

    // A Proxy rather than a fixed list of builder methods: the hooks are free
    // to reach for any PostgREST modifier without this helper needing to grow.
    const thenable: PromiseLike<PostgrestResult> = {
      then: (onOk, onErr) => settle().then(onOk, onErr),
    };

    return new Proxy(thenable, {
      get(target, prop) {
        if (prop === "then") return target.then;
        if (typeof prop !== "string") return undefined;
        return (...args: unknown[]) => {
          query.chain.push({ method: prop, args });
          return makeChain(query);
        };
      },
    });
  }

  const from = jest.fn((table: string) => {
    const query: RecordedQuery = { table, chain: [] };
    queries.push(query);
    return makeChain(query);
  });

  const getUser = jest.fn(async () => ({
    data: { user: options.user === undefined ? { id: "user-1" } : options.user },
    error: null,
  }));

  const storageFrom = jest.fn((bucket: string) => ({
    upload: jest.fn(
      async (
        path: string,
        body: unknown,
        uploadOptions?: { contentType?: string },
      ) => {
        uploads.push({ bucket, path, body, options: uploadOptions });
        return {
          data: null,
          error: null,
          ...takeNext("upload", bucket, options.uploads, consumedUploads),
        };
      },
    ),
    getPublicUrl: jest.fn((path: string) => ({
      data: {
        publicUrl:
          options.publicUrl ?? `https://cdn.test/storage/${bucket}/${path}`,
      },
    })),
  }));

  const on = (table: string) => queries.filter((q) => q.table === table);

  return {
    supabase: { from, auth: { getUser }, storage: { from: storageFrom } },
    queries,
    uploads,
    on,
    only(table: string) {
      const matches = on(table);
      if (matches.length !== 1) {
        throw new Error(
          `expected exactly 1 query against "${table}", got ${matches.length}`,
        );
      }
      return matches[0];
    },
  };
}
