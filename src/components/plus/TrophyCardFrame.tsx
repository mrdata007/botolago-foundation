import type { ReactNode } from "react";

import { useMyTrophies } from "@/services/use-trophies";

import { usePlusAccess } from "./plus-access";

import "./plus-trophies.css";

/**
 * Draws the member's chosen frame around the Manager Card on Curva's card page. For anyone who is
 * not a member (or while BotolaGO+ is off) it renders its children as they are and asks for nothing.
 * The frame is cosmetic: the card inside it, its rating and its tier are untouched.
 */
export function TrophyCardFrame({ children }: { children: ReactNode }) {
  const access = usePlusAccess();
  if (access !== "member") return <>{children}</>;
  return <Framed>{children}</Framed>;
}

function Framed({ children }: { children: ReactNode }) {
  const query = useMyTrophies(true);
  const frame = query.data?.frame ?? "standard";
  return (
    <div className="tr-frame tr-card-frame" data-frame={frame} data-testid="card-frame">
      {children}
    </div>
  );
}
