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

const entryInput: CreateProductionEntryInput = {
  project_id: "project-1",
  crew_id: "crew-1",
  units_completed: 12,
  unit_type: "drilling_ft",
  work_date: "2026-10-31",
  crew_member_ids: [],
};

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

    expect(mock.supabase.rpc).not.toHaveBeenCalled();
  });

  it("writes the entry and its roster through one RPC call", async () => {
    mock = createSupabaseMock({
      rpcs: { create_production_entry: { data: { id: "entry-1" } } },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({
        ...entryInput,
        crew_member_ids: ["worker-1", "worker-2"],
      });
    });

    // One call, not an insert followed by a second one: the entry and the
    // crew_members rows commit together (GRA-766, GRA-832).
    expect(mock.supabase.from).not.toHaveBeenCalled();
    expect(mock.onlyRpc("create_production_entry").args).toEqual({
      p_project_id: "project-1",
      p_crew_id: "crew-1",
      p_units_completed: 12,
      p_unit_type: "drilling_ft",
      p_work_date: "2026-10-31",
      p_crew_member_ids: ["worker-1", "worker-2"],
      // The function fills reported_by / created_by from auth.uid() and sets
      // internal_status / billing_status, so the client sends neither.
      p_line_segment_id: undefined,
      p_notes: undefined,
      p_budget_line_id: undefined,
      p_overproduction_reason: undefined,
    });
  });

  it("names the segment activity and carries the overproduction reason", async () => {
    mock = createSupabaseMock({
      rpcs: { create_production_entry: { data: { id: "entry-2" } } },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({
        ...entryInput,
        line_segment_id: "segment-1",
        budget_line_id: "line-3101",
        overproduction_reason: "  se extendió el bore  ",
        notes: "  turno corto  ",
      });
    });

    const args = mock.onlyRpc("create_production_entry").args!;
    expect(args.p_line_segment_id).toBe("segment-1");
    // Which activity is billed, and why it goes past the plan (GRA-831).
    expect(args.p_budget_line_id).toBe("line-3101");
    expect(args.p_overproduction_reason).toBe("se extendió el bore");
    expect(args.p_notes).toBe("turno corto");
  });

  it("omits the optional arguments instead of sending null", async () => {
    mock = createSupabaseMock({
      rpcs: { create_production_entry: { data: { id: "entry-3" } } },
    });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());
    await act(async () => {
      await result.current.mutateAsync({
        ...entryInput,
        line_segment_id: null,
        budget_line_id: null,
        overproduction_reason: "   ",
        notes: "   ",
      });
    });

    // An explicit null is not the same as letting the parameter default: the
    // defaults are what make a report with no segment or no activity legal.
    const args = mock.onlyRpc("create_production_entry").args!;
    expect(args.p_line_segment_id).toBeUndefined();
    expect(args.p_budget_line_id).toBeUndefined();
    expect(args.p_overproduction_reason).toBeUndefined();
    expect(args.p_notes).toBeUndefined();
  });

  it("propagates the RPC error as-is", async () => {
    const error = { code: "42501", message: "permission denied" };
    mock = createSupabaseMock({ rpcs: { create_production_entry: { error } } });

    const { result } = await renderQueryHook(() => useCreateProductionEntry());

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current
        .mutateAsync(entryInput)
        .catch((caught: unknown) => caught);
    });

    // 42501 is both the function's own "Not authenticated" and any RLS denial,
    // so the database's own message survives to the screen.
    expect(thrown).toBe(error);
  });

  it("refreshes the entry list and the segment progress on both paths", async () => {
    mock = createSupabaseMock({
      rpcs: {
        create_production_entry: [
          { data: { id: "entry-4" } },
          { error: { code: "40001", message: "serialization failure" } },
        ],
      },
    });

    const { result, queryClient } = await renderQueryHook(() =>
      useCreateProductionEntry(),
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync(entryInput);
    });
    await act(async () => {
      await result.current.mutateAsync(entryInput).catch(() => undefined);
    });

    const keys = invalidate.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown }).queryKey,
    );
    // Twice each: a response lost on the way back still leaves a committed
    // entry, and what the next report suggests comes off the activity total.
    expect(keys).toEqual([
      productionKeys.byProject("project-1"),
      segmentKeys.all,
      productionKeys.byProject("project-1"),
      segmentKeys.all,
    ]);
  });
});

describe("classifyPlanRejection", () => {
  const violation = (hint: string) => ({
    code: "23514",
    hint,
    message: "check constraint",
  });

  it("reads the overproduction rule off the hint", () => {
    expect(
      classifyPlanRejection(violation("Set overproduction_reason.")),
    ).toBe("overproduction_reason_required");
  });

  it("reads the ambiguous-activity rule off the hint", () => {
    expect(
      classifyPlanRejection(
        violation("Pass the budget line of the activity being reported."),
      ),
    ).toBe("activity_required");
  });

  it("reads the wrong-activity rule off the hint", () => {
    expect(
      classifyPlanRejection(
        violation("Add the activity to the segment, or report against one it has."),
      ),
    ).toBe("activity_not_on_segment");
  });

  it("claims nothing for another check violation or another code", () => {
    // Branching on `hint` and not on the message text: an unrecognised
    // violation has to fall through to the generic error path, not be guessed.
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
