import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";

/**
 * Render a TanStack Query hook with a client that fails fast.
 *
 * `retry: false` matters: the hooks under test throw PostgREST errors on
 * purpose, and the app default would retry three times before surfacing one,
 * turning every error assertion into a timeout. A fresh client per call keeps
 * the cache from leaking an earlier test's data into the next.
 *
 * Async because RNTL 14's `renderHook` is — it awaits React's concurrent
 * render rather than flushing it synchronously, so `result.current` is only
 * populated once the returned promise resolves.
 */
export async function renderQueryHook<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      // gcTime 0 on mutations too: the 5-minute default parks a timer per
      // mutation, and Jest will not let the worker exit while one is pending.
      mutations: { retry: false, gcTime: 0 },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { ...(await renderHook(hook, { wrapper })), queryClient };
}
