import { act, waitFor } from "@testing-library/react-native";
import {
  allArgsOf,
  argsOf,
  createSupabaseMock,
  type RecordedQuery,
  type SupabaseMock,
} from "../helpers/supabase-mock";
import { renderQueryHook } from "../helpers/render-query-hook";

let mock: SupabaseMock;

jest.mock("../../lib/supabase/client", () => ({
  get supabase() {
    return mock.supabase;
  },
}));

// Imported after the mock so the module-level `supabase` binding is the stub.
import {
  ProductionMembersError,
  productionKeys,
  useActiveCrews,
  useCreateProductionEntry,
  useCrewDefaultMembers,
  useProjectProductionEntries,
  type CreateProductionEntryInput,
} from "../../lib/api/production";

const entryInput: CreateProductionEntryInput = {
  project_id: "project-1",
  crew_id: "crew-1",
  units_completed: 12,
  unit_type: "drilling_ft",
  work_date: "2026-10-31",
  crew_member_ids: [],
};

function insertPayload(query: RecordedQuery) {
  return argsOf(query, "insert")?.[0] as Record<string, unknown>;
}

describe("useActiveCrews", () => {
  it("asks only for active crews, ordered by name", async () => {
    mock = createSupabaseMock({
      tables: { crews: { data: [{ id: "crew-1", name: "Cuadrilla A" }] } },
    });

    const { result } = await renderQueryHook(() => useActiveCrews());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = mock.only("crews");
    expect(argsOf(query, "eq")).toEqual(["is_active", true]);
    expect(argsOf(query, "order")).toEqual(["name"]);
    // RLS scopes the org; an organization_id filter here would be a lie.
    expect(argsOf(query, "eq")).not.toContain("organization_id");
    expect(result.current.data).toEqual([{ id: "crew-1", name: "Cuadrilla A" }]);
  });

  it("returns an empty list when PostgREST answers with null data", async () => {
    mock = createSupabaseMock({ tables: { crews: { data: null } } });

    const { result } = await renderQueryHook(() => useActiveCrews());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it("surfaces a query error instead of an empty list", async () => {
    mock = createSupabaseMock({
      tables: { crews: { error: new Error("permission denied for crews") } },
    });

    const { result } = await renderQueryHook(() => useActiveCrews());
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toEqual(
      new Error("permission denied for crews"),
    );
  });
});

describe("useCrewDefaultMembers", () => {
  it("does not query at all without a crew id", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() => useCrewDefaultMembers(undefined));

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("flattens the joined profile and sorts by display name", async () => {
    mock = createSupabaseMock({
      tables: {
        crew_default_members: {
          data: [
            { user_id: "u-2", user_profile: { full_name: "Zacarías" } },
            { user_id: "u-1", user_profile: { full_name: "Ana" } },
          ],
        },
      },
    });

    const { result } = await renderQueryHook(() => useCrewDefaultMembers("crew-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { user_id: "u-1", full_name: "Ana" },
      { user_id: "u-2", full_name: "Zacarías" },
    ]);
    expect(argsOf(mock.only("crew_default_members"), "eq")).toEqual([
      "crew_id",
      "crew-1",
    ]);
  });

  it('falls back to "Sin nombre" for a missing or null profile', async () => {
    mock = createSupabaseMock({
      tables: {
        crew_default_members: {
          data: [
            { user_id: "u-1", user_profile: { full_name: null } },
            { user_id: "u-2", user_profile: null },
          ],
        },
      },
    });

    const { result } = await renderQueryHook(() => useCrewDefaultMembers("crew-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { user_id: "u-1", full_name: "Sin nombre" },
      { user_id: "u-2", full_name: "Sin nombre" },
    ]);
  });

  it("sorts accented names by locale, not by code point", async () => {
    mock = createSupabaseMock({
      tables: {
        crew_default_members: {
          data: [
            { user_id: "u-1", user_profile: { full_name: "Zulema" } },
            { user_id: "u-2", user_profile: { full_name: "Ángel" } },
          ],
        },
      },
    });

    const { result } = await renderQueryHook(() => useCrewDefaultMembers("crew-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // "Á" sorts after "Z" by code point; a field user expects it first.
    expect(result.current.data?.map((m) => m.full_name)).toEqual([
      "Ángel",
      "Zulema",
    ]);
  });
});

describe("useProjectProductionEntries", () => {
  it("does not query at all without a project id", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() =>
      useProjectProductionEntries(undefined),
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("reads the newest 20 entries for the project, newest work_date first", async () => {
    mock = createSupabaseMock({
      tables: { production_entries: { data: [{ id: "entry-1" }] } },
    });

    const { result } = await renderQueryHook(() =>
      useProjectProductionEntries("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = mock.only("production_entries");
    expect(argsOf(query, "eq")).toEqual(["project_id", "project-1"]);
    expect(allArgsOf(query, "order")).toEqual([
      ["work_date", { ascending: false }],
      ["created_at", { ascending: false }],
    ]);
    expect(argsOf(query, "limit")).toEqual([20]);
  });
});

describe("useCreateProductionEntry", () => {
  it("refuses to write anything without a session", async () => {
    mock = createSupabaseMock({ user: null });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());

    await act(async () => {
      await expect(result.current.mutateAsync(entryInput)).rejects.toThrow(
        "No hay sesión activa",
      );
    });

    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("writes the first approval tier explicitly and stamps the author", async () => {
    mock = createSupabaseMock({
      user: { id: "user-9" },
      tables: { production_entries: { data: { id: "entry-1" } } },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync(entryInput);
    });

    expect(insertPayload(mock.only("production_entries"))).toEqual({
      project_id: "project-1",
      line_segment_id: null,
      crew_id: "crew-1",
      units_completed: 12,
      unit_type: "drilling_ft",
      work_date: "2026-10-31",
      notes: null,
      reported_by: "user-9",
      created_by: "user-9",
      // Written, not left to the column default: the web approval queue reads
      // this pair and a changed default must not silently reroute the entry.
      internal_status: "reported",
      billing_status: "pending",
    });
  });

  it("sends project_id on the insert, since every RLS policy resolves org through it", async () => {
    mock = createSupabaseMock({
      tables: { production_entries: { data: { id: "entry-1" } } },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync(entryInput);
    });

    expect(insertPayload(mock.only("production_entries")).project_id).toBe(
      "project-1",
    );
  });

  it.each([
    ["trims surrounding whitespace", "  pozo tapado  ", "pozo tapado"],
    ["stores whitespace-only notes as null", "   ", null],
    ["stores an empty note as null", "", null],
    ["stores an omitted note as null", undefined, null],
  ])("%s", async (_label, notes, expected) => {
    mock = createSupabaseMock({
      tables: { production_entries: { data: { id: "entry-1" } } },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({ ...entryInput, notes });
    });

    expect(insertPayload(mock.only("production_entries")).notes).toBe(expected);
  });

  it("skips the crew_members write when nobody is on the shift", async () => {
    mock = createSupabaseMock({
      tables: { production_entries: { data: { id: "entry-1" } } },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({ ...entryInput, crew_member_ids: [] });
    });

    expect(mock.on("crew_members")).toHaveLength(0);
  });

  it("writes one crew_members row per worker, with the rate left to the web side", async () => {
    mock = createSupabaseMock({
      tables: {
        production_entries: { data: { id: "entry-7" } },
        crew_members: {},
      },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({
        ...entryInput,
        crew_member_ids: ["u-1", "u-2"],
      });
    });

    expect(argsOf(mock.only("crew_members"), "insert")?.[0]).toEqual([
      { production_entry_id: "entry-7", user_id: "u-1", rate_applied: null },
      { production_entry_id: "entry-7", user_id: "u-2", rate_applied: null },
    ]);
  });

  it("propagates an entry insert failure as-is", async () => {
    mock = createSupabaseMock({
      tables: {
        production_entries: { error: new Error("violates check constraint") },
      },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());

    await act(async () => {
      await expect(result.current.mutateAsync(entryInput)).rejects.toThrow(
        "violates check constraint",
      );
    });

    expect(mock.on("crew_members")).toHaveLength(0);
  });

  it("reports a failed roster write as a partial success carrying the entry id", async () => {
    const cause = new Error("crew_members: permission denied");
    mock = createSupabaseMock({
      tables: {
        production_entries: { data: { id: "entry-7" } },
        crew_members: { error: cause },
      },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.mutateAsync(entryWithMembers()).catch(
        (error: unknown) => error,
      );
    });

    // The entry row is already committed. A plain failure would send the user
    // to retry and bill the client twice for the same day of work.
    expect(thrown).toBeInstanceOf(ProductionMembersError);
    const error = thrown as ProductionMembersError;
    expect(error.name).toBe("ProductionMembersError");
    expect(error.entryId).toBe("entry-7");
    expect(error.message).toBe("crew_members: permission denied");
    expect(error.cause).toBe(cause);
  });

  it("falls back to a Spanish message when the roster failure is not an Error", async () => {
    mock = createSupabaseMock({
      tables: {
        production_entries: { data: { id: "entry-7" } },
        crew_members: { error: { code: "42501" } },
      },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.mutateAsync(entryWithMembers()).catch(
        (error: unknown) => error,
      );
    });

    expect((thrown as ProductionMembersError).message).toBe(
      "No se pudieron guardar los integrantes",
    );
    expect((thrown as ProductionMembersError).entryId).toBe("entry-7");
  });

  it("invalidates the project's entry list on success", async () => {
    mock = createSupabaseMock({
      tables: { production_entries: { data: { id: "entry-1" } } },
    });

    const { result, queryClient } = await renderQueryHook(() =>
      useCreateProductionEntry(),
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync(entryInput);
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: productionKeys.byProject("project-1"),
    });
  });

  it("invalidates the list on the partial-success path too", async () => {
    mock = createSupabaseMock({
      tables: {
        production_entries: { data: { id: "entry-7" } },
        crew_members: { error: new Error("nope") },
      },
    });

    const { result, queryClient } = await renderQueryHook(() =>
      useCreateProductionEntry(),
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current
        .mutateAsync(entryWithMembers())
        .catch(() => undefined);
    });

    // onSettled, not onSuccess: the duplicate-entry banner reads this list, so
    // the one case that most needs the warning is the one that must refresh.
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: productionKeys.byProject("project-1"),
    });
  });
});

describe("productionKeys", () => {
  it("namespaces a project's entries under the collection key", () => {
    expect(productionKeys.byProject("project-1")).toEqual([
      "production-entries",
      "project",
      "project-1",
    ]);
    expect(productionKeys.byProject("project-1").slice(0, 1)).toEqual(
      productionKeys.all,
    );
  });

  it("keys crew rosters per crew", () => {
    expect(productionKeys.crewDefaultMembers("crew-1")).not.toEqual(
      productionKeys.crewDefaultMembers("crew-2"),
    );
  });
});

function entryWithMembers(): CreateProductionEntryInput {
  return { ...entryInput, crew_member_ids: ["u-1"] };
}
