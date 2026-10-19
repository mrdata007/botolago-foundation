import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RatingPoints } from "./RatingPoints";

describe("awaiting real ratings", () => {
  it("labels a settled zero as Not rated without showing the awaiting loop", () => {
    const html = renderToStaticMarkup(
      <RatingPoints
        points={0}
        pending={false}
        notRated
        notRatedLabel="Apparition non notée"
        notRatedShortLabel="NN"
        awaitingLabel="En attente de note"
      />,
    );
    expect(html).toContain(">0<");
    expect(html).toContain('aria-label="Apparition non notée"');
    expect(html).toContain(">NN<");
    expect(html).not.toContain("animate-spin");
  });

  it("can show a settled appearance beside earned points and another pending fixture", () => {
    const html = renderToStaticMarkup(
      <RatingPoints
        points={7}
        pending
        notRated
        notRatedLabel="مشاركة بلا تقييم"
        notRatedShortLabel="بلا تقييم"
        awaitingLabel="في انتظار التقييم"
      />,
    );
    expect(html).toContain(">7<");
    expect(html).toContain('aria-label="مشاركة بلا تقييم"');
    expect(html).toContain('aria-label="في انتظار التقييم"');
  });
  it("shows a labelled loop without inventing a zero", () => {
    const html = renderToStaticMarkup(
      <RatingPoints points={null} pending awaitingLabel="En attente de note" />,
    );
    expect(html).toContain('aria-label="En attente de note"');
    expect(html).toContain("motion-safe:animate-spin");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("—");
  });

  it("keeps real zeroes distinct from missing ratings", () => {
    const html = renderToStaticMarkup(
      <RatingPoints points={0} pending={false} awaitingLabel="في انتظار التقييم" />,
    );
    expect(html).toContain(">0<");
    expect(html).not.toContain("animate-spin");
  });

  it("keeps earned points visible while another fixture is pending", () => {
    const html = renderToStaticMarkup(
      <RatingPoints points={7} pending awaitingLabel="في انتظار التقييم" />,
    );
    expect(html).toContain(">7<");
    expect(html).toContain('aria-label="في انتظار التقييم"');
  });
});
