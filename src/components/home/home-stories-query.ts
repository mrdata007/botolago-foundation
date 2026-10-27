import { homeStoriesRepository } from "@/backend/home-stories/repository";
import type { HomeStory } from "@/backend/home-stories/contracts";
import { getNewsDataMode } from "@/services/news";

/** The story rail's read, shared by `HomeStories` and Home's server warm-up. */
export const homeStoriesQuery = {
  queryKey: ["home-stories"],
  queryFn: (): Promise<HomeStory[]> =>
    getNewsDataMode() === "supabase" ? homeStoriesRepository.list() : Promise.resolve([]),
};
