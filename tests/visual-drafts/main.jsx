import { makeBranding } from "@/backend/match-visual-drafts/repository";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { I18nProvider } from "@/i18n/provider";
import { AdminStoriesEditor } from "@/components/admin/AdminStoriesEditor";
import "@/styles.css";
const repository = {
  list: async () => [],
  save: async () => {
    throw Error("fixture");
  },
  publish: async () => {
    throw Error("fixture");
  },
};
const params = new URLSearchParams(location.search);
const readOnly = params.has("readOnly");
window.__draftCalls = [];
window.__makeDefaultBrand = (r) => makeBranding(undefined, 588, 736, r);
let drafts = params.has("empty")
  ? []
  : [
      {
        id: "10000000-0000-4000-8000-000000000001",
        sourceUrl: "https://www.instagram.com/p/qa-post/",
        label: "FUS – Raja · 1–1",
        fixtureId: null,
        storyId: null,
        width: 588,
        height: 736,
        status: "held",
        rightsStatus: "unverified",
        hasResult: true,
        errorCode: null,
        version: 1,
        attempts: 1,
        leaseUntil: null,
        createdAt: "2026-10-14T00:00:00Z",
        updatedAt: "2026-10-14T00:00:00Z",
      },
    ];
const draftsRepository = {
  list: async () => {
    if (params.has("error")) throw Error("QA unavailable");
    return drafts;
  },
  preview: async (id, variant) => {
    window.__draftCalls.push({ action: "preview", id, variant });
    return "/qa/source.png";
  },
  import: async (input) => {
    window.__draftCalls.push({ action: "import", label: input.label, sourceUrl: input.sourceUrl });
    const draft = {
      ...drafts[0],
      id: "20000000-0000-4000-8000-000000000001",
      label: input.label,
      sourceUrl: input.sourceUrl,
      width: 588,
      height: 736,
      status: "held",
      hasResult: false,
      attempts: 0,
      version: 1,
    };
    drafts = [draft, ...drafts];
    return draft;
  },
  edit: async (d, rect, logo) => {
    window.__draftCalls.push({
      action: "edit",
      id: d.id,
      rectangle: rect,
      logo: logo?.name ?? "BotolaGO",
    });
    drafts = drafts.map((row) =>
      row.id === d.id ? { ...row, status: "held", hasResult: true, version: row.version + 1 } : row,
    );
  },
  discard: async (d) => {
    window.__draftCalls.push({ action: "discard", id: d.id });
    drafts = drafts.filter((row) => row.id !== d.id);
  },
};
const route = createRootRoute({
  component: () => (
    <I18nProvider>
      <main style={{ maxWidth: 1000, margin: "auto", padding: 24 }}>
        <h1>Stories · Admin</h1>
        <AdminStoriesEditor
          permissions={
            readOnly
              ? ["editorial.read"]
              : ["editorial.read", "editorial.write", "editorial.publish"]
          }
          repository={repository}
          draftsRepository={draftsRepository}
        />
      </main>
    </I18nProvider>
  ),
});
const router = createRouter({ routeTree: route });
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
