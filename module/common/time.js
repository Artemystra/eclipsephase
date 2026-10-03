const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;

// Swatch Internet Time: one day is 1000 beats. Beats are derived by integer maths over the day
// rather than through a 86.4-second constant, which loses exactness at the half-day mark.
const BEATS_PER_DAY = 1000;

export const HOURS = "hours";
export const BEATS = "beats";

/**
 * How far the campaign has run and where in the day it currently is. Days and years are plain
 * counters over elapsed time - no calendar, no months, no leap years - so that a table can say
 * "we are on day 143" without committing to a date.
 * @param {Number} worldTime - Foundry's game.time.worldTime, in seconds
 * @returns {Object} year and day (both 1-based), dayOfYear, totalDays, plus hour, minute and beat within the day
 */
export function elapsedTime(worldTime) {
  const seconds = Math.max(0, Math.floor(Number(worldTime) || 0));
  const totalDays = Math.floor(seconds / SECONDS_PER_DAY);
  const secondsToday = seconds - totalDays * SECONDS_PER_DAY;

  return {
    totalDays,
    year: Math.floor(totalDays / DAYS_PER_YEAR) + 1,
    dayOfYear: (totalDays % DAYS_PER_YEAR) + 1,
    day: totalDays + 1,
    hour: Math.floor(secondsToday / SECONDS_PER_HOUR),
    minute: Math.floor((secondsToday % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    beat: Math.floor((secondsToday * BEATS_PER_DAY) / SECONDS_PER_DAY)
  };
}

/**
 * The time of day as the panel shows it, either as a 24-hour clock or in Swatch beats.
 * @param {Number} worldTime - Foundry's game.time.worldTime, in seconds
 * @param {String} [format] - HOURS or BEATS
 * @returns {String} "14:30" or "@421"
 */
export function formatTimeOfDay(worldTime, format = HOURS) {
  const { hour, minute, beat } = elapsedTime(worldTime);
  if (format === BEATS) return `@${String(beat).padStart(3, "0")}`;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The world time at which a given campaign day starts, for the panel's "set day" control.
 * Day 1 is world time zero.
 * @param {Number} day - The 1-based campaign day
 * @returns {Number} The world time in seconds
 */
export function worldTimeForDay(day) {
  return Math.max(0, (Math.floor(Number(day) || 1) - 1)) * SECONDS_PER_DAY;
}

/**
 * The world time that keeps the current day but moves to a given time of day, for the panel's
 * editable clock.
 * @param {Number} worldTime - The current world time, which decides the day
 * @param {Number} secondsIntoDay - How far into that day to land, clamped to the day
 * @returns {Number} The new world time in seconds
 */
export function worldTimeAtTimeOfDay(worldTime, secondsIntoDay) {
  const { totalDays } = elapsedTime(worldTime);
  const within = Math.min(SECONDS_PER_DAY - 1, Math.max(0, Math.floor(Number(secondsIntoDay) || 0)));
  return totalDays * SECONDS_PER_DAY + within;
}

/**
 * How far into a day a wall-clock time is.
 * @param {Number} hour - The hour, clamped to 0-23
 * @param {Number} minute - The minute, clamped to 0-59
 * @returns {Number} The seconds into the day
 */
export function secondsForClock(hour, minute) {
  const h = Math.min(23, Math.max(0, Math.floor(Number(hour) || 0)));
  const m = Math.min(59, Math.max(0, Math.floor(Number(minute) || 0)));
  return h * SECONDS_PER_HOUR + m * SECONDS_PER_MINUTE;
}

/**
 * How far into a day a beat is.
 * @param {Number} beat - The beat, clamped to 0-999
 * @returns {Number} The seconds into the day
 */
export function secondsForBeat(beat) {
  const b = Math.min(BEATS_PER_DAY - 1, Math.max(0, Math.floor(Number(beat) || 0)));
  return Math.floor((b * SECONDS_PER_DAY) / BEATS_PER_DAY);
}

// The advance steps the panel offers. Minutes and hours carry a beat label for beats mode; the
// multi-day steps stay in days, where beats would say nothing a GM thinks in.
export const ADVANCE_PRESETS = [
  { id: "min10", seconds: 10 * SECONDS_PER_MINUTE, label: "ep2e.time.advanceSteps.min10", beatLabel: true },
  { id: "hour1", seconds: 1 * SECONDS_PER_HOUR, label: "ep2e.time.advanceSteps.hour1", beatLabel: true },
  { id: "hour4", seconds: 4 * SECONDS_PER_HOUR, label: "ep2e.time.advanceSteps.hour4", beatLabel: true },
  { id: "hour8", seconds: 8 * SECONDS_PER_HOUR, label: "ep2e.time.advanceSteps.hour8", beatLabel: true },
  { id: "day1", seconds: 1 * SECONDS_PER_DAY, label: "ep2e.time.advanceSteps.day1", beatLabel: true },
  { id: "day3", seconds: 3 * SECONDS_PER_DAY, label: "ep2e.time.advanceSteps.day3", beatLabel: false },
  { id: "day7", seconds: 7 * SECONDS_PER_DAY, label: "ep2e.time.advanceSteps.day7", beatLabel: false }
];

/**
 * How many beats a span of seconds is, rounded for display. A full day comes back as "1K" rather
 * than "1000", which is how Swatch time is written.
 * @param {Number} seconds - The span
 * @returns {String} The beat count as it should be shown
 */
export function beatsForSeconds(seconds) {
  const beats = Math.round((Number(seconds) * BEATS_PER_DAY) / SECONDS_PER_DAY);
  return beats >= BEATS_PER_DAY && beats % BEATS_PER_DAY === 0 ? `${beats / BEATS_PER_DAY}K` : String(beats);
}

/**
 * How many seconds an advance step actually moves the clock. In beats mode a step moves whole
 * beats, so that a button reading "7 Beats" advances exactly seven - ten minutes is 6.94 beats,
 * and advancing the raw seconds would land a beat short of what the button promised.
 * @param {Object} preset - One entry of ADVANCE_PRESETS
 * @param {String} [format] - HOURS or BEATS
 * @returns {Number} The advance in seconds
 */
export function advanceSeconds(preset, format = HOURS) {
  if (format !== BEATS || !preset.beatLabel) return preset.seconds;
  const beats = Math.round((preset.seconds * BEATS_PER_DAY) / SECONDS_PER_DAY);
  return Math.ceil((beats * SECONDS_PER_DAY) / BEATS_PER_DAY);
}

/**
 * A span of seconds in whole minutes.
 * @param {Number} seconds - The span
 * @returns {Number} The rounded minutes
 */
export function minutesForSeconds(seconds) {
  return Math.round(Number(seconds) / SECONDS_PER_MINUTE);
}

/**
 * How long an advance step is in words, for the tooltip a beats-mode button carries. The unit
 * follows the size of the step, so four hours reads as hours rather than as 240 minutes.
 * @param {Number} seconds - The span
 * @returns {String} The localized tooltip
 */
export function spanTooltip(seconds) {
  const span = Number(seconds) || 0;
  if (span >= SECONDS_PER_DAY) return game.i18n.localize("ep2e.time.dayTooltip");
  if (span >= SECONDS_PER_HOUR) {
    return game.i18n.format("ep2e.time.hoursTooltip", { hours: Math.round(span / SECONDS_PER_HOUR) });
  }
  return game.i18n.format("ep2e.time.minutesTooltip", { minutes: minutesForSeconds(span) });
}

/**
 * The world time a given year and day-of-year begins at, for the panel's editable header.
 * @param {Number} year - The 1-based campaign year
 * @param {Number} dayOfYear - The 1-based day within that year
 * @returns {Number} The world time in seconds
 */
export function worldTimeForDate(year, dayOfYear) {
  const y = Math.max(1, Math.floor(Number(year) || 1));
  const d = Math.max(1, Math.floor(Number(dayOfYear) || 1));
  return ((y - 1) * DAYS_PER_YEAR + (d - 1)) * SECONDS_PER_DAY;
}

/**
 * The label an advance button carries. The advance itself is always the preset's exact seconds -
 * only the wording follows the chosen format.
 * @param {Object} preset - One entry of ADVANCE_PRESETS
 * @param {String} [format] - HOURS or BEATS
 * @returns {String} The localized label
 */
export function advanceLabel(preset, format = HOURS) {
  if (format === BEATS && preset.beatLabel) {
    return game.i18n.format("ep2e.time.advanceSteps.beats", { beats: beatsForSeconds(preset.seconds) });
  }
  return game.i18n.localize(preset.label);
}

/**
 * Whether two world times fall on different campaign days, which is when the per-day rest
 * allowances are due to reset.
 * @param {Number} before - The earlier world time
 * @param {Number} after - The later world time
 * @returns {Boolean} True when a day boundary lies between them
 */
export function crossedDayBoundary(before, after) {
  return elapsedTime(before).totalDays !== elapsedTime(after).totalDays;
}

/**
 * Whether an effect's duration has run out. Checked on the remaining time as well as on the
 * expired flag, because Foundry reports the change to the actor before it writes that flag.
 * @param {ActiveEffect} effect - The effect to judge
 * @returns {Boolean} True when nothing is left to run
 */
export function durationRunOut(effect) {
  if (effect?.duration?.expired === true) return true;
  const remaining = effect?.duration?.remaining;
  return Number.isFinite(remaining) && remaining <= 0;
}
