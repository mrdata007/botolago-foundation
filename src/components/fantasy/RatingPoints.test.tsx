import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RatingPoints } from "./RatingPoints";

describe("awaiting real ratings", () => {
  it("labels a settled zero as Not rated without showing awaiting text", () => {
    const html = renderToStaticMarkup(
      <RatingPoints
        points={0}
        pending={false}
        notRated
        notRatedLabel="Apparition non notée"
        notRatedShortLabel="NN"
        awaitingLabel="En attente des notes"
      />,
    );
    expect(html).toContain(">0<");
    expect(html).toContain('aria-label="Apparition non notée"');
    expect(html).toContain(">NN<");
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain("En attente des notes");
  });

  it("can show a settled appearance beside earned points and another pending fixture", () => {
    const html = renderToStaticMarkup(
      <RatingPoints
        points={7}
        pending
        notRated
        notRatedLabel="مشاركة بلا تقييم"
        notRatedShortLabel="بلا تقييم"
        awaitingLabel="في انتظار التقييمات"
      />,
    );
    expect(html).toContain(">7<");
    expect(html).toContain('aria-label="مشاركة بلا تقييم"');
    expect(html).toContain('aria-label="في انتظار التقييمات"');
  });
  it("offers a labelled pending-rating popup without inventing a zero", () => {
    const html = renderToStaticMarkup(
      <RatingPoints
        points={null}
        pending
        awaitingLabel="En attente des notes"
        onAwaitingClick={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="En attente des notes"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("<button");
    expect(html).not.toContain(">En attente des notes<");
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("—");
  });

  it("keeps real zeroes distinct from missing ratings", () => {
    const html = renderToStaticMarkup(
      <RatingPoints
        points={0}
        pending={false}
        awaitingLabel="في انتظار التقييمات"
        onAwaitingClick={() => undefined}
      />,
    );
    expect(html).toContain(">0<");
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain("في انتظار التقييمات");
    expect(html).not.toContain("<button");
  });

  it("keeps earned points visible while another fixture is pending", () => {
    const html = renderToStaticMarkup(
      <RatingPoints points={7} pending awaitingLabel="في انتظار التقييمات" />,
    );
    expect(html).toContain(">7<");
    expect(html).toContain('aria-label="في انتظار التقييمات"');
  });
});
