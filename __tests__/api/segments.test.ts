import { waitFor } from "@testing-library/react-native";
import {
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
  activityLabel,
  budgetLineLabel,
  formatQty,
  segmentKeys,
  useBudgetLineLabels,
  useSegmentProgress,
  SEGMENT_STATE_COLOR,
  SEGMENT_STATE_LABEL,
} from "../../lib/api/segments";

/**
 * One `get_segment_progress` row: a segment × activity pair. The function
 * returns the segment's columns repeated on every one of its activity rows,
 * and a segment nobody has planned yet comes back once with every activity
 * column NULL.
 */
function progressRow(over: Record<string, unknown> = {}) {
  return {
    line_segment_id: "seg-1",
    segment_name: "Bore 1",
    assigned_crew_id: "crew-1",
    planned_date: "2026-11-20",
    length_ft: 420.5,
    state: "assigned",
    activity_id: "act-1",
    budget_line_id: "line-3101",
    line_name: "Bore principal",
    wave_product_code: "3101",
    unit_type: "drilling_ft",
    planned_qty: 400,
    reported_units: 100,
    approved_units: 50,
    pct_approved: 12.5,
    ...over,
  };
}

const lineString = {
  type: "LineString",
  coordinates: [
    [-110.9, 29.1],
    [-110.8, 29.2],
  ],
};

describe("useSegmentProgress", () => {
  it("does not query at all without a project id", async () => {
    mock = createSupabaseMock();

    await renderQueryHook(() => useSegmentProgress(undefined, null));

    expect(mock.supabase.rpc).not.toHaveBeenCalled();
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("narrows to one crew's segments, in the RPC and in the geometry read", async () => {
    mock = createSupabaseMock({
      rpcs: { get_segment_progress: { data: [progressRow()] } },
      tables: { line_segments: { data: [] } },
    });

    const { result } = await renderQueryHook(() =>
      useSegmentProgress("project-1", "crew-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mock.onlyRpc("get_segment_progress").params).toEqual({
      p_project_id: "project-1",
      p_crew_id: "crew-1",
    });
    // Both halves have to agree on the set, or the map draws lines for
    // segments the list does not have.
    expect(argsOf(mock.only("line_segments"), "eq")).toEqual([
      "project_id",
      "project-1",
    ]);
    const chain = mock.only("line_segments").chain.filter(
      (link) => link.method === "eq",
    );
    expect(chain.map((link) => link.args)).toEqual([
      ["project_id", "project-1"],
      ["assigned_crew_id", "crew-1"],
    ]);
  });

  it("omits p_crew_id entirely for the whole-project view", async () => {
    mock = createSupabaseMock({
      rpcs: { get_segment_progress: { data: [] } },
      tables: { line_segments: { data: [] } },
    });

    const { result } = await renderQueryHook(() =>
      useSegmentProgress("project-1", null),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Missing, not null: the argument defaults to NULL server-side, and an
    // admin or supervisor is meant to see every segment of the project.
    expect(mock.onlyRpc("get_segment_progress").params).toEqual({
      p_project_id: "project-1",
    });
    expect(
      mock
        .only("line_segments")
        .chain.filter((link) => link.method === "eq")
        .map((link) => link.args),
    ).toEqual([["project_id", "project-1"]]);
  });

  it("groups the rows by segment and keeps one entry per activity", async () => {
    mock = createSupabaseMock({
      rpcs: {
        get_segment_progress: {
          data: [
            progressRow(),
            progressRow({
              activity_id: "act-2",
              budget_line_id: "line-3116",
              line_name: "Handhold",
              wave_product_code: "3116",
              unit_type: "unit",
              planned_qty: 2,
              reported_units: 0,
              approved_units: 0,
              pct_approved: null,
            }),
            progressRow({
              line_segment_id: "seg-2",
              segment_name: "Bore 2",
              state: "unassigned",
              assigned_crew_id: null,
              planned_date: null,
              activity_id: null,
              budget_line_id: null,
              line_name: null,
              wave_product_code: null,
              unit_type: null,
              planned_qty: null,
              reported_units: null,
              approved_units: null,
              pct_approved: null,
            }),
          ],
        },
      },
      tables: {
        line_segments: {
          data: [{ id: "seg-1", geometry: lineString }, { id: "seg-2", geometry: null }],
        },
      },
    });

    const { result } = await renderQueryHook(() =>
      useSegmentProgress("project-1", "crew-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [first, second] = result.current.data!;
    expect(first.id).toBe("seg-1");
    expect(first.activities.map((a) => a.wave_product_code)).toEqual([
      "3101",
      "3116",
    ]);
    expect(first.geometry).toEqual(lineString);

    // A segment nobody planned is a segment with no activities, not a
    // malformed one: it still has to list and still has to be reportable.
    expect(second.id).toBe("seg-2");
    expect(second.activities).toEqual([]);
    expect(second.state).toBe("unassigned");
    expect(second.geometry).toBeNull();
  });

  it("computes what is left on the activity and never goes below zero", async () => {
    mock = createSupabaseMock({
      rpcs: {
        get_segment_progress: {
          data: [
            progressRow({ planned_qty: 400, reported_units: 100, approved_units: 50 }),
            progressRow({
              activity_id: "act-2",
              budget_line_id: "line-3105",
              // Already past the plan: the suggestion must be nothing left,
              // not a negative quantity in the units field.
              planned_qty: 100,
              reported_units: 120,
              approved_units: 30,
            }),
          ],
        },
      },
      tables: { line_segments: { data: [] } },
    });

    const { result } = await renderQueryHook(() =>
      useSegmentProgress("project-1", "crew-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [withRemainder, overPlan] = result.current.data![0].activities;
    expect(withRemainder.remaining).toBe(250);
    expect(overPlan.remaining).toBe(0);
  });

  it("reads a NUMERIC that PostgREST sent as a string", async () => {
    mock = createSupabaseMock({
      rpcs: {
        get_segment_progress: {
          data: [
            progressRow({
              planned_qty: "400.50",
              reported_units: "100.25",
              approved_units: "0",
              pct_approved: "0.00",
            }),
          ],
        },
      },
      tables: { line_segments: { data: [] } },
    });

    const { result } = await renderQueryHook(() =>
      useSegmentProgress("project-1", "crew-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // NUMERIC crosses PostgREST as a string whenever it would not survive a
    // float; arithmetic on that string would concatenate instead of subtract.
    const activity = result.current.data![0].activities[0];
    expect(activity.planned_qty).toBe(400.5);
    expect(activity.remaining).toBe(300.25);
  });

  it("surfaces an RPC error instead of an empty list", async () => {
    const error = { code: "42501", message: "permission denied", hint: null };
    mock = createSupabaseMock({
      rpcs: { get_segment_progress: { error } },
      tables: { line_segments: { data: [] } },
    });

    const { result } = await renderQueryHook(() =>
      useSegmentProgress("project-1", null),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();
  });
});

describe("useBudgetLineLabels", () => {
  it("keys the labels by budget line id", async () => {
    mock = createSupabaseMock({
      rpcs: {
        project_budget_line_labels: {
          data: [
            {
              budget_line_id: "line-3101",
              line_name: "Bore principal",
              wave_product_code: "3101",
              wave_product_name: "Directional Bore - Dirt",
              unit_type: "drilling_ft",
              is_active: true,
            },
          ],
        },
      },
    });

    const { result } = await renderQueryHook(() =>
      useBudgetLineLabels("project-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mock.onlyRpc("project_budget_line_labels").params).toEqual({
      p_project_id: "project-1",
    });
    expect(result.current.data!["line-3101"].wave_product_code).toBe("3101");
  });
});

describe("labels and formatting", () => {
  it("writes a quantity without trailing zeros", () => {
    expect(formatQty(120)).toBe("120");
    expect(formatQty(120.5)).toBe("120.5");
    expect(formatQty(120.456)).toBe("120.46");
  });

  it("puts the Wave code in front of the activity name", () => {
    expect(
      activityLabel({
        activity_id: "act-1",
        budget_line_id: "line-3101",
        line_name: "Bore principal",
        wave_product_code: "3101",
        unit_type: "drilling_ft",
        planned_qty: 400,
        reported_units: 0,
        approved_units: 0,
        pct_approved: 0,
        remaining: 400,
      }),
    ).toBe("3101 · Bore principal");
  });

  it("falls back when a line has no Wave product or no name", () => {
    expect(
      budgetLineLabel({
        budget_line_id: "line-x",
        line_name: null,
        wave_product_code: null,
        wave_product_name: null,
        unit_type: "unit",
        is_active: true,
      }),
    ).toBe("Actividad");
    expect(budgetLineLabel(undefined)).toBeNull();
  });

  it("has a colour and a label for every state the RPC can return", () => {
    // The screen indexes both maps by `state` with no fallback, so a state
    // added to the RPC and not here renders blank.
    const states = [
      "unassigned",
      "assigned",
      "in_progress",
      "complete",
      "approved",
    ] as const;
    for (const state of states) {
      expect(SEGMENT_STATE_LABEL[state]).toBeTruthy();
      expect(SEGMENT_STATE_COLOR[state]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("segmentKeys", () => {
  it("nests a project's progress under the collection key", () => {
    expect(segmentKeys.progress("project-1", "crew-1")).toEqual([
      ...segmentKeys.all,
      "project-1",
      "crew-1",
    ]);
  });

  it("keys the whole-project view apart from a crew's", () => {
    expect(segmentKeys.progress("project-1", null)).not.toEqual(
      segmentKeys.progress("project-1", "crew-1"),
    );
  });
});
