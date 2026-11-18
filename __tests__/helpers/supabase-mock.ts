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
 *
 * `rpc()` is recorded the same way, keyed by function name, because a hook that
 * writes through a database function (`create_production_entry`) puts its whole
 * contract in the arguments: asserting on the mapped return value alone would
 * not notice a renamed or dropped parameter.
 */

export interface ChainLink {
  method: string;
  args: unknown[];
}

export interface RecordedQuery {
  table: string;
  chain: ChainLink[];
}

/** One `rpc()` call: the function, its arguments and any chained modifier. */
export interface RecordedRpc {
  fn: string;
  params?: Record<string, unknown>;
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
  options?: { contentType?: string; upsert?: boolean };
}

/** One `storage.from(b).remove([...])` call. */
export interface RecordedRemoval {
  bucket: string;
  paths: string[];
}

/** One `storage.from(b).createSignedUrls(paths, ttl)` call. */
export interface RecordedSigning {
  bucket: string;
  paths: string[];
  expiresIn: number;
}

export interface SupabaseMockOptions {
  /**
   * `auth.getUser()` and `auth.getSession()` resolve to this user; `null` means
   * no session, so `getSession()` answers `{ session: null }`.
   */
  user?: { id: string } | null;
  /** Per-table responses, consumed in call order. */
  tables?: Record<string, PostgrestResult | PostgrestResult[]>;
  /** Per-function `rpc()` responses, consumed in call order. */
  rpcs?: Record<string, PostgrestResult | PostgrestResult[]>;
  /** Per-bucket `upload()` results, consumed in call order. */
  uploads?: Record<string, PostgrestResult | PostgrestResult[]>;
  /** Per-bucket `remove()` results, consumed in call order. */
  removals?: Record<string, PostgrestResult | PostgrestResult[]>;
  /**
   * Per-bucket `createSignedUrls()` results. Unqueued, every requested path
   * is signed — the common case, and one a test should not have to spell out.
   */
  signedUrls?: Record<string, PostgrestResult | PostgrestResult[]>;
  /** What `getPublicUrl()` returns, regardless of path. */
  publicUrl?: string;
}

export interface SupabaseMock {
  supabase: {
    from: jest.Mock;
    rpc: jest.Mock;
    auth: { getUser: jest.Mock; getSession: jest.Mock };
    storage: { from: jest.Mock };
  };
  /** Every chain that was awaited, in the order the hook awaited it. */
  queries: RecordedQuery[];
  /** Every `rpc()` call, in call order. */
  rpcs: RecordedRpc[];
  uploads: RecordedUpload[];
  /** Every `remove()` call, in call order. */
  removals: RecordedRemoval[];
  /** Every `createSignedUrls()` call, in call order. */
  signings: RecordedSigning[];
  /** Queries against one table, oldest first. */
  on(table: string): RecordedQuery[];
  /** The single query against one table; throws unless there is exactly one. */
  only(table: string): RecordedQuery;
  /** Calls to one database function, oldest first. */
  onRpc(fn: string): RecordedRpc[];
  /** The single call to one function; throws unless there is exactly one. */
  onlyRpc(fn: string): RecordedRpc;
}

/** The arguments the chain passed to `method`, or undefined if it never did. */
export function argsOf(
  query: RecordedQuery | RecordedRpc | undefined,
  method: string,
): unknown[] | undefined {
  return query?.chain.find((link) => link.method === method)?.args;
}

/** Every `method` call in a chain, for chains that call one twice (`.order`). */
export function allArgsOf(
  query: RecordedQuery | RecordedRpc | undefined,
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
  const rpcs: RecordedRpc[] = [];
  const uploads: RecordedUpload[] = [];
  const removals: RecordedRemoval[] = [];
  const signings: RecordedSigning[] = [];
  const consumedTables: Record<string, number> = {};
  const consumedRpcs: Record<string, number> = {};
  const consumedUploads: Record<string, number> = {};
  const consumedRemovals: Record<string, number> = {};
  const consumedSignings: Record<string, number> = {};

  function makeChain(
    chain: ChainLink[],
    settle: () => Promise<PostgrestResult>,
  ): PromiseLike<PostgrestResult> {
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
          chain.push({ method: prop, args });
          return makeChain(chain, settle);
        };
      },
    });
  }

  const from = jest.fn((table: string) => {
    const query: RecordedQuery = { table, chain: [] };
    queries.push(query);
    return makeChain(query.chain, () =>
      Promise.resolve({
        data: null,
        error: null,
        ...takeNext("table", table, options.tables, consumedTables),
      }),
    );
  });

  // Same shape as `from`: awaited directly by today's hooks, but chainable so
  // one that adds `.single()` tomorrow records it instead of breaking here.
  const rpc = jest.fn((fn: string, params?: Record<string, unknown>) => {
    const call: RecordedRpc = { fn, params, chain: [] };
    rpcs.push(call);
    return makeChain(call.chain, () =>
      Promise.resolve({
        data: null,
        error: null,
        ...takeNext("rpc", fn, options.rpcs, consumedRpcs),
      }),
    );
  });

  const user = options.user === undefined ? { id: "user-1" } : options.user;

  const getUser = jest.fn(async () => ({
    data: { user },
    error: null,
  }));

  // The real `getSession()` reads AsyncStorage, so it answers with the whole
  // session or with null — never with a user and no session.
  const getSession = jest.fn(async () => ({
    data: { session: user ? { user, access_token: "test-token" } : null },
    error: null,
  }));

  const storageFrom = jest.fn((bucket: string) => ({
    upload: jest.fn(
      async (
        path: string,
        body: unknown,
        uploadOptions?: { contentType?: string; upsert?: boolean },
      ) => {
        uploads.push({ bucket, path, body, options: uploadOptions });
        return {
          data: null,
          error: null,
          ...takeNext("upload", bucket, options.uploads, consumedUploads),
        };
      },
    ),
    // Returns a thenable with `.catch`, not a bare promise object: the upload
    // hook calls `.catch()` on its best-effort cleanup removal, and a plain
    // object with a `then` would blow up there instead of being swallowed.
    remove: jest.fn((paths: string[]) => {
      removals.push({ bucket, paths });
      return Promise.resolve({
        data: null,
        error: null,
        ...takeNext("removal", bucket, options.removals, consumedRemovals),
      });
    }),
    createSignedUrls: jest.fn(async (paths: string[], expiresIn: number) => {
      signings.push({ bucket, paths, expiresIn });

      const queued = options.signedUrls?.[bucket];
      if (queued !== undefined) {
        return {
          data: null,
          error: null,
          ...takeNext("signed url", bucket, options.signedUrls, consumedSignings),
        };
      }

      return {
        data: paths.map((path) => ({
          path,
          signedUrl: `https://cdn.test/signed/${bucket}/${path}`,
          error: null,
        })),
        error: null,
      };
    }),
    getPublicUrl: jest.fn((path: string) => ({
      data: {
        publicUrl:
          options.publicUrl ?? `https://cdn.test/storage/${bucket}/${path}`,
      },
    })),
  }));

  const on = (table: string) => queries.filter((q) => q.table === table);

  const onRpc = (fn: string) => rpcs.filter((call) => call.fn === fn);

  return {
    supabase: {
      from,
      rpc,
      auth: { getUser, getSession },
      storage: { from: storageFrom },
    },
    queries,
    rpcs,
    uploads,
    removals,
    signings,
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
    onRpc,
    onlyRpc(fn: string) {
      const matches = onRpc(fn);
      if (matches.length !== 1) {
        throw new Error(
          `expected exactly 1 rpc call to "${fn}", got ${matches.length}`,
        );
      }
      return matches[0];
    },
  };
}
