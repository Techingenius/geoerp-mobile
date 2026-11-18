import { act, waitFor } from "@testing-library/react-native";
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

// Imported after the mock so the module-level `supabase` binding is the stub.
import {
  classifyPlanRejection,
  productionKeys,
  useActiveCrews,
  useCreateProductionEntry,
  useCrewDefaultMembers,
  useProjectProductionEntries,
  type CreateProductionEntryInput,
} from "../../lib/api/production";
import { segmentKeys } from "../../lib/api/segments";

/**
 * The single database function the create hook writes through (GRA-832). The
 * entry and its `crew_members` land in one transaction, so there is no second
 * request to lose and no half-written entry to report on — which is why these
 * tests assert on the function's arguments rather than on a sequence of
 * inserts, and why no test here queues a `crew_members` table response.
 */
const CREATE_ENTRY = "create_production_entry";

const entryInput: CreateProductionEntryInput = {
  project_id: "project-1",
  crew_id: "crew-1",
  units_completed: 12,
  unit_type: "drilling_ft",
  work_date: "2026-10-31",
  crew_member_ids: [],
};

/** A mock whose `create_production_entry` answers with one committed row. */
function mockReturning(entry: Record<string, unknown> = { id: "entry-1" }) {
  return createSupabaseMock({ rpcs: { [CREATE_ENTRY]: { data: entry } } });
}

/** The arguments the hook sent to `create_production_entry`. */
function rpcParams() {
  return mock.onlyRpc(CREATE_ENTRY).params as Record<string, unknown>;
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

    // The local session read exists to keep this case in the app's language;
    // without it the call would go out as anon and come back as a bare
    // permission-denied, so nothing may reach the database first.
    expect(mock.supabase.rpc).not.toHaveBeenCalled();
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("writes the entry and its roster in a single call", async () => {
    mock = mockReturning({ id: "entry-7" });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({
        ...entryInput,
        crew_member_ids: ["u-1", "u-2"],
      });
    });

    expect(rpcParams()).toEqual({
      p_project_id: "project-1",
      p_crew_id: "crew-1",
      p_units_completed: 12,
      p_unit_type: "drilling_ft",
      p_work_date: "2026-10-31",
      p_crew_member_ids: ["u-1", "u-2"],
      p_line_segment_id: undefined,
      p_notes: undefined,
    });
    // One request, and no table write beside it: a crew reporting on
    // intermittent signal can no longer land an entry whose roster was lost.
    expect(mock.rpcs).toHaveLength(1);
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("leaves the author and the approval tier to the function", async () => {
    mock = mockReturning();

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync(entryInput);
    });

    // `reported_by` / `created_by` come from `auth.uid()` and the
    // `internal_status: 'reported'` / `billing_status: 'pending'` pair the web
    // approval queue reads is set server-side. A client that sent them back
    // would be claiming an authorship the database does not have to believe,
    // and would need a round trip to read the current user first.
    // The two GRA-831 arguments are part of the set the client is allowed to
    // send: they say which activity is billed and why the entry goes past the
    // plan, both of which only the reporter knows. Everything the database can
    // decide for itself stays off this list.
    expect(Object.keys(rpcParams()).sort()).toEqual([
      "p_budget_line_id",
      "p_crew_id",
      "p_crew_member_ids",
      "p_line_segment_id",
      "p_notes",
      "p_overproduction_reason",
      "p_project_id",
      "p_unit_type",
      "p_units_completed",
      "p_work_date",
    ]);
  });

  it("sends project_id, since every RLS policy resolves org through it", async () => {
    mock = mockReturning();

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync(entryInput);
    });

    expect(rpcParams().p_project_id).toBe("project-1");
  });

  it("sends an empty roster as an empty array, not as a skipped write", async () => {
    mock = mockReturning();

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({ ...entryInput, crew_member_ids: [] });
    });

    // `p_crew_member_ids` is a required argument, so an empty shift still has
    // to carry it; there is no second request left to skip.
    expect(rpcParams().p_crew_member_ids).toEqual([]);
    expect(mock.on("crew_members")).toHaveLength(0);
  });

  it.each([
    ["passes a segment id through", "segment-3", "segment-3"],
    ["omits a null segment", null, undefined],
    ["omits an absent segment", undefined, undefined],
  ])("%s", async (_label, line_segment_id, expected) => {
    mock = mockReturning();

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({ ...entryInput, line_segment_id });
    });

    // Omitted rather than sent as null: the argument is optional in the
    // function's signature, and PostgREST drops undefined so the default
    // applies. An explicit null would be a value the function has to handle.
    expect(rpcParams().p_line_segment_id).toBe(expected);
  });

  it.each([
    ["trims surrounding whitespace", "  pozo tapado  ", "pozo tapado"],
    ["omits whitespace-only notes", "   ", undefined],
    ["omits an empty note", "", undefined],
    ["omits an absent note", undefined, undefined],
  ])("%s", async (_label, notes, expected) => {
    mock = mockReturning();

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({ ...entryInput, notes });
    });

    expect(rpcParams().p_notes).toBe(expected);
  });

  it.each([
    ["passes the activity through", "line-3101", "line-3101"],
    ["omits a null activity", null, undefined],
    ["omits an absent activity", undefined, undefined],
  ])("%s", async (_label, budget_line_id, expected) => {
    mock = mockReturning();

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({ ...entryInput, budget_line_id });
    });

    // Which of the segment's activities is billed (GRA-831). Omitted rather
    // than null for the same reason as the segment: on a segment with no plan
    // the function's default is what keeps the old way of reporting working.
    expect(rpcParams().p_budget_line_id).toBe(expected);
  });

  it.each([
    ["trims the reason", "  se extendió el bore  ", "se extendió el bore"],
    ["omits a whitespace-only reason", "   ", undefined],
    ["omits an absent reason", undefined, undefined],
  ])("%s", async (_label, overproduction_reason, expected) => {
    mock = mockReturning();

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({
        ...entryInput,
        overproduction_reason,
      });
    });

    // A reason of spaces is no reason: the trigger reads it with btrim and
    // would reject the entry anyway, so sending it would only turn a form
    // error into a 400.
    expect(rpcParams().p_overproduction_reason).toBe(expected);
  });

  it("refreshes the segment progress too, not only the entry list", async () => {
    mock = mockReturning();

    const { result, queryClient } = await renderQueryHook(() =>
      useCreateProductionEntry(),
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync(entryInput);
    });

    // What the activity has left is the next report's suggested quantity, so a
    // stale progress cache offers the field a number that was already used.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: segmentKeys.all });
  });

  it("returns the committed row the function answered with", async () => {
    mock = mockReturning({ id: "entry-7", internal_status: "reported" });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync(entryInput);
    });

    expect(result.current.data).toEqual({
      id: "entry-7",
      internal_status: "reported",
    });
    // No `.single()`: the function returns one row, so PostgREST answers with
    // the object itself and asking for a single row would be a second shape.
    expect(argsOf(mock.onlyRpc(CREATE_ENTRY), "single")).toBeUndefined();
  });

  it("propagates the function's error untouched", async () => {
    // `42501` is both the function's own "Not authenticated" and any RLS
    // denial, so the database's message is more honest than anything this
    // layer could substitute for it.
    const error = {
      code: "42501",
      message: "new row violates row-level security policy",
    };
    mock = createSupabaseMock({ rpcs: { [CREATE_ENTRY]: { error } } });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current
        .mutateAsync(entryInput)
        .catch((caught: unknown) => caught);
    });

    expect(thrown).toBe(error);
  });

  it("invalidates the project's entry list on success", async () => {
    mock = mockReturning();

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

  it("invalidates the list on the failure path too", async () => {
    mock = createSupabaseMock({
      rpcs: { [CREATE_ENTRY]: { error: new Error("network request failed") } },
    });

    const { result, queryClient } = await renderQueryHook(() =>
      useCreateProductionEntry(),
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync(entryInput).catch(() => undefined);
    });

    // onSettled, not onSuccess. The write is atomic, so a failure never leaves
    // a half-written entry — but a response lost on the way back still leaves a
    // COMMITTED entry the app believes failed. The recent-entries list is what
    // the duplicate-entry banner reads, so the one case that most needs the
    // warning is the one that must refresh. Keyed off `variables`, since `data`
    // is undefined here.
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: productionKeys.byProject("project-1"),
    });
  });
});

describe("classifyPlanRejection", () => {
  const violation = (hint: string) => ({
    code: "23514",
    hint,
    message: "check constraint",
  });

  it.each([
    ["Set overproduction_reason.", "overproduction_reason_required"],
    ["Pass the budget line of the activity being reported.", "activity_required"],
    [
      "Add the activity to the segment, or report against one it has.",
      "activity_not_on_segment",
    ],
  ])("reads %s off the hint", (hint, expected) => {
    expect(classifyPlanRejection(violation(hint))).toBe(expected);
  });

  it("claims nothing for another violation, another code or a plain error", () => {
    // Branching on `hint` and not on the message: an unrecognised violation has
    // to fall through to the generic error path, not be guessed at. The screen
    // turns each of these into a different instruction, and the wrong one sends
    // a crew lead looking for a field that is already filled in.
    expect(classifyPlanRejection(violation("something else"))).toBeNull();
    expect(
      classifyPlanRejection({ code: "42501", hint: null, message: "denied" }),
    ).toBeNull();
    expect(classifyPlanRejection(new Error("network"))).toBeNull();
    expect(classifyPlanRejection(null)).toBeNull();
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
