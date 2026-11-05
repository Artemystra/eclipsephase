import { TACNET_KEY, seesThroughTacnet, sharedSightMode } from "../common/morp-functions.js";
// Physical/Mental bars are two-part (health zone + Death Rating/Insanity overflow), like the actor sheet, not a single-fill native bar.
const { Token } = foundry.canvas.placeables;

const OVERFLOW_BY_ATTRIBUTE = {
  "health.physical": { key: "death", colors: [0xa72727, 0x711616] },
  "health.mental": { key: "insanity", colors: [0x782dab, 0x48166c] }
};

const APPROXIMATION_SEGMENTS = 6;
const BAR_ANIMATION_STEP_MS = 7; // matches damage.js's barUp()/barDown() pacing on the actor sheet

// Coarse non-owner view: segment slots per zone are reserved by width share (same ratio as the exact
// bar), then each zone independently lights up its own slots by its own fill.
function drawApproximatedFill(bar, baseWidth, overflowWidth, baseFill, overflowFill, bh, s, colors) {
  const totalWidth = baseWidth + overflowWidth;
  const baseSlots = Math.round(baseWidth / totalWidth * APPROXIMATION_SEGMENTS);
  const overflowSlots = APPROXIMATION_SEGMENTS - baseSlots;

  const litBaseSegments = baseFill > 0 ? Math.max(1, Math.ceil(baseFill * baseSlots)) : 0;
  const litOverflowSegments = overflowFill > 0 ? Math.max(1, Math.ceil(overflowFill * overflowSlots)) : 0;

  const gap = 2 * s;
  const segmentWidth = (totalWidth - gap * (APPROXIMATION_SEGMENTS - 1)) / APPROXIMATION_SEGMENTS;
  for (let i = 0; i < litBaseSegments; i++) {
    bar.beginFill(colors[0], 1.0).drawRoundedRect(i * (segmentWidth + gap), 0, segmentWidth, bh, 1 * s);
  }
  for (let i = 0; i < litOverflowSegments; i++) {
    bar.beginFill(colors[1], 1.0).drawRoundedRect((baseSlots + i) * (segmentWidth + gap), 0, segmentWidth, bh, 1 * s);
  }
}

/**
 * The background shader of a tacnet's shared sight: the picture with shifted colours and scanlines, as a camera feed has.
 * @returns {Function} The shader class
 */
export function tacnetVisionShader() {
  const BackgroundVisionShader = foundry.canvas.rendering.shaders.BackgroundVisionShader;
  return class TacnetVisionShader extends BackgroundVisionShader {
    static FRAGMENT_END = `
    vec2 colorShift = vec2(3.0 / screenDimensions.x, 0.0);
    finalColor.r = texture2D(primaryTexture, vSamplerUvs + colorShift).r;
    finalColor.b = texture2D(primaryTexture, vSamplerUvs - colorShift).b;
    finalColor *= 1.0 - 0.25 * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.0472));
    ${super.FRAGMENT_END}
    `;

    get isRequired() {
      return true;
    }
  };
}

/**
 * Rebuilds every token's sight, so shared sight follows who is on a tacnet and how the user wants it drawn.
 * @returns {void}
 */
export function refreshSharedSight() {
  if (!canvas?.ready) return;
  for (const token of canvas.tokens.placeables) token.initializeVisionSource();
  canvas.perception.update({ initializeVisionModes: true, refreshVision: true, refreshLighting: true });
}

/**
 * Keeps what a user sees through tacnets current when someone joins or leaves one.
 * @returns {void}
 */
export function registerTacnetVision() {
  const refresh = foundry.utils.debounce(refreshSharedSight, 50);
  const carriesTacnet = effect => Array.from(effect?.changes ?? effect?.system?.changes ?? []).some(change => change.key === TACNET_KEY);
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, effect => { if (carriesTacnet(effect)) refresh(); });
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, item => { if (Array.from(item.effects ?? []).some(carriesTacnet)) refresh(); });
  Hooks.on("controlToken", refresh);
}

export default class EPtoken extends Token {
  /**
   * Whether this token is only a source of sight through a tacnet, not one of the user's own.
   * @returns {Boolean} True for a tacnet's shared sight
   */
  get #sharedSight() {
    if (!canvas.visibility.tokenVision || !this.hasSight || this.document.hidden || super._isVisionSource()) return false;
    return seesThroughTacnet(this, this.layer.placeables, game.user);
  }

  _isVisionSource() {
    return super._isVisionSource() || this.#sharedSight;
  }

  // Shared sight has its own look, unless the user turned sight effects off. A token without a range of its own still needs one, or it draws nothing.
  _getVisionSourceData() {
    const data = super._getVisionSourceData();
    if (!this.#sharedSight) return data;
    return { ...data, visionMode: sharedSightMode(game.settings.get("eclipsephase", "visionEffects")), radius: data.radius || data.lightRadius };
  }

  // Per bar index: displayed/target scalar (0..combinedMax) driving the fill animation.
  #barFill = {};
  #barAnimId = {};

  // Bar2 sits below the token (see _drawBar), so nameplate/tooltip are repositioned to avoid it.
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

    // Source the target from the actor's own persisted data, not `data`/`overflow` (the TokenDocument
    // bar mirror, which Foundry tweens through intermediate values on every redraw) - keeps our own
    // animation single-shot. death.value derives from physical.value, so animating physical.value
    // alone gives base-then-overflow fill for free.
    const rawValue = Number(foundry.utils.getProperty(this.actor.system, data.attribute)?.value ?? 0);
    const combinedMax = data.max + overflow.max;
    const target = Math.clamp(rawValue, 0, combinedMax);

    let state = this.#barFill[index];
    if (!state) state = this.#barFill[index] = { displayed: target, target };

    if (state.target !== target) {
      state.target = target;
      this.#animateBar(index, bar, data, overflow, split, state);
    } else if (this.#barAnimId[index] === undefined) {
      this.#renderBar(index, bar, data, overflow, split, state.displayed);
    }
  }

  #animateBar(index, bar, data, overflow, split, state) {
    if (this.#barAnimId[index] !== undefined) return; // already converging on the (possibly just-updated) target
    const animId = Symbol();
    this.#barAnimId[index] = animId;
    const combinedMax = data.max + overflow.max;
    const STEP = combinedMax * 0.01; // ~1% of the combined range per tick, matching damage.js's pacing

    (async () => {
      while (this.#barAnimId[index] === animId && !this.destroyed && state.displayed !== state.target) {
        const delta = state.target - state.displayed;
        state.displayed += Math.sign(delta) * Math.min(STEP, Math.abs(delta));
        this.#renderBar(index, bar, data, overflow, split, state.displayed);
        await new Promise(resolve => setTimeout(resolve, BAR_ANIMATION_STEP_MS));
      }
      if (this.#barAnimId[index] === animId) this.#barAnimId[index] = undefined;
    })();
  }

  #renderBar(index, bar, data, overflow, split, displayedValue) {
    const { width, height } = this.document.getSize();
    const s = canvas.dimensions.uiScale;
    const bw = width;
    const bh = 16 * (this.document.height >= 2 ? 1.5 : 1) * s; // twice the native bar height

    const baseWidth = bw * (data.max / (data.max + overflow.max));
    const overflowWidth = bw - baseWidth;

    const showApprox = this.document.getFlag("eclipsephase", "showApproximation") ?? true;
    const useApproximation = showApprox && !this.document.isOwner;

    // Fill fractions derive from the single animated scalar, mirroring EPactor.js's
    // _calculatePhysicalHealth (death stays 0 until physical crosses its max).
    const baseFill = Math.clamp(displayedValue, 0, data.max) / data.max;
    const overflowFill = Math.clamp(displayedValue - data.max, 0, overflow.max) / overflow.max;

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
