import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { Board } from "./components/board";
import { JobDetailSheet } from "./components/job-detail-sheet";
import { ArchivedViewProvider } from "./lib/archived-view";

/** The board is always mounted; child routes layer on top of it. */
function AppShell() {
  return (
    <ArchivedViewProvider>
      <Board />
      <Outlet />
    </ArchivedViewProvider>
  );
}

const rootRoute = createRootRoute({ component: AppShell });

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

const jobDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs/$jobId",
  component: JobDetailSheet,
});

const routeTree = rootRoute.addChildren([boardRoute, jobDetailRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
