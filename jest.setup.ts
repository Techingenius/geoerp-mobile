import { notifyManager } from "@tanstack/react-query";

/**
 * Notify subscribers synchronously instead of on a batching `setTimeout`.
 *
 * TanStack Query batches cache notifications onto a macrotask. In the app that
 * is what keeps a burst of invalidations to one render; in a test it means the
 * re-render lands after the assertion's `act()` scope has closed, which React
 * reports as an update outside `act(...)` and which leaves a pending timer that
 * stops Jest exiting. Flushing synchronously removes both without changing any
 * behaviour the tests assert on.
 */
notifyManager.setScheduler((flush) => flush());
