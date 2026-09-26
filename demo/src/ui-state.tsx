/**
 * How the demo is being shown, as opposed to what the visitor has done
 * (`state.tsx`): inside the presenter's phone frame, full screen on a phone,
 * or opened on its own; and whether the sponsor placements are lit up.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * `stage`: in the presenter's phone frame on a large screen, which carries the
 * guide itself. `solo`: the presenter on a phone, where the app is the whole
 * screen and shows its own guide. `standalone`: app.html opened directly.
 */
export type DemoLayout = "stage" | "solo" | "standalone";

interface DemoUi {
  layout: DemoLayout;
  setLayout: (layout: DemoLayout) => void;
  highlightSponsor: boolean;
  setHighlightSponsor: (on: boolean) => void;
}

const Context = createContext<DemoUi | null>(null);

export function DemoUiProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<DemoLayout>(() =>
    window.parent === window ? "standalone" : "stage",
  );
  const [highlightSponsor, setHighlightSponsor] = useState(false);
  const value = useMemo(
    () => ({ layout, setLayout, highlightSponsor, setHighlightSponsor }),
    [layout, highlightSponsor],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDemoUi() {
  const value = useContext(Context);
  if (!value) throw new Error("useDemoUi outside DemoUiProvider");
  return value;
}
