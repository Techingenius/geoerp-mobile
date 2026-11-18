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
import { useMyCrews, useReportableCrews } from "../../lib/api/crews";

const crew = (id: string, name: string) => ({
  id,
  name,
  is_active: true,
  organization_id: "org-1",
  lead_user_id: "user-1",
});

describe("useMyCrews", () => {
  it("does not query at all without a user id", async () => {
    mock = createSupabaseMock();

    await renderQueryHook(() => useMyCrews(undefined));

    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("asks for the crews the user leads when they are on no roster", async () => {
    mock = createSupabaseMock({
      tables: {
        crew_default_members: { data: [] },
        crews: { data: [crew("crew-1", "Cuadrilla A")] },
      },
    });

    const { result } = await renderQueryHook(() => useMyCrews("user-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // `id.in.()` with an empty list is a PostgREST syntax error, so the
    // member clause only goes in when there is at least one id.
    expect(argsOf(mock.only("crews"), "or")).toEqual([
      "lead_user_id.eq.user-1",
    ]);
    expect(argsOf(mock.only("crews"), "eq")).toEqual(["is_active", true]);
  });

  it("adds the crews the user is a standing member of", async () => {
    mock = createSupabaseMock({
      tables: {
        crew_default_members: {
          data: [{ crew_id: "crew-2" }, { crew_id: "crew-3" }],
        },
        crews: { data: [crew("crew-2", "Cuadrilla B")] },
      },
    });

    const { result } = await renderQueryHook(() => useMyCrews("user-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(argsOf(mock.only("crew_default_members"), "eq")).toEqual([
      "user_id",
      "user-1",
    ]);
    expect(argsOf(mock.only("crews"), "or")).toEqual([
      "lead_user_id.eq.user-1,id.in.(crew-2,crew-3)",
    ]);
  });

  it("surfaces the membership read failing instead of reporting no crews", async () => {
    const error = { code: "42501", message: "permission denied" };
    mock = createSupabaseMock({
      tables: { crew_default_members: { error } },
    });

    const { result } = await renderQueryHook(() => useMyCrews("user-1"));
    await waitFor(() => expect(result.current.isError).toBe(true));

    // An empty list here would read as "you are on no crew" and send a crew
    // lead to the org-wide picker, where every choice is an RLS denial.
    expect(result.current.error).toBe(error);
    expect(mock.on("crews")).toHaveLength(0);
  });
});

describe("useReportableCrews", () => {
  it("stops at the user's own crews and never reads the org list", async () => {
    mock = createSupabaseMock({
      tables: {
        crew_default_members: { data: [] },
        crews: { data: [crew("crew-1", "Cuadrilla A")] },
      },
    });

    const { result } = await renderQueryHook(() =>
      useReportableCrews("user-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      crews: [crew("crew-1", "Cuadrilla A")],
      scope: "mine",
    });
    // One read of `crews`, the filtered one: offering a crew lead all twelve
    // crews in the company is three extra taps and eleven RLS denials.
    expect(mock.on("crews")).toHaveLength(1);
  });

  it("falls back to the org's active crews for someone on no crew", async () => {
    mock = createSupabaseMock({
      tables: {
        crew_default_members: { data: [] },
        crews: [{ data: [] }, { data: [crew("crew-9", "Cuadrilla Z")] }],
      },
    });

    const { result } = await renderQueryHook(() =>
      useReportableCrews("admin-1"),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // An admin or supervisor reports on a crew's behalf, so they do get the
    // org list — but only after the narrow read comes back empty.
    expect(result.current.data!.scope).toBe("org");
    expect(result.current.data!.crews).toHaveLength(1);
    const [narrow, orgWide] = mock.on("crews");
    expect(argsOf(narrow, "or")).toEqual(["lead_user_id.eq.admin-1"]);
    expect(argsOf(orgWide, "or")).toBeUndefined();
    expect(argsOf(orgWide, "eq")).toEqual(["is_active", true]);
  });
});
