import { escapeText } from "./general-sheet-functions.js";
import { registerSocketActions, relayToActiveGM } from "./socket.js";

// Picking targets and areas on the canvas: the cursor, the marks, the shapes they are drawn in, the
// areas a blast or a cone covers, and the
// attack dialog's pick button. Free of rules - what an attack strikes is the caller's business.

// The shapes the target picker can draw besides Font Awesome icons, traced from the system's own
// icon art: resources/icons/target-slash.svg (melee) and target-lightning.svg (psi). Kept as path
// data so a cursor and a mark can be drawn in any colour without loading a file.

// The cursor melee attacks pick their targets with.
export const MELEE_CURSOR = { icon: "ep-slash" };

export const TARGET_SHAPES = {
  "ep-slash": { viewBox: 1024, d: "M 946.778 43.937 C 906.432 66.373, 875.466 91.017, 853.086 118.500 C 763.321 228.732, 670.059 311.067, 584.497 355.620 C 576.702 359.679, 570.017 363, 569.643 363 C 569.269 363, 586.521 328.199, 607.981 285.664 C 631.043 239.956, 647 207.208, 647 205.587 C 647 200.136, 639.879 195.574, 634.558 197.616 C 633.675 197.955, 623.872 209.767, 612.772 223.866 C 524.327 336.214, 372.778 521.976, 338.546 560 C 231.503 678.901, 129.864 811.371, 60.797 922 C 40.981 953.741, 38.997 957.564, 39.022 963.958 C 39.073 976.849, 48.230 986, 61.078 986 C 65.848 986, 69.452 984.307, 110.860 962.623 C 171.662 930.781, 253.067 888.478, 431.500 795.995 C 514.550 752.950, 595.740 710.859, 611.922 702.460 C 643.066 686.296, 644.939 684.914, 643.510 679.151 C 642.534 675.219, 639.075 672, 635.826 672 C 634.272 672, 561.814 691.114, 474.809 714.476 C 387.804 737.837, 316.458 756.791, 316.262 756.595 C 314.540 754.873, 384.785 682.901, 410 660.552 C 467.472 609.612, 510.127 580.016, 567 551.621 C 614.936 527.687, 632.369 514.312, 673.422 469.975 C 788.091 346.129, 904.656 196.973, 971.231 88.900 C 984.092 68.022, 985.004 66.090, 984.978 59.790 C 984.925 47.092, 975.655 38, 962.759 38 C 958.147 38, 956.060 38.775, 946.778 43.937 M 218.249 439.751 C 215.862 442.138, 171.156 556.776, 169.422 564.958 C 167.223 575.328, 167.769 590.333, 171.424 619.970 C 174.698 646.528, 174.899 647.516, 177.461 649.720 C 183.812 655.183, 186.428 653.006, 202.721 628.702 C 225.997 593.981, 225.936 594.195, 227.014 543.500 C 228.754 461.697, 228.656 440.953, 226.521 439.392 C 223.920 437.490, 220.356 437.644, 218.249 439.751 M 771.675 525.461 C 707.985 539.648, 703.383 540.916, 692.534 547.267 C 686.377 550.872, 646.137 584.275, 640.250 590.668 C 637.315 593.855, 637.381 598.170, 640.418 601.694 L 642.837 604.500 671.668 604.386 C 703.381 604.261, 709.016 603.456, 722.556 597.121 C 729.331 593.950, 836.791 524.651, 838.750 522.189 C 841.903 518.227, 838.898 511.929, 833.921 512.068 C 832.590 512.105, 804.579 518.132, 771.675 525.461" },
  "ep-lightning": { viewBox: 1024, d: "M 655.450 74.131 C 654.240 74.719, 650.820 80.331, 647.110 87.814 C 607.273 168.168, 542.534 184.806, 467 134.101 C 453.445 125.002, 452.169 124.934, 434.944 132.378 C 395.199 149.555, 361.470 166.982, 335.752 183.629 C 321.192 193.053, 321.274 192.811, 322.819 221.747 C 324.345 250.334, 324.364 278.945, 322.867 294.536 C 321.450 309.303, 321.580 309.617, 332.500 317.750 C 341.451 324.416, 351.976 334.593, 355.737 340.218 C 358.638 344.557, 361.578 345.850, 363.705 343.724 C 365.779 341.649, 369.275 311.977, 368.738 301 C 368.359 293.241, 367.921 291.729, 363.722 283.663 C 342.874 243.621, 366.446 203.223, 417.016 192.328 C 428.396 189.876, 456.026 189.904, 467 192.378 C 499.736 199.759, 535.305 213.315, 566.429 230.270 C 571.893 233.246, 573.081 233.500, 581.561 233.500 L 590.763 233.500 603.132 227.333 C 654.122 201.911, 689.685 162.705, 708.511 111.163 C 710.587 105.478, 714.697 96.827, 717.643 91.940 C 723.812 81.708, 724.082 79.928, 720.077 75.923 L 717.154 73 687.327 73.068 C 669.710 73.108, 656.661 73.543, 655.450 74.131 M 817.147 74.053 C 811.785 75.134, 805.521 78.748, 801.352 83.165 C 798.013 86.701, 738.459 186.655, 734.122 196 C 730.340 204.151, 730.523 214.371, 734.677 227 C 749.936 273.386, 730.333 316.026, 686.448 331.905 C 664.868 339.714, 671.970 339.311, 544.914 339.939 L 431.327 340.500 427.340 343.264 C 420.635 347.911, 418.869 352.322, 417.885 366.868 C 414.929 410.607, 404.515 442.951, 382.957 475.347 C 371.308 492.852, 360.954 501.670, 343.527 508.924 C 317.453 519.779, 292.291 519.358, 258.678 507.505 C 236.496 499.684, 210.378 495.174, 194.014 496.341 C 156.526 499.014, 124.821 525.092, 113.331 562.703 C 109.869 574.035, 109.366 596.242, 112.327 607 C 115.119 617.143, 121.293 628.636, 129.517 639 C 141.925 654.637, 145.681 664.852, 144.691 680.269 C 144.151 688.677, 144.224 689.101, 146.488 690.584 C 149.733 692.710, 152.924 690.963, 161.706 682.249 C 173.848 670.201, 178.541 658.163, 177.757 641.077 C 177.207 629.091, 175.097 622.282, 169.285 613.736 C 155.541 593.530, 156.550 575.401, 172.367 558.317 C 199.123 529.417, 248.997 535.636, 304.124 574.745 C 326.283 590.466, 331.576 598.178, 331.406 614.500 C 331.090 644.922, 301.915 669.697, 274.228 663.055 C 265.778 661.027, 261.222 663.932, 257.064 674 C 248.894 693.777, 227.196 722.676, 195.121 756.500 C 175.956 776.709, 62.993 908.311, 62.197 911.356 C 61.791 912.909, 62.089 913.210, 63.630 912.807 C 64.701 912.527, 100.758 887.258, 143.758 856.653 C 228.082 796.636, 226.754 797.456, 235.750 799.848 C 245.269 802.378, 251.829 812.920, 257.625 835 C 264.101 859.669, 260.977 874.155, 247.643 881.284 C 240.099 885.317, 219.065 883.257, 204.667 877.075 C 197.944 874.189, 189.494 874.265, 185.229 877.250 C 180.459 880.589, 117 946.993, 117 948.645 C 117 952.041, 121.537 949.989, 155.549 931.208 C 175.322 920.290, 193.718 910.602, 196.428 909.679 C 203.367 907.315, 209.241 907.571, 225.928 910.961 C 243.059 914.441, 261.189 916.130, 269.210 914.993 C 286.350 912.562, 301.162 897.967, 303.961 880.748 C 305.077 873.883, 303.704 845.272, 301.466 828.778 C 298.132 804.194, 298.580 798.415, 304.776 786.081 C 314.916 765.895, 335.545 758.455, 379.532 759.120 C 400.455 759.436, 400.300 759.613, 401.908 733.500 C 407.322 645.606, 441.012 556.522, 483.804 516.951 C 506.434 496.024, 528.086 487.463, 558 487.614 C 590.476 487.779, 608.559 494.105, 633.693 514.094 C 646.667 524.413, 649.878 524.945, 666.054 519.454 C 776.176 482.076, 883.624 467.717, 945.309 482.135 C 954.839 484.363, 958.976 483.783, 961.038 479.929 C 961.616 478.848, 962 458.548, 962 429.020 L 962 379.909 959.545 377.455 C 955.733 373.643, 951.672 374.178, 945.062 379.364 C 912.750 404.718, 872.132 418.093, 820 420.546 C 799.214 421.524, 792.111 419.026, 787.768 409.209 C 784.791 402.479, 785.699 397.336, 792.276 383.658 C 823.286 319.168, 876.056 266.176, 942.601 232.697 C 947.206 230.380, 951.312 227.335, 954.281 224.033 C 962.295 215.119, 962.102 216.967, 961.782 152.396 L 961.500 95.500 958.828 90.437 C 955.634 84.385, 949.461 78.568, 943.122 75.637 C 938.581 73.538, 937.470 73.497, 880 73.337 C 847.825 73.248, 819.541 73.570, 817.147 74.053 M 912 594.614 C 882.156 598.282, 855.236 609.808, 792 645.994 C 754.775 667.296, 733.433 678.124, 723.271 680.866 C 688.114 690.353, 653.509 675.667, 621.761 637.786 C 611.701 625.783, 608.133 622.793, 598.500 618.299 C 592.574 615.534, 592.260 615.500, 573 615.500 C 555.265 615.500, 552.900 615.708, 546.865 617.793 C 533.991 622.243, 532.710 623.507, 501.147 662.881 C 483.183 685.291, 480 689.760, 480 692.574 C 480 696.047, 482.814 699, 486.122 699 C 487.044 699, 499.206 689.754, 513.149 678.454 C 544.979 652.657, 550.987 649.640, 565.750 652.040 C 576.974 653.864, 582.693 657.714, 595.844 672.297 C 621.687 700.957, 641.735 718.988, 657.131 727.421 C 690.184 745.525, 734.548 746.052, 768.500 728.744 C 770.700 727.622, 779.025 722.555, 787 717.483 C 827.648 691.632, 845.735 684.802, 874 684.630 C 903.741 684.449, 926.784 693.088, 950.106 713.161 C 954.934 717.316, 957.723 719.037, 959.273 718.817 L 961.500 718.500 961.784 667.500 C 961.982 631.766, 961.728 615.260, 960.933 612.356 C 958.636 603.959, 951.818 598.387, 941 596.066 C 935.047 594.789, 917.661 593.918, 912 594.614 M 104 729.915 C 84.462 733.976, 80.362 761.055, 97.899 770.216 C 113.707 778.474, 130.826 767.623, 129.829 749.976 C 129.055 736.286, 117.295 727.152, 104 729.915 M 485.326 749.023 C 473.749 751.371, 466.044 760.952, 466.044 773 C 466.044 799.205, 501.594 807.248, 512.633 783.541 C 521.243 765.052, 505.349 744.962, 485.326 749.023" }
};

/**
 * The token under a point on the canvas, the topmost one where several overlap. Tokens the user
 * cannot see are skipped.
 * @param {Object} point - Canvas coordinates
 * @param {Object[]} tokens - The canvas tokens, in draw order
 * @returns {Object|null} The token, or null over empty canvas
 */
export function tokenAt(point, tokens) {
  const hits = tokens.filter(token => token.isVisible !== false && token.bounds?.contains(point.x, point.y));
  return hits.at(-1) ?? null;
}

// The system's colours for picking targets: the cursor turquoise, the mark on a picked token red.
export const TARGET_COLOR = "#00f5e4";
export const MARK_COLOR = "#db2a2a";

/**
 * The default picking cursor as an image: a ring, four strokes and a centre dot, 32 pixels across.
 * @param {String} color - The colour, as CSS
 * @returns {String} A data URL
 */
function crosshairImage(color) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g fill='none' stroke='${color}' stroke-width='2.5'><circle cx='16' cy='16' r='9'/><path d='M16 1v9M16 22v9M1 16h9M22 16h9'/></g><circle cx='16' cy='16' r='1.5' fill='${color}'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * The character a Font Awesome icon draws, from the value its stylesheet gives `content` or `--fa`:
 * the first quoted string, with CSS escapes like \f48e decoded. Font Awesome 7 adds an empty
 * alternative text after a slash (`"\f48e" / ""`), which is not part of the glyph.
 * @param {String} value - The computed value
 * @returns {String} The glyph, or "" when there is none
 */
export function iconGlyph(value) {
  const quoted = String(value ?? "").match(/^\s*(["'])((?:\\.|(?!\1).)*)\1/);
  if (!quoted) return "";
  return quoted[2].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/\\(.)/g, "$1");
}

/**
 * One of the system's own target shapes drawn as an image, 32 pixels across, in a colour with a
 * 1-pixel white border.
 * @param {Object} shape - viewBox (its square size) and d (its path data)
 * @param {String} color - The colour, as CSS
 * @returns {String} A data URL
 */
function shapeImage({ viewBox, d }, color) {
  const pad = viewBox / 16;
  const span = viewBox + 2 * pad;
  const border = (2 * span) / 32;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='${-pad} ${-pad} ${span} ${span}'><path d='${d}' fill='${color}' fill-rule='evenodd' stroke='#ffffff' stroke-width='${border}' stroke-linejoin='round' paint-order='stroke'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * An icon drawn as an image, 32 pixels across, in a colour with a 1-pixel white border: one of the
 * system's own shapes ("ep-slash", "ep-lightning"), or a Font Awesome icon - the same glyph the chat
 * cards show, read from the icon font Foundry already loaded and scaled to fit the image.
 * @param {String} icon - A shape's key, or a Font Awesome class, e.g. "fa-syringe"
 * @param {String} color - The colour, as CSS
 * @returns {String} A data URL
 */
export function iconImage(icon, color) {
  if (TARGET_SHAPES[icon]) return shapeImage(TARGET_SHAPES[icon], color);
  const size = 32;
  const probe = document.createElement("i");
  probe.className = `fa-solid ${icon}`;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.append(probe);
  const style = getComputedStyle(probe, "::before");
  const glyph = iconGlyph(getComputedStyle(probe).getPropertyValue("--fa")) || iconGlyph(style.content);
  const family = style.fontFamily;
  const weight = style.fontWeight;
  probe.remove();

  const image = document.createElement("canvas");
  image.width = size;
  image.height = size;
  const context = image.getContext("2d");
  const fit = size - 4;
  context.font = `${weight} ${fit}px ${family}`;
  const measured = context.measureText(glyph);
  const width = (measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight) || fit;
  const height = (measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent) || fit;
  const scale = Math.min(1, fit / Math.max(width, height));
  context.font = `${weight} ${fit * scale}px ${family}`;
  const box = context.measureText(glyph);
  const x = (size - (box.actualBoundingBoxLeft + box.actualBoundingBoxRight)) / 2 + box.actualBoundingBoxLeft;
  const y = (size - (box.actualBoundingBoxAscent + box.actualBoundingBoxDescent)) / 2 + box.actualBoundingBoxAscent;
  context.lineJoin = "round";
  context.lineWidth = 2;
  context.strokeStyle = "#ffffff";
  context.strokeText(glyph, x, y);
  context.fillStyle = color;
  context.fillText(glyph, x, y);
  return image.toDataURL();
}

/**
 * Draws one crosshair of the default cursor's shape: a ring, four strokes and a centre dot.
 * @param {Object} graphics - The PIXI graphics to draw into
 * @param {Number} pixel - One screen pixel, in canvas units
 * @param {Number} color - The colour
 * @param {Number} grow - Screen pixels added on every side, for an outline drawn beneath
 * @returns {void}
 */
function drawCrosshair(graphics, pixel, color, grow) {
  graphics.lineStyle((2.5 + 2 * grow) * pixel, color, 1);
  graphics.drawCircle(0, 0, 9 * pixel);
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) graphics.moveTo(x * (6 - grow) * pixel, y * (6 - grow) * pixel).lineTo(x * (15 + grow) * pixel, y * (15 + grow) * pixel);
  graphics.lineStyle(0);
  graphics.beginFill(color, 1).drawCircle(0, 0, (1.5 + grow) * pixel).endFill();
}

/**
 * Draws the mark of a picked target on a token where it was clicked: the cursor's shape - the
 * crosshair, or the icon picking ran with - in its colour (red by default) with a 1-pixel white
 * border, as large on screen as the cursor (32 pixels across) at the zoom it was clicked at.
 * @param {Object} token - The token placeable
 * @param {Object} point - The click, in canvas coordinates
 * @param {Object} [options] - icon: the Font Awesome class picking ran with, or none for the
 *   crosshair; color: the mark's colour as a CSS hex value, MARK_COLOR by default
 * @returns {Function} Removes the mark again
 */
export function drawTargetMarker(token, point, { icon = null, color = MARK_COLOR } = {}) {
  const pixel = 1 / (globalThis.canvas?.stage?.scale?.x || 1);
  let mark;
  if (icon) {
    mark = PIXI.Sprite.from(iconImage(icon, color));
    mark.anchor.set(0.5);
    mark.scale.set(pixel);
  }
  else {
    mark = new PIXI.Graphics();
    drawCrosshair(mark, pixel, 0xffffff, 1);
    drawCrosshair(mark, pixel, Number.parseInt(color.replace("#", ""), 16), 0);
  }
  mark.position.set(point.x - (token.x ?? 0), point.y - (token.y ?? 0));
  token.addChild(mark);
  return () => mark.destroy();
}

/**
 * The text that follows the cursor while targets are picked. Below it: for several targets how
 * many are left, for one target whether it is chosen yet. Above it, once something is marked, how
 * to confirm.
 * @param {Object} state - multi: several targets; left: targets still to pick; marked: targets marked
 * @returns {String} The label's HTML
 */
export function targetLabel({ multi, left, marked }) {
  const hint = marked ? `<span class="ep-targeting-hint">${escapeText(game.i18n.localize("ep2e.targeting.confirmHint"))}</span>` : "";
  const text = !multi
    ? game.i18n.localize(marked ? "ep2e.targeting.targetChosen" : "ep2e.targeting.selectTarget")
    : Number.isFinite(left) ? game.i18n.format("ep2e.targeting.remaining", { count: left }) : game.i18n.format("ep2e.targeting.marked", { count: marked });
  return `${hint}<span class="ep-targeting-count">${escapeText(text)}</span>`;
}

/**
 * The gap between two tokens on the canvas, edge to edge, in the scene's distance units.
 * @param {Object} a - A token, with bounds {x, y, width, height} in pixels
 * @param {Object} b - Another token
 * @param {Object} grid - size (pixels per square) and distance (units per square)
 * @returns {Number} The gap, 0 when they touch or overlap
 */
export function tokenGap(a, b, grid) {
  const gapX = Math.max(0, a.bounds.x - (b.bounds.x + b.bounds.width), b.bounds.x - (a.bounds.x + a.bounds.width));
  const gapY = Math.max(0, a.bounds.y - (b.bounds.y + b.bounds.height), b.bounds.y - (a.bounds.y + a.bounds.height));
  return Math.hypot(gapX, gapY) / (Number(grid?.size) || 1) * (Number(grid?.distance) || 1);
}

/**
 * The gap between a token and a point on the canvas, from the token's edge, in the scene's units.
 * @param {Object} token - A token, with bounds {x, y, width, height} in pixels
 * @param {Object} point - Canvas coordinates
 * @param {Object} grid - size (pixels per square) and distance (units per square)
 * @returns {Number} The gap, 0 when the point lies on the token
 */
export function pointGap(token, point, grid) {
  const gapX = Math.max(0, token.bounds.x - point.x, point.x - (token.bounds.x + token.bounds.width));
  const gapY = Math.max(0, token.bounds.y - point.y, point.y - (token.bounds.y + token.bounds.height));
  return Math.hypot(gapX, gapY) / (Number(grid?.size) || 1) * (Number(grid?.distance) || 1);
}

/**
 * The token an actor acts from on the viewed scene: one of its tokens the user controls, else its
 * first one there.
 * @param {Actor} actor - The actor
 * @returns {Object|null} The token placeable, or null when it has none on the scene
 */
export function attackerToken(actor) {
  if (!actor || !globalThis.canvas?.ready) return null;
  const tokens = actor.getActiveTokens?.(true) ?? [];
  return tokens.find(token => token.controlled) ?? tokens[0] ?? null;
}

/**
 * Draws the line a measured attack shows while picking, from the attacker's token to the cursor.
 * @param {Object} graphics - The PIXI graphics to draw into, cleared first
 * @param {Object} from - The attacker's token
 * @param {Object} point - The cursor, in canvas coordinates
 * @returns {void}
 */
function drawMeasureLine(graphics, from, point) {
  const pixel = 1 / (globalThis.canvas?.stage?.scale?.x || 1);
  const origin = from.center ?? { x: from.bounds.x + from.bounds.width / 2, y: from.bounds.y + from.bounds.height / 2 };
  graphics.clear();
  graphics.lineStyle(4 * pixel, 0x000000, 0.5).moveTo(origin.x, origin.y).lineTo(point.x, point.y);
  graphics.lineStyle(2 * pixel, Number.parseInt(TARGET_COLOR.replace("#", ""), 16), 1).moveTo(origin.x, origin.y).lineTo(point.x, point.y);
}

/**
 * Minimises every open document sheet, so the canvas is free to pick targets on.
 * @returns {Function} Restores the sheets it minimised
 */
export function sheetsAside() {
  const Sheet = foundry.applications?.api?.DocumentSheetV2;
  const open = Sheet ? Array.from(foundry.applications.instances?.values?.() ?? []).filter(app => app instanceof Sheet && app.rendered && !app.minimized) : [];
  for (const sheet of open) sheet.minimize();
  return () => { for (const sheet of open) sheet.maximize(); };
}

/**
 * Lets the user pick targets on the canvas. A click marks a token, another click on it unmarks it;
 * a right-click confirms what is marked, and Escape, or a right-click with nothing marked, cancels.
 * With several targets a click past the limit is refused with a notice, and so is a token farther
 * than `within` from every one already marked; with one, a click on another token moves the mark
 * over to it. Open sheets are minimised while picking and restored after. The clicks are kept from
 * the canvas itself, so picking
 * targets does not also select or deselect tokens. The cursor is set by a stylesheet rule rather
 * than on the board, since the canvas writes its own cursor onto the board over every token.
 * @param {Object} [options] - icon: one of the system's shapes ("ep-slash", "ep-lightning") or a
 *   Font Awesome class for the cursor and the marks, none for the crosshair; color: the cursor's colour, the turquoise TARGET_COLOR by default; markColor: the
 *   marks' colour, the red MARK_COLOR by default; multi: several targets; max: how many, with multi
 *   (Infinity for any number); within: how far, in scene units, a further target may be from the
 *   nearest marked one; refuse: refuse(token) returns the notice for a token that may not be
 *   picked, or nothing; marker: marker(token, point, {icon, color}) draws a mark and returns what
 *   removes it; measure: { from, describe(distance, token), limit(distance) } draws a line from the
 *   token from to the cursor and shows what describe says about the distance - to the token under
 *   the cursor (passed along), else to the cursor itself; limit, when given, is how many targets may
 *   be marked when the farthest of them stands that far away, and the counter counts down from it
 *   for the marked targets together with the token under the cursor, or the cursor itself
 * @returns {Promise<Object[]|null>} The marked tokens in the order they were marked, or null when
 *   cancelled
 */
export function pickTokensOnCanvas({ icon = null, color = TARGET_COLOR, markColor = MARK_COLOR, multi = false, max = 1, within = null, refuse = null, marker = drawTargetMarker, measure = null } = {}) {
  const board = document.getElementById("board");
  if (!globalThis.canvas?.ready || !board) return Promise.resolve(null);
  ui.notifications.info(game.i18n.localize("ep2e.targeting.cancelHint"));
  const limit = multi ? Math.max(1, Number(max) || 1) : 1;

  const restoreSheets = sheetsAside();
  return new Promise(resolve => {
    const marked = new Map();
    const label = document.createElement("div");
    label.className = "ep-targeting-counter";
    const range = document.createElement("span");
    range.className = "ep-targeting-range";
    const line = measure?.from && globalThis.PIXI ? new PIXI.Graphics() : null;
    if (line) canvas.controls?.addChild?.(line);
    let pointed = null;
    const capFor = (tokens, extra = null) => {
      if (!measure?.limit) return limit;
      const distances = tokens.map(token => tokenGap(measure.from, token, canvas.grid));
      if (Number.isFinite(extra)) distances.push(extra);
      if (!distances.length) return limit;
      return Math.min(limit, measure.limit(Math.max(...distances)));
    };
    const refresh = () => {
      label.innerHTML = targetLabel({ multi, left: Math.max(0, capFor(Array.from(marked.keys()), pointed) - marked.size), marked: marked.size });
      if (measure?.from) label.querySelector(".ep-targeting-count")?.append(document.createElement("br"), range);
    };
    const unmark = token => {
      marked.get(token)?.();
      marked.delete(token);
    };
    const cursor = document.createElement("style");
    cursor.textContent = `#board { cursor: url("${icon ? iconImage(icon, color) : crosshairImage(color)}") 16 16, crosshair !important; }`;
    const finish = tokens => {
      board.removeEventListener("pointerdown", onPointer, true);
      board.removeEventListener("contextmenu", onContext, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("keydown", onKey, true);
      cursor.remove();
      line?.destroy();
      for (const token of Array.from(marked.keys())) unmark(token);
      label.remove();
      restoreSheets();
      resolve(tokens);
    };
    const onPointer = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.button === 2) return finish(marked.size ? Array.from(marked.keys()) : null);
      if (event.button !== 0) return;
      const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      const token = tokenAt(point, canvas.tokens.placeables);
      if (!token) return;
      const refusal = marked.has(token) ? null : refuse?.(token);
      if (refusal) ui.notifications.warn(refusal);
      else if (marked.has(token)) unmark(token);
      else if (!multi) {
        for (const other of Array.from(marked.keys())) unmark(other);
        marked.set(token, marker(token, point, { icon, color: markColor }));
      }
      else if (marked.size >= limit) ui.notifications.warn(game.i18n.format("ep2e.targeting.limitReached", { max: limit }));
      else if (marked.size >= capFor([...marked.keys(), token])) ui.notifications.warn(game.i18n.format("ep2e.targeting.tooMany", { max: capFor([...marked.keys(), token]) }));
      else if (Number.isFinite(within) && marked.size && Array.from(marked.keys()).every(other => tokenGap(token, other, canvas.grid) > within)) {
        ui.notifications.warn(game.i18n.format("ep2e.targeting.tooFar", { within }));
      }
      else marked.set(token, marker(token, point, { icon, color: markColor }));
      refresh();
    };
    const onContext = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onMove = event => {
      label.style.left = `${event.clientX}px`;
      label.style.top = `${event.clientY}px`;
      if (!measure?.from) return;
      const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      const hovered = tokenAt(point, canvas.tokens.placeables);
      const distance = hovered && hovered !== measure.from ? tokenGap(measure.from, hovered, canvas.grid) : pointGap(measure.from, point, canvas.grid);
      if (measure.limit) {
        pointed = hovered && marked.has(hovered) ? null : distance;
        refresh();
      }
      range.textContent = measure.describe?.(distance, hovered && hovered !== measure.from ? hovered : null) ?? "";
      if (line) drawMeasureLine(line, measure.from, point);
    };
    const onKey = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finish(null);
    };

    refresh();
    document.body.append(label);
    document.head.append(cursor);
    board.addEventListener("pointerdown", onPointer, true);
    board.addEventListener("contextmenu", onContext, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("keydown", onKey, true);
  });
}

// An attack's targets are picked at the end of its dialog: its primary button picks them, and
// confirming them rolls the attack. The dialog is modal, which would keep the canvas out of reach,
// so its window is closed while picking - not the dialog itself, which waits on - and hidden,
// since Foundry's own styles keep a closed window on screen. It is shown again when the picking is
// cancelled.

/**
 * The distances to the targets an attack dialog measured, in the order they were picked.
 * @param {Object} options - The dialog's values
 * @returns {Number[]} Metres per target, empty when nothing was measured
 */
export function measuredDistances(options) {
  return String(options?.measuredRanges || "").split(",").filter(entry => entry !== "").map(Number).filter(Number.isFinite);
}

/**
 * Keeps the distances to the picked targets in the attack dialog, in the order the targets were
 * picked, and lets the attack set what follows from them, such as the distance entry.
 * @param {HTMLFormElement} form - The dialog's form
 * @param {Number[]} distances - The distance to each target, in scene units
 * @param {Object} picking - What attackPicking returned; applyMeasured(form, distances) is optional
 * @returns {void}
 */
function writeMeasured(form, distances, picking) {
  const field = form?.elements?.measuredRanges;
  if (field) field.value = distances.map(distance => Math.round(distance * 10) / 10).join(",");
  picking.applyMeasured?.(form, distances);
}

/**
 * Brings an attack dialog back after picking was cancelled or came to nothing.
 * @param {HTMLElement} element - The dialog's window
 * @param {Boolean} modal - Whether it was shown as a modal
 * @returns {void}
 */
function showAgain(element, modal) {
  if (element?.style) element.style.display = "";
  if (element && !element.open) modal ? element.showModal() : element.show?.();
}

/**
 * Wires an attack dialog's target picking to its primary button, whose label follows how many
 * targets the chosen options strike. Confirming enough targets rolls straight away; cancelling or
 * too few brings the dialog back.
 * @param {HTMLElement} root - The dialog's element
 * @param {Object} dialog - The dialog, to hide while picking
 * @param {Object|null} picking - What attackPicking returned; measure(form) may name what to measure
 *   from, refuseFor(form) the refusal as the dialog stands at picking, area(form) an area to place
 *   first - only tokens in it can be picked; an area that takes no targets (max 0) is kept in the
 *   dialog's placedArea and rolls at once, measured by its distance(area) or else its length;
 *   allowed(form), once measured, how many may be struck; label(form), the button's own label;
 *   applySight(form, tokens), what the picked targets' visibility sets in the dialog
 * @param {Object} [seams] - pick and place, replaced in tests
 * @returns {void}
 */
export function wirePreRollTargets(root, dialog, picking, { pick = pickTokensOnCanvas, place = placeArea } = {}) {
  const button = root?.querySelector?.('button[data-action="pickTargets"]');
  const input = root?.querySelector?.('input[name="preTargets"]');
  if (!picking || !button || !input) return;
  const form = button.form ?? input.form;
  const label = button.querySelector("span") ?? button;
  let picked = false;

  const sync = () => {
    label.textContent = game.i18n.localize(picking.label?.(form) ?? (picking.count(form) === 1 ? "ep2e.chat.attack.chooseTarget" : "ep2e.roll.dialog.ranged.attacker.pickTargets"));
  };
  form?.addEventListener("change", sync);
  form?.addEventListener("input", sync);

  button.addEventListener("click", async event => {
    if (picked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const count = picking.count(form);
    const minimum = picking.minimum(form);
    const any = !Number.isFinite(count);
    const element = dialog?.element;
    const modal = element?.open && element.matches?.(":modal");
    element?.close?.();
    if (element?.style) element.style.display = "none";
    const measure = picking.measure?.(form) ?? null;
    let refuse = picking.refuseFor ? picking.refuseFor(form) : picking.refuse;
    const zone = picking.area?.(form) ?? null;
    let options = { multi: any || count > 1, max: count, within: !any && count > 1 ? 1 : null };
    const restoreSheets = zone ? sheetsAside() : () => {};
    if (zone) {
      const area = await place({ ...zone, asideSheets: false });
      if (!area) {
        restoreSheets();
        return showAgain(element, modal);
      }
      if (!zone.max) {
        const field = form?.elements?.placedArea;
        if (field) field.value = JSON.stringify({ kind: area.kind, origin: area.origin, radius: area.radius, angle: area.angle, rotation: area.rotation, from: zone.from?.center ?? null });
        const distance = zone.distance ? zone.distance(area) : area.radius;
        if (Number.isFinite(distance)) writeMeasured(form, [distance], picking);
        restoreSheets();
        picked = true;
        button.click();
        return;
      }
      const inside = tokensInArea(area.polygon, canvas.tokens.placeables.filter(token => token !== zone.from));
      const outside = token => (inside.includes(token) ? null : game.i18n.localize("ep2e.targeting.outsideArea"));
      const before = refuse;
      refuse = before ? token => outside(token) ?? before(token) : outside;
      options = { multi: zone.max > 1, max: zone.max, within: zone.within ?? null };
    }
    const tokens = await pick({ ...options, ...(refuse ? { refuse } : {}), ...(measure ? { measure } : {}), ...picking.cursor });
    restoreSheets();
    const actors = (tokens ?? []).map(token => token.actor).filter(Boolean);
    if (actors.length >= minimum) {
      if (measure?.from) writeMeasured(form, tokens.filter(token => token.actor).map(token => tokenGap(measure.from, token, canvas.grid)), picking);
      picking.applySight?.(form, tokens.filter(token => token.actor));
      const allowed = picking.allowed?.(form) ?? Infinity;
      if (actors.length > allowed) {
        ui.notifications.warn(game.i18n.format("ep2e.targeting.tooMany", { max: allowed }));
        return showAgain(element, modal);
      }
      input.value = actors.map(actor => actor.uuid).join(",");
      picked = true;
      button.click();
      return;
    }
    if (actors.length) ui.notifications.warn(game.i18n.format("ep2e.targeting.tooFew", { min: minimum }));
    showAgain(element, modal);
  }, true);

  sync();
}

// Areas on the canvas - a blast's circle, a cone - are Foundry Regions, placed at the cursor with the
// core's own placement and kept in the scene for everyone to see. Walls cut an area off: what lies
// behind a wall from its centre is not in it.

// The flag an area's Region carries, naming what placed it.
export const AREA_FLAG = "area";

// A wall-cut polygon faces down at rotation 0, as a light does; a cone shape faces right.
const SWEEP_FACING = 90;

/**
 * Scene units as canvas pixels.
 * @param {Number} units - A distance in scene units, metres for the system
 * @returns {Number} The pixels
 */
export function unitsToPixels(units) {
  return (Number(units) || 0) * (Number(globalThis.canvas?.dimensions?.distancePixels) || 1);
}

/**
 * The part of a circle or cone that walls do not cut off, seen from its centre or tip: what blocks
 * movement blocks the blast too.
 * @param {Object} origin - The centre or tip, in canvas coordinates
 * @param {Object} options - radius in scene units; angle in degrees for a cone (360 for a circle);
 *   rotation in degrees, which way a cone faces, 0 pointing right as for a cone shape
 * @returns {Object} The polygon, with contains(x, y) and points
 */
export function areaPolygon(origin, { radius, angle = 360, rotation = 0 } = {}) {
  return CONFIG.Canvas.polygonBackends.move.create(origin, { type: "move", radius: unitsToPixels(radius), angle, rotation: rotation - SWEEP_FACING });
}

/**
 * The tokens an area covers: those whose centre or one of their corners, set a little inward, lies
 * in it.
 * @param {Object} polygon - The area, with contains(x, y)
 * @param {Object[]} tokens - The canvas tokens
 * @returns {Object[]} The tokens in the area
 */
export function tokensInArea(polygon, tokens) {
  return tokens.filter(token => {
    const { x, y, width, height } = token.bounds;
    const inset = Math.min(width, height) * 0.1;
    const points = [[x + width / 2, y + height / 2], [x + inset, y + inset], [x + width - inset, y + inset], [x + inset, y + height - inset], [x + width - inset, y + height - inset]];
    return points.some(([px, py]) => polygon.contains(px, py));
  });
}

/**
 * Where something flying from a point in a direction comes down: the full distance, or short of the
 * first wall in its way, where it stops.
 * @param {Object} origin - Where it starts, in canvas coordinates
 * @param {Number} angle - The direction, in radians, 0 pointing right
 * @param {Number} distance - How far, in pixels
 * @param {Function} [collide] - collide(from, to) returns the first wall hit between them, or null
 * @param {Number} [backoff] - How far short of a wall it stops, in pixels
 * @returns {Object} point, and blocked when a wall stopped it
 */
export function scatterPoint(origin, angle, distance, collide = wallBetween, backoff = 5) {
  const end = { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
  const hit = collide(origin, end);
  if (!hit) return { point: end, blocked: false };
  const travelled = Math.max(0, Math.hypot(hit.x - origin.x, hit.y - origin.y) - backoff);
  return { point: { x: origin.x + Math.cos(angle) * travelled, y: origin.y + Math.sin(angle) * travelled }, blocked: true };
}

/**
 * The first wall that blocks movement between two points.
 * @param {Object} from - A point in canvas coordinates
 * @param {Object} to - Another point
 * @returns {Object|null} Where it is hit, or null when nothing is in the way
 */
export function wallBetween(from, to) {
  return CONFIG.Canvas.polygonBackends.move.testCollision(from, to, { type: "move", mode: "closest" }) ?? null;
}

/**
 * The angle a cone needs to be a given width at its far end.
 * @param {Number} length - How far it reaches, in scene units
 * @param {Number} width - How wide it is at its end, in scene units
 * @returns {Number} The angle in degrees, at most 180
 */
export function coneAngleForWidth(length, width) {
  return length * 2 <= width ? 180 : 2 * Math.asin(width / (2 * length)) * 180 / Math.PI;
}

/**
 * Shows, while the cursor moves, a line from a token to it and what a measure says of the distance,
 * in a label beside the cursor.
 * @param {Object} measure - from, the token; describe(distance), the text for a distance in scene units
 * @returns {Function} Stops measuring and removes the line and the label
 */
function measureFrom({ from, describe }) {
  const label = document.createElement("div");
  label.className = "ep-targeting-counter";
  const range = document.createElement("span");
  range.className = "ep-targeting-range";
  label.append(range);
  document.body.append(label);
  const line = globalThis.PIXI ? new PIXI.Graphics() : null;
  if (line) canvas.controls?.addChild?.(line);
  const onMove = event => {
    label.style.left = `${event.clientX}px`;
    label.style.top = `${event.clientY}px`;
    const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
    range.textContent = describe?.(pointGap(from, point, canvas.grid)) ?? "";
    if (line) drawMeasureLine(line, from, point);
  };
  document.addEventListener("pointermove", onMove, true);
  return () => {
    document.removeEventListener("pointermove", onMove, true);
    line?.destroy();
    label.remove();
  };
}

/**
 * Lets the user place an area at the cursor with the core's Region placement: a circle follows the
 * cursor (snapping to the grid unless Shift is held), a cone keeps its tip on a token and turns
 * towards the cursor - with a width, its length follows the cursor too and its angle keeps the far end
 * that wide. A left click places it, a right click or Escape cancels - Escape is caught here,
 * so it does not close a window that is waiting on the placement instead. Open sheets are minimised
 * meanwhile, as when picking targets.
 * @param {Object} options - kind ("circle" or "cone"); radius in scene units; angle in degrees for a
 *   cone; width in scene units for a cone whose length the user chooses; from, the token a cone starts
 *   at; color; name, "Area" when none is given; asideSheets: false
 *   when the caller keeps the sheets minimised itself; measure: { from, describe(distance) } draws a
 *   line from the token from to the cursor and shows what describe says of the distance
 * @returns {Promise<Object|null>} kind, origin, radius, angle, rotation and the wall-cut polygon, or
 *   null when cancelled
 */
export async function placeArea({ kind = "circle", radius, angle = 45, width = null, from = null, color = TARGET_COLOR, name = "", asideSheets = true, measure = null } = {}) {
  if (!globalThis.canvas?.ready) return null;
  const cone = kind === "cone";
  const tip = cone ? (from?.center ?? null) : null;
  if (cone && !tip) return null;
  const pixels = unitsToPixels(radius);
  if (cone && width) angle = coneAngleForWidth(radius, width);
  const shape = cone
    ? { type: "cone", x: tip.x, y: tip.y, radius: pixels, angle, rotation: 0, curvature: "round" }
    : { type: "circle", x: 0, y: 0, radius: pixels };
  const restoreSheets = asideSheets ? sheetsAside() : () => {};
  const onKey = event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    canvas.regions._cancelPlacement();
  };
  document.addEventListener("keydown", onKey, true);
  const stopMeasuring = measure?.from ? measureFrom(measure) : () => {};
  const placed = await canvas.regions.placeRegion({
    name: name || game.i18n.localize("ep2e.targeting.areaName"), color, shapes: [shape], highlightMode: "coverage", displayMeasurements: true,
    visibility: CONST.REGION_VISIBILITY.ALWAYS, levels: canvas.level ? [canvas.level.id] : []
  }, {
    create: false,
    allowRotation: false,
    onMove: cone ? ({ shape: placing, position }) => {
      const rotation = Math.atan2(position.y - tip.y, position.x - tip.x) * 180 / Math.PI;
      if (!width) {
        placing.updateSource({ x: tip.x, y: tip.y, rotation });
        return false;
      }
      const length = Math.max(1, Math.hypot(position.x - tip.x, position.y - tip.y) / unitsToPixels(1));
      placing.updateSource({ x: tip.x, y: tip.y, rotation, radius: unitsToPixels(length), angle: coneAngleForWidth(length, width) });
      return false;
    } : undefined
  }).finally(() => {
    document.removeEventListener("keydown", onKey, true);
    stopMeasuring();
    restoreSheets();
  });
  const final = placed?.shapes?.[0];
  if (!final) return null;
  const origin = { x: final.x, y: final.y };
  const rotation = cone ? final.rotation : 0;
  const reach = cone && width ? final.radius / unitsToPixels(1) : radius;
  const spread = cone ? (width ? final.angle : angle) : 360;
  return { kind, origin, radius: reach, angle: spread, rotation, polygon: areaPolygon(origin, { radius: reach, angle: spread, rotation }) };
}

// The colour of an area's part behind walls: struck only if the GM says so.
export const SHADOW_COLOR = "#f2c94c";

/**
 * The data of a Region for an area: in the shape walls cut it to, or whole.
 * @param {Object} area - kind, origin, radius, angle, rotation and the wall-cut polygon
 * @param {Object} options - color; name; flags; behaviors; whole: the full shape rather than the cut one
 * @returns {Object|null} The Region data, or null for an area too small to draw
 */
function areaRegionData(area, { color, name, flags = {}, behaviors = [], whole = false }) {
  const cone = area.kind === "cone";
  const pixels = unitsToPixels(area.radius);
  let shape;
  if (whole) shape = cone
    ? { type: "cone", x: area.origin.x, y: area.origin.y, radius: pixels, angle: area.angle, rotation: area.rotation, curvature: "round" }
    : { type: "circle", x: area.origin.x, y: area.origin.y, radius: pixels };
  else {
    const points = Array.from(area.polygon?.points ?? []);
    if (points.length < 6) return null;
    shape = { type: "polygon", points };
  }
  return {
    name: name || game.i18n.localize("ep2e.targeting.areaName"), color, highlightMode: "coverage", visibility: CONST.REGION_VISIBILITY.ALWAYS,
    levels: canvas.level ? [canvas.level.id] : [],
    shapes: [shape],
    behaviors,
    flags: { eclipsephase: { [AREA_FLAG]: { kind: area.kind, origin: area.origin, radius: area.radius, angle: area.angle ?? 360, rotation: area.rotation ?? 0, ...flags } } }
  };
}

/**
 * Creates Regions on the viewed scene, or has the active GM create them for a user who may not.
 * @param {Object[]} data - The Regions' data
 * @returns {Promise<Object[]>} The Regions, empty when the GM creates them
 */
async function createRegions(data) {
  if (CONFIG.Region.documentClass.canUserCreate(game.user)) return (await canvas.scene.createEmbeddedDocuments("Region", data)) ?? [];
  relayToActiveGM("createAreaRegion", { sceneId: canvas.scene.id, data });
  return [];
}

/**
 * Leaves an area in the scene for everyone to see: a Region in the shape walls cut it to. A user who
 * may not create Regions has the active GM create it.
 * @param {Object} area - What placeArea returned, or the same fields
 * @param {Object} [options] - color; name ("Area" when none is given); behaviors, Region behaviors it
 *   carries; flags, kept under the area flag, such as the attack it
 *   belongs to
 * @returns {Promise<Object|null>} The Region, or null when the GM creates it
 */
export async function createAreaRegion(area, { color = TARGET_COLOR, name = "", flags = {}, behaviors = [] } = {}) {
  const data = areaRegionData(area, { color, name, flags, behaviors });
  if (!data) return null;
  return (await createRegions([data]))[0] ?? null;
}

// The colour of an area that strikes nobody, such as suppressive fire that missed.
export const SPENT_COLOR = "#999999";

/**
 * Whether a point lies in an area's whole shape, walls aside.
 * @param {Object} area - kind, origin, radius, angle, rotation
 * @param {Object} point - Canvas coordinates
 * @returns {Boolean} True inside
 */
export function shapeContains(area, point) {
  const dx = point.x - area.origin.x;
  const dy = point.y - area.origin.y;
  if (Math.hypot(dx, dy) > unitsToPixels(area.radius)) return false;
  if (area.kind !== "cone" || (area.angle ?? 360) >= 360) return true;
  const facing = Math.atan2(dy, dx) * 180 / Math.PI;
  const off = ((facing - (area.rotation ?? 0)) % 360 + 540) % 360 - 180;
  return Math.abs(off) <= area.angle / 2;
}

/**
 * The grid cells - squares or hexagons - an area covers, whole or not at all: a cell belongs to it
 * when its centre lies in the area's shape, and is open when its centre lies in the part walls do not
 * cover.
 * @param {Object} area - kind, origin, radius, angle, rotation and the wall-cut polygon
 * @param {Object} grid - The grid, with getOffset and getCenterPoint
 * @param {Set<String>} [exclude] - Cells to leave out, as "i,j"
 * @returns {Object} open and shadow, each a list of { i, j }
 */
export function areaSquares(area, grid, exclude = new Set()) {
  const reach = unitsToPixels(area.radius) + (grid.isSquare ? 0 : Number(grid.size) || 0);
  const corners = [grid.getOffset({ x: area.origin.x - reach, y: area.origin.y - reach }), grid.getOffset({ x: area.origin.x + reach, y: area.origin.y + reach })];
  const first = { i: Math.min(corners[0].i, corners[1].i), j: Math.min(corners[0].j, corners[1].j) };
  const last = { i: Math.max(corners[0].i, corners[1].i), j: Math.max(corners[0].j, corners[1].j) };
  const squares = { open: [], shadow: [] };
  for (let i = first.i; i <= last.i; i++) {
    for (let j = first.j; j <= last.j; j++) {
      if (exclude.has(`${i},${j}`)) continue;
      const centre = grid.getCenterPoint({ i, j });
      if (!shapeContains(area, centre)) continue;
      (area.polygon?.contains(centre.x, centre.y) ? squares.open : squares.shadow).push({ i, j });
    }
  }
  return squares;
}

/**
 * Grid squares as Region rectangles, the squares of a row joined into one.
 * @param {Object[]} squares - { i, j } each
 * @param {Object} grid - The square grid, with getTopLeftPoint and size
 * @returns {Object[]} The rectangle shapes
 */
export function squareShapes(squares, grid) {
  const rows = new Map();
  for (const { i, j } of squares) rows.set(i, [...(rows.get(i) ?? []), j]);
  const shapes = [];
  for (const [i, columns] of rows) {
    columns.sort((a, b) => a - b);
    let start = columns[0];
    for (let index = 1; index <= columns.length; index++) {
      if (columns[index] === columns[index - 1] + 1) continue;
      const corner = grid.getTopLeftPoint({ i, j: start });
      shapes.push({ type: "rectangle", x: corner.x, y: corner.y, width: (columns[index - 1] - start + 1) * grid.size, height: grid.size });
      start = columns[index];
    }
  }
  return shapes;
}

/**
 * Grid cells as Region shapes: squares as rectangles, those of a row joined into one; hexagons as
 * polygons.
 * @param {Object[]} cells - { i, j } each
 * @param {Object} grid - The grid
 * @returns {Object[]} The shapes
 */
export function cellShapes(cells, grid) {
  if (grid.isSquare) return squareShapes(cells, grid);
  return cells.map(cell => ({ type: "polygon", points: grid.getVertices(cell).flatMap(vertex => [vertex.x, vertex.y]) }));
}

/**
 * Leaves an area in the scene whole, in one colour at every spot: the part walls do not cover in red,
 * the part behind walls in yellow, so the GM can still rule that a thin wall or a window lets it
 * through - or, for an area that strikes nobody, all of it in grey. On a square or hex grid the
 * parts are whole cells, noted in their flag's cells; cells to exclude are left out. Every part carries the behaviors; their flag's part
 * ("open", "shadow" or "spent") tells them apart.
 * @param {Object} area - What placeArea returned, or the same fields
 * @param {Object} [options] - name; flags; behaviors; spent: grey, striking nobody; exclude: squares
 *   ("i,j") to leave out
 * @returns {Promise<Object[]>} The Regions, empty when the GM creates them
 */
export async function createShadowedArea(area, { name = "", flags = {}, behaviors = [], spent = false, exclude = new Set() } = {}) {
  const grid = canvas.grid;
  const part = (key, color, shapes) => {
    const data = areaRegionData(area, { color, name, flags: { ...flags, part: key }, behaviors, whole: true });
    if (shapes) data.shapes = shapes;
    return data;
  };
  if (hasCells(grid)) {
    const { open, shadow } = areaSquares(area, grid, exclude);
    const parts = spent
      ? [[ "spent", SPENT_COLOR, [...open, ...shadow] ]]
      : [[ "open", MARK_COLOR, open ], [ "shadow", SHADOW_COLOR, shadow ]];
    return createRegions(parts.filter(([, , cells]) => cells.length).map(([key, color, cells]) => {
      const data = part(key, color, cellShapes(cells, grid));
      data.flags.eclipsephase[AREA_FLAG].cells = cells.map(({ i, j }) => `${i},${j}`);
      return data;
    }));
  }
  if (spent) return createRegions([part("spent", SPENT_COLOR)]);
  const open = areaRegionData(area, { color: MARK_COLOR, name, flags: { ...flags, part: "open" }, behaviors });
  const shadow = part("shadow", SHADOW_COLOR);
  if (open) shadow.shapes.push({ ...open.shapes[0], hole: true });
  return createRegions([open, shadow].filter(Boolean));
}

/**
 * Whether the viewed scene has cells - squares or hexagons - that things lie in.
 * @param {Object} [grid] - The scene's grid
 * @returns {Boolean} True on a square or hex grid
 */
export function hasCells(grid = globalThis.canvas?.grid) {
  return !!grid && (grid.isSquare || grid.isHexagonal) && typeof grid.getOffset === "function";
}

/**
 * The middle of the grid cell a point lies in, or the point itself on a scene without cells.
 * @param {Object} point - Canvas coordinates
 * @returns {Object} The point it settles on
 */
export function cellCentre(point) {
  const grid = canvas.grid;
  return hasCells(grid) ? grid.getCenterPoint(grid.getOffset(point)) : point;
}

/**
 * The top edge of the spot a point lies on: its cell's highest corner, or half a metre above it on a
 * scene without cells.
 * @param {Object} point - Canvas coordinates
 * @returns {Number} The y coordinate
 */
export function spotTop(point) {
  const grid = canvas.grid;
  if (!hasCells(grid)) return point.y - unitsToPixels(0.5);
  if (grid.isSquare) return grid.getTopLeftPoint(grid.getOffset(point)).y;
  return Math.min(...grid.getVertices(grid.getOffset(point)).map(vertex => vertex.y));
}

/**
 * The shapes of an area seen only as whole cells, walls aside: on a grid the cells whose centre lies
 * in it, elsewhere its circle.
 * @param {Object} area - kind "circle", origin and radius in scene units
 * @returns {Object[]} The Region shapes
 */
export function wholeShapes(area) {
  const grid = canvas.grid;
  if (!hasCells(grid)) return [{ type: "circle", x: area.origin.x, y: area.origin.y, radius: unitsToPixels(area.radius) }];
  const { open, shadow } = areaSquares({ ...area, polygon: null }, grid);
  return cellShapes([...open, ...shadow], grid);
}

/**
 * The shape of the spot a point lies on: its grid cell, or a circle half a metre across a scene
 * without cells.
 * @param {Object} point - Canvas coordinates
 * @returns {Object[]} The Region shapes
 */
export function spotShapes(point) {
  const grid = canvas.grid;
  if (!hasCells(grid)) return [{ type: "circle", x: point.x, y: point.y, radius: unitsToPixels(0.5) }];
  return cellShapes([grid.getOffset(point)], grid);
}

/**
 * Leaves an area in the scene that only some users and the GMs see - those its ownership names as
 * observers or owners.
 * @param {Object[]} shapes - The Region shapes
 * @param {Object} options - name; color; flags, kept under the area flag; behaviors; ownership, the
 *   Region's ownership
 * @returns {Promise<Object[]>} The Region, in a list, empty when the GM creates it
 */
export function createPrivateArea(shapes, { name = "", color = TARGET_COLOR, flags = {}, behaviors = [], ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } } = {}) {
  return createRegions([{
    name: name || game.i18n.localize("ep2e.targeting.areaName"), color, highlightMode: "coverage",
    visibility: CONST.REGION_VISIBILITY.OBSERVER, ownership,
    levels: canvas.level ? [canvas.level.id] : [],
    shapes, behaviors,
    flags: { eclipsephase: { [AREA_FLAG]: flags } }
  }]);
}

/**
 * The outer edges of a set of grid cells: every cell side that no other cell of the set shares.
 * @param {Object[]} cells - The cells, as { i, j }
 * @param {Object} grid - The scene's grid
 * @returns {Number[][]} The edges, as [x1, y1, x2, y2]
 */
export function outlineEdges(cells, grid) {
  const edges = new Map();
  const corner = vertex => `${Math.round(vertex.x)},${Math.round(vertex.y)}`;
  for (const cell of cells) {
    const vertices = grid.getVertices(cell);
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      const key = [corner(vertex), corner(next)].sort().join("|");
      const known = edges.get(key);
      if (known) known.count++;
      else edges.set(key, { count: 1, line: [vertex.x, vertex.y, next.x, next.y] });
    });
  }
  return Array.from(edges.values()).filter(edge => edge.count === 1).map(edge => edge.line);
}

/**
 * The line a cloud's Region is outlined with: the outer edges of its cells on the grid it was laid
 * on, its wall-cut shape without one, or - once the grid has changed - the circle it spreads to.
 * @param {Object} region - The cloud's Region
 * @param {Object} [grid] - The scene's grid
 * @returns {Object} edges, or points of a closed shape, or circle { x, y, radius }
 */
export function cloudOutline(region, grid = globalThis.canvas?.grid) {
  const flag = region?.getFlag?.("eclipsephase", AREA_FLAG) ?? {};
  const sameGrid = (flag.gridType ?? null) === (grid?.type ?? null);
  if (sameGrid && Array.isArray(flag.cells) && flag.cells.length && hasCells(grid)) {
    return { edges: outlineEdges(flag.cells.map(cell => { const [i, j] = cell.split(",").map(Number); return { i, j }; }), grid) };
  }
  if (sameGrid && Array.isArray(flag.points) && flag.points.length >= 6) return { points: flag.points };
  if (flag.origin && Number.isFinite(Number(flag.radius))) return { circle: { x: flag.origin.x, y: flag.origin.y, radius: unitsToPixels(flag.radius) } };
  const shape = Array.from(region?.shapes ?? [])[0];
  if (shape?.type === "polygon") return { points: Array.from(shape.points ?? []) };
  if (shape?.type === "circle") return { circle: { x: shape.x, y: shape.y, radius: shape.radius } };
  return { edges: [] };
}

// How untinted smoke's fog light is drawn: Foundry's "Invert Absorption" coloration, without luminosity.
const SMOKE_LIGHT = { coloration: 9, luminosity: 0 };

/**
 * Leaves a cloud in the scene, as far as walls let it spread from where it bursts: whole cells on a
 * grid, the wall-cut shape elsewhere. The Region itself shows only on the Region layer; the cloud is
 * drawn as an outline in its colour. A cloud can also lie under a swirling fog light for as long as it
 * lies, tinted, or untinted as smoke with inverted absorption and no luminosity.
 * @param {Object} area - kind "circle", origin, radius and the wall-cut polygon
 * @param {Object} options - name; color; flags, kept under the area flag; behaviors; fog: add the
 *   fog light; fogColor: its tint, none by default
 * @returns {Promise<Object[]>} The Region, in a list, empty when the GM creates it
 */
export async function createCloudArea(area, { name = "", color = TARGET_COLOR, flags = {}, behaviors = [], fog = false, fogColor = null } = {}) {
  const grid = canvas.grid;
  let shapes;
  let cells = null;
  let points = null;
  if (hasCells(grid)) {
    const open = areaSquares(area, grid).open;
    cells = open.map(({ i, j }) => `${i},${j}`);
    shapes = cellShapes(open, grid);
  }
  else {
    points = Array.from(area.polygon?.points ?? []);
    shapes = points.length >= 6 ? [{ type: "polygon", points }] : [{ type: "circle", x: area.origin.x, y: area.origin.y, radius: unitsToPixels(area.radius) }];
  }
  if (!shapes.length) return [];
  const regions = await createRegions([{
    name: name || game.i18n.localize("ep2e.targeting.areaName"), color, highlightMode: "coverage", visibility: CONST.REGION_VISIBILITY.LAYER,
    levels: canvas.level ? [canvas.level.id] : [], shapes, behaviors,
    flags: { eclipsephase: { [AREA_FLAG]: { kind: area.kind, origin: area.origin, radius: area.radius, color, gridType: grid?.type ?? null, ...(cells ? { cells } : {}), ...(points?.length >= 6 ? { points } : {}), ...flags } } }
  }]);
  if (fog) {
    const smoke = fogColor ? {} : SMOKE_LIGHT;
    const light = { x: area.origin.x, y: area.origin.y, config: { dim: area.radius, bright: 0, color: fogColor, ...smoke, animation: { type: "fog", speed: 3, intensity: 8 } }, flags: { eclipsephase: { [AREA_FLAG]: { ...flags } } } };
    if (CONFIG.AmbientLight?.documentClass?.canUserCreate?.(game.user)) await canvas.scene.createEmbeddedDocuments("AmbientLight", [light]);
    else relayToActiveGM("createCloudLight", { sceneId: canvas.scene.id, data: light });
  }
  return regions;
}

/**
 * Removes the fog lights of a scene's smoke that match.
 * @param {Function} match - match(areaFlag) for the lights to remove
 * @param {Object} [scene] - The scene, the viewed one by default
 * @returns {Promise<Number>} How many were removed here
 */
export async function clearCloudLights(match, scene = globalThis.canvas?.scene) {
  const ids = Array.from(scene?.lights ?? []).filter(light => {
    const flag = light.getFlag?.("eclipsephase", AREA_FLAG);
    return flag && match(flag);
  }).map(light => light.id);
  if (!ids.length) return 0;
  if (game.user.isGM) {
    await scene.deleteEmbeddedDocuments("AmbientLight", ids);
    return ids.length;
  }
  relayToActiveGM("clearCloudLights", { sceneId: scene.id, ids });
  return 0;
}

/**
 * Removes the areas of a scene that match, such as those an attack left. A user who may not delete
 * them has the active GM do it.
 * @param {Function} [match] - match(areaFlag) for the areas to remove; all areas by default
 * @param {Object} [scene] - The scene, the viewed one by default
 * @returns {Promise<Number>} How many were removed here
 */
export async function clearAreas(match = () => true, scene = globalThis.canvas?.scene) {
  const ids = Array.from(scene?.regions ?? []).filter(region => {
    const flag = region.getFlag?.("eclipsephase", AREA_FLAG);
    return flag && match(flag);
  }).map(region => region.id);
  if (!ids.length) return 0;
  if (game.user.isGM || ids.every(id => scene.regions.get(id)?.isOwner)) {
    await scene.deleteEmbeddedDocuments("Region", ids);
    return ids.length;
  }
  relayToActiveGM("clearAreaRegions", { sceneId: scene.id, ids });
  return 0;
}

/**
 * Lets the active GM create and remove areas for users who may not.
 * @returns {void}
 */
export function registerAreaSocket() {
  registerSocketActions({
    createAreaRegion: ({ sceneId, data }) => game.scenes.get(sceneId)?.createEmbeddedDocuments("Region", Array.isArray(data) ? data : [data]),
    clearAreaRegions: ({ sceneId, ids }) => game.scenes.get(sceneId)?.deleteEmbeddedDocuments("Region", ids),
    createCloudLight: ({ sceneId, data }) => game.scenes.get(sceneId)?.createEmbeddedDocuments("AmbientLight", [data]),
    clearCloudLights: ({ sceneId, ids }) => game.scenes.get(sceneId)?.deleteEmbeddedDocuments("AmbientLight", ids)
  });
}
