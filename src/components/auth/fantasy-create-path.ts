/**
 * Whether an account path started in the Fantasy builder (plan M1c): the `next` a guest carries
 * through register, verify and profile setup is the create flow's own address, possibly with a
 * query or a hash. Pure and free of the Manager Card's code, and imported by the profile-setup
 * route alone, so the build folds it into that route's chunk: the page asks for no extra file.
 */
const FANTASY_CREATE_PATH = "/fantasy/create";

export function isFantasyCreateNext(next: string | undefined): boolean {
  if (!next) return false;
  const path = next.split(/[?#]/, 1)[0];
  return path === FANTASY_CREATE_PATH || path === `${FANTASY_CREATE_PATH}/`;
}
