// Local browser harness only, outside the application route tree/build.
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { I18nProvider } from "../../../src/i18n/provider";
import { ThemeProvider } from "../../../src/theme/provider";
import { markSplashDone } from "../../../src/lib/launch-sequence";
import { AdminStoriesEditor } from "../../../src/components/admin/AdminStoriesEditor";
import { PublishedStories } from "../../../src/components/home/HomeStories";
import { homeStoriesRepository } from "../../../src/backend/home-stories/repository";
import { supabaseV2 } from "../../../src/integrations/supabase/v2-client";
import "../../../src/styles.css";

markSplashDone();
// Only this fixture supplies a local fake session. The real admin route still
// requires server-verified staff access, and production auth is untouched.
supabaseV2.auth.getSession = async () => ({
  data: { session: { access_token: "stories-local-fixture" } as never },
  error: null,
});
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
// Entry-point-only test harness; not a reusable application module.
// eslint-disable-next-line react-refresh/only-export-components
function Preview() {
  const stories = useQuery({
    queryKey: ["home-stories"],
    queryFn: () => homeStoriesRepository.list(),
  });
  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-4 text-2xl">Stories</h1>
      <PublishedStories stories={stories.data ?? []} />
      <AdminStoriesEditor
        permissions={["editorial.read", "editorial.write", "editorial.publish"]}
      />
    </main>
  );
}
const root = createRootRoute({ component: Preview });
const router = createRouter({
  routeTree: root,
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </I18nProvider>,
);
