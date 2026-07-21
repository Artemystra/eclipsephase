// Physical/Mental health bars are two-part (health zone + Death Rating/Insanity overflow zone) on
// the actor sheet - mirror that split here instead of drawing a plain single-fill native bar.
const { Token } = foundry.canvas.placeables;

const OVERFLOW_BY_ATTRIBUTE = {
  "health.physical": { key: "death", colors: [0xa72727, 0x711616] },
  "health.mental": { key: "insanity", colors: [0x782dab, 0x48166c] }
};

const APPROXIMATION_SEGMENTS = 6;

// Coarse view for non-owners: quantize the combined health+overflow fill into fixed segments instead
// of a smooth fill, keeping the two-tone split so "wounded but stable" vs "bleeding into Death Rating/
// Insanity" still reads at a glance. Ceils so a barely-alive token never rounds down to "looks dead".
function drawApproximatedFill(bar, baseWidth, overflowWidth, baseFill, overflowFill, bh, s, colors) {
  const totalWidth = baseWidth + overflowWidth;
  const overallFraction = (baseFill * baseWidth + overflowFill * overflowWidth) / totalWidth;
  const filledSegments = overallFraction > 0
    ? Math.max(1, Math.ceil(overallFraction * APPROXIMATION_SEGMENTS))
    : 0;

  const overflowShare = overflowWidth / totalWidth;
  const overflowSegments = overflowFill > 0
    ? Math.min(filledSegments, Math.ceil(overflowShare * APPROXIMATION_SEGMENTS))
    : 0;
  const baseSegments = filledSegments - overflowSegments;

  const gap = 2 * s;
  const segmentWidth = (totalWidth - gap * (APPROXIMATION_SEGMENTS - 1)) / APPROXIMATION_SEGMENTS;
  for (let i = 0; i < filledSegments; i++) {
    const color = i < baseSegments ? colors[0] : colors[1];
    bar.beginFill(color, 1.0).drawRoundedRect(i * (segmentWidth + gap), 0, segmentWidth, bh, 1 * s);
  }
}

export default class EPtoken extends Token {
  // Bar2 now sits below the token (see _drawBar) - move the nameplate above instead of native's
  // below-token spot so the two don't collide. Anchor flips to bottom (1) so the text grows upward.
  // The elevation/resource tooltip text moves to the token's left instead, to stay clear of both.
  _refreshSize() {
    super._refreshSize();
    const { width, height } = this.document.getSize();
    const offset = CONFIG.Canvas.objectBorderThickness * 0.75 * canvas.dimensions.uiScale;
    this.nameplate.anchor.set(0.5, 1);
    this.nameplate.position.set(width / 2, -offset);
    this.tooltip.anchor.set(1, 0.5);
    this.tooltip.position.set(-offset, height / 2);
  }

  _drawBar(index, bar, data) {
    const split = OVERFLOW_BY_ATTRIBUTE[data.attribute];
    const overflow = split && this.actor?.system?.health?.[split.key];
    const { height } = this.document.getSize();
    const s = canvas.dimensions.uiScale;

    if (!split || !overflow?.max || !data.max) {
      super._drawBar(index, bar, data);
      // Move bar2 below the token instead of native's top-of-token spot (bar1 stays native, inside).
      if (index === 1) bar.position.set(0, height + 4 * s);
      return;
    }

    const { width } = this.document.getSize();
    const bw = width;
    const bh = 16 * (this.document.height >= 2 ? 1.5 : 1) * s; // twice the native bar height

    const baseWidth = bw * (data.max / (data.max + overflow.max));
    const overflowWidth = bw - baseWidth;
    const baseFill = Math.clamp(Number(data.value), 0, data.max) / data.max;
    const overflowFill = Math.clamp(Number(overflow.value), 0, overflow.max) / overflow.max;

    const showApprox = this.document.getFlag("eclipsephase", "showApproximation") ?? true;
    const useApproximation = showApprox && !this.document.isOwner;

    bar.clear();
    bar.lineStyle(s, 0x000000, 1.0);
    bar.beginFill(0x000000, 0.5).drawRoundedRect(0, 0, bw, bh, 3 * s);
    if (useApproximation) {
      drawApproximatedFill(bar, baseWidth, overflowWidth, baseFill, overflowFill, bh, s, split.colors);
    } else {
      bar.beginFill(split.colors[0], 1.0).drawRoundedRect(0, 0, baseFill * baseWidth, bh, 2 * s);
      bar.beginFill(split.colors[1], 1.0).drawRoundedRect(baseWidth, 0, overflowFill * overflowWidth, bh, 2 * s);
    }

    // Bar1 stays inside the token at the bottom edge (native spot); bar2 sits below, outside the token.
    bar.position.set(0, index === 0 ? height - bh : height + 4 * s);
  }
}
