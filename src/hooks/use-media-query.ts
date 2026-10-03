import { useEffect, useState } from "react";

/**
 * Whether a CSS media query matches right now. False on the server and on
 * the first render (so the page hydrates the way the server drew it), then
 * true or false as soon as the browser can say. Use it only for what CSS
 * alone cannot do, such as not drawing a second copy of a panel on a phone.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}
