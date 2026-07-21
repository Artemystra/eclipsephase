// Extends whatever is currently registered (native default: TokenRuler) instead of naming the core
// class directly, so this keeps working even if that default ever changes underneath us.
export default class EPtokenRuler extends CONFIG.Token.rulerClass {
  _getGridHighlightStyle(waypoint, offset) {
    const native = super._getGridHighlightStyle(waypoint, offset);
    // Preserve native's unreachable/teleport exclusion (alpha 0 means "don't highlight at all").
    if (!(native.alpha > 0)) return native;

    const movement = this.token.actor?.system?.currentMovement;
    if (!movement?.full) return native;

    const distance = waypoint.measurement.distance;
    const color = distance <= movement.base ? 0x2ecc71   // green: within Base speed
      : distance <= movement.full ? 0x2e86de              // blue: within Full move
      : 0xe74c3c;                                          // red: beyond Full move

    return { ...native, color };
  }
}
