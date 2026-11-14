import { waitFor } from "@testing-library/react-native";
import {
  allArgsOf,
  argsOf,
  createSupabaseMock,
  type SupabaseMock,
} from "../helpers/supabase-mock";
import { renderQueryHook } from "../helpers/render-query-hook";

let mock: SupabaseMock;

jest.mock("../../lib/supabase/client", () => ({
  get supabase() {
    return mock.supabase;
  },
}));

import {
  useProject,
  useProjectDamages,
  useProjects,
  useProjectSegments,
  useProjectServices,
} from "../../lib/api/projects";

/** `useProjectServices` is instrumented with console.warn; keep output clean. */
let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

describe("useProjects", () => {
  it("lists projects most recently updated first", async () => {
    mock = createSupabaseMock({
      tables: { projects: { data: [{ id: "project-1" }] } },
    });

    const { result } = await renderQueryHook(() => useProjects());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(argsOf(mock.only("projects"), "order")).toEqual([
      "updated_at",
      { ascending: false },
    ]);
  });

  it("surfaces a query error", async () => {
    mock = createSupabaseMock({
      tables: { projects: { error: new Error("JWT expired") } },
    });

    const { result } = await renderQueryHook(() => useProjects());
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error("JWT expired"));
  });
});

describe("useProject", () => {
  it("does not query on an empty id", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() => useProject(""));

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("reads a single project row by id", async () => {
    mock = createSupabaseMock({
      tables: { projects: { data: { id: "project-1" } } },
    });

    const { result } = await renderQueryHook(() => useProject("project-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = mock.only("projects");
    expect(argsOf(query, "eq")).toEqual(["id", "project-1"]);
    expect(argsOf(query, "single")).toEqual([]);
  });
});

describe("useProjectSegments", () => {
  it("does not query on an empty id", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() => useProjectSegments(""));

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("scopes segments to the project and orders them by name", async () => {
    mock = createSupabaseMock({
      tables: { line_segments: { data: [{ id: "seg-1" }] } },
    });

    const { result } = await renderQueryHook(() =>
      useProjectSegments("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = mock.only("line_segments");
    expect(argsOf(query, "eq")).toEqual(["project_id", "project-1"]);
    expect(argsOf(query, "order")).toEqual(["name"]);
  });
});

describe("useProjectServices", () => {
  it("does not query on an empty id", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() => useProjectServices(""));

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("merges services found by project_id with those found through segments", async () => {
    mock = createSupabaseMock({
      tables: {
        line_segments: { data: [{ id: "seg-1" }, { id: "seg-2" }] },
        services: [
          { data: [{ id: "svc-direct" }] },
          { data: [{ id: "svc-linked" }] },
        ],
      },
    });

    const { result } = await renderQueryHook(() =>
      useProjectServices("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((s) => s.id)).toEqual([
      "svc-direct",
      "svc-linked",
    ]);
  });

  it("keeps the first copy of a service returned by both queries", async () => {
    mock = createSupabaseMock({
      tables: {
        line_segments: { data: [{ id: "seg-1" }] },
        services: [
          { data: [{ id: "svc-1", notes: "from project_id" }] },
          { data: [{ id: "svc-1", notes: "from segment" }, { id: "svc-2" }] },
        ],
      },
    });

    const { result } = await renderQueryHook(() =>
      useProjectServices("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    // The direct query wins, so a half-backfilled row cannot shadow the
    // authoritative one just by also being reachable through its segment.
    expect(result.current.data?.[0]).toMatchObject({
      id: "svc-1",
      notes: "from project_id",
    });
  });

  it("skips the segment-linked query when the project has no segments", async () => {
    mock = createSupabaseMock({
      tables: {
        line_segments: { data: [] },
        services: { data: [{ id: "svc-direct" }] },
      },
    });

    const { result } = await renderQueryHook(() =>
      useProjectServices("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mock.on("services")).toHaveLength(1);
    expect(result.current.data?.map((s) => s.id)).toEqual(["svc-direct"]);
  });

  it("looks for segment-linked services only among rows with no project_id", async () => {
    mock = createSupabaseMock({
      tables: {
        line_segments: { data: [{ id: "seg-1" }, { id: "seg-2" }] },
        services: [{ data: [] }, { data: [] }],
      },
    });

    const { result } = await renderQueryHook(() =>
      useProjectServices("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [direct, linked] = mock.on("services");
    expect(argsOf(direct, "eq")).toEqual(["project_id", "project-1"]);
    expect(argsOf(linked, "is")).toEqual(["project_id", null]);
    expect(argsOf(linked, "in")).toEqual([
      "line_segment_id",
      ["seg-1", "seg-2"],
    ]);
  });

  it.each([
    [
      "the segment lookup",
      {
        line_segments: { error: new Error("segments denied") },
        services: { data: [] },
      },
      "segments denied",
    ],
    [
      "the direct lookup",
      {
        line_segments: { data: [{ id: "seg-1" }] },
        services: { error: new Error("services denied") },
      },
      "services denied",
    ],
    [
      "the segment-linked lookup",
      {
        line_segments: { data: [{ id: "seg-1" }] },
        services: [{ data: [] }, { error: new Error("linked denied") }],
      },
      "linked denied",
    ],
  ])("surfaces an error from %s", async (_label, tables, message) => {
    mock = createSupabaseMock({ tables });

    const { result } = await renderQueryHook(() =>
      useProjectServices("project-1"),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toBe(message);
    expect(result.current.data).toBeUndefined();
  });
});

describe("useProjectDamages", () => {
  it("does not query on an empty id", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() => useProjectDamages(""));

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("lists a project's damages newest first", async () => {
    mock = createSupabaseMock({
      tables: { pre_existing_damages: { data: [{ id: "dmg-1" }] } },
    });

    const { result } = await renderQueryHook(() =>
      useProjectDamages("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = mock.only("pre_existing_damages");
    expect(argsOf(query, "eq")).toEqual(["project_id", "project-1"]);
    expect(allArgsOf(query, "order")).toEqual([
      ["reported_at", { ascending: false }],
    ]);
  });

  it("returns an empty list when PostgREST answers with null data", async () => {
    mock = createSupabaseMock({
      tables: { pre_existing_damages: { data: null } },
    });

    const { result } = await renderQueryHook(() =>
      useProjectDamages("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});
