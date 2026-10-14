/**
 * Asks the browser to confirm before the page is left (reload, close, a link
 * out such as a Google sign-in), while `active`. Returns the way to stop
 * asking; call it when the screen goes away or `active` turns false.
 */
export function attachLeaveWarning(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  active: boolean,
): () => void {
  if (!active) return () => undefined;
  const warn = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Older browsers only show the confirmation when this is set.
    event.returnValue = "";
  };
  target.addEventListener("beforeunload", warn);
  return () => target.removeEventListener("beforeunload", warn);
}
