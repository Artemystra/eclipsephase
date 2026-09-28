import {
  elapsedTime,
  formatTimeOfDay,
  worldTimeForDay,
  worldTimeForDate,
  advanceSeconds,
  minutesForSeconds,
  spanTooltip,
  beatsForSeconds,
  advanceLabel,
  crossedDayBoundary,
  ADVANCE_PRESETS,
  HOURS,
  BEATS
} from "../../module/common/time.js";

const DAY = 86400;
const HOUR = 3600;

describe("elapsedTime", () => {
  test("world time zero is the first day, at midnight", () => {
    expect(elapsedTime(0)).toMatchObject({ totalDays: 0, day: 1, year: 1, dayOfYear: 1, hour: 0, minute: 0 });
  });

  test("it reports the time of day within the current day", () => {
    expect(elapsedTime(3 * DAY + 14 * HOUR + 30 * 60)).toMatchObject({ day: 4, hour: 14, minute: 30 });
  });

  test("a year rolls over after 365 days, without months or leap years", () => {
    expect(elapsedTime(364 * DAY)).toMatchObject({ year: 1, dayOfYear: 365, day: 365 });
    expect(elapsedTime(365 * DAY)).toMatchObject({ year: 2, dayOfYear: 1, day: 366 });
    expect(elapsedTime(730 * DAY)).toMatchObject({ year: 3, dayOfYear: 1 });
  });

  test("a day is 1000 beats", () => {
    expect(elapsedTime(0).beat).toEqual(0);
    expect(elapsedTime(DAY / 2).beat).toEqual(500);
    expect(elapsedTime(DAY - 1).beat).toEqual(999);
  });

  test("negative or unusable world times are read as zero rather than throwing", () => {
    for (const value of [-500, null, undefined, NaN, "nonsense"]) {
      expect(elapsedTime(value)).toMatchObject({ day: 1, hour: 0 });
    }
  });
});

describe("formatTimeOfDay", () => {
  test("hours are zero-padded to a 24-hour clock", () => {
    expect(formatTimeOfDay(9 * HOUR + 5 * 60)).toEqual("09:05");
    expect(formatTimeOfDay(23 * HOUR + 59 * 60)).toEqual("23:59");
  });

  test("beats are zero-padded to three digits behind an @", () => {
    expect(formatTimeOfDay(0, BEATS)).toEqual("@000");
    expect(formatTimeOfDay(DAY / 2, BEATS)).toEqual("@500");
    expect(formatTimeOfDay(DAY - 1, BEATS)).toEqual("@999");
  });

  test("the day a time falls on does not change how the time of day reads", () => {
    expect(formatTimeOfDay(12 * HOUR)).toEqual(formatTimeOfDay(40 * DAY + 12 * HOUR));
  });
});

describe("worldTimeForDay", () => {
  test("day one is world time zero", () => {
    expect(worldTimeForDay(1)).toEqual(0);
  });

  test("it round-trips through elapsedTime", () => {
    for (const day of [1, 2, 143, 365, 366, 1000]) {
      expect(elapsedTime(worldTimeForDay(day)).day).toEqual(day);
    }
  });

  test("a day below one is clamped to the start rather than going negative", () => {
    expect(worldTimeForDay(0)).toEqual(0);
    expect(worldTimeForDay(-5)).toEqual(0);
  });
});

describe("beatsForSeconds", () => {
  test.each([
    [10 * 60, "7"],
    [1 * HOUR, "42"],
    [4 * HOUR, "167"],
    [8 * HOUR, "333"],
    [DAY, "1K"]
  ])("%i seconds reads as %s beats", (seconds, expected) => {
    expect(beatsForSeconds(seconds)).toEqual(expected);
  });
});

describe("the advance presets", () => {
  test("they run from ten minutes to a week", () => {
    expect(ADVANCE_PRESETS.map(preset => preset.seconds)).toEqual([
      600, HOUR, 4 * HOUR, 8 * HOUR, DAY, 3 * DAY, 7 * DAY
    ]);
  });

  test("everything up to a day carries a beat label, the longer steps do not", () => {
    const beatLabelled = ADVANCE_PRESETS.filter(preset => preset.beatLabel).map(preset => preset.id);
    expect(beatLabelled).toEqual(["min10", "hour1", "hour4", "hour8", "day1"]);
  });

  test("beats mode relabels those buttons but never changes what they advance", () => {
    const dayPreset = ADVANCE_PRESETS.find(preset => preset.id === "day1");
    expect(advanceLabel(dayPreset, BEATS)).toContain("1K");
    expect(advanceLabel(dayPreset, HOURS)).toEqual("ep2e.time.advanceSteps.day1");
    expect(dayPreset.seconds).toEqual(DAY);
  });

  test("the multi-day steps keep their day labels even in beats mode", () => {
    const weekPreset = ADVANCE_PRESETS.find(preset => preset.id === "day7");
    expect(advanceLabel(weekPreset, BEATS)).toEqual("ep2e.time.advanceSteps.day7");
  });
});

describe("crossedDayBoundary", () => {
  test("it is false within one day and true across midnight", () => {
    expect(crossedDayBoundary(0, 12 * HOUR)).toBe(false);
    expect(crossedDayBoundary(23 * HOUR, 25 * HOUR)).toBe(true);
  });

  test("a week later is a boundary crossing, whatever the time of day", () => {
    expect(crossedDayBoundary(5 * HOUR, 7 * DAY + 5 * HOUR)).toBe(true);
  });
});

describe("advanceSeconds", () => {
  test("in hours mode a step advances exactly what it says", () => {
    for (const preset of ADVANCE_PRESETS) {
      expect(advanceSeconds(preset, HOURS)).toEqual(preset.seconds);
    }
  });

  test("in beats mode every step advances whole beats, so the button and the clock agree", () => {
    const beat = second => Math.floor((second % DAY) * 1000 / DAY);
    for (const preset of ADVANCE_PRESETS.filter(p => p.beatLabel && p.seconds < DAY)) {
      const step = advanceSeconds(preset, BEATS);
      const expected = Math.round((preset.seconds * 1000) / DAY);
      expect(beat(step)).toEqual(expected);
      expect(beat(step * 2)).toEqual(expected * 2);
      expect(beat(step * 3)).toEqual(expected * 3);
    }
  });

  test("the multi-day steps are untouched by beats mode", () => {
    const week = ADVANCE_PRESETS.find(preset => preset.id === "day7");
    expect(advanceSeconds(week, BEATS)).toEqual(week.seconds);
  });
});

describe("minutesForSeconds", () => {
  test("it rounds to whole minutes for the beats tooltip", () => {
    expect(minutesForSeconds(605)).toEqual(10);
    expect(minutesForSeconds(3629)).toEqual(60);
    expect(minutesForSeconds(0)).toEqual(0);
  });
});

describe("worldTimeForDate", () => {
  test("year one day one is world time zero", () => {
    expect(worldTimeForDate(1, 1)).toEqual(0);
  });

  test("it round-trips through elapsedTime", () => {
    for (const [year, dayOfYear] of [[1, 1], [1, 365], [2, 1], [3, 200]]) {
      expect(elapsedTime(worldTimeForDate(year, dayOfYear))).toMatchObject({ year, dayOfYear });
    }
  });

  test("values below one are clamped rather than going negative", () => {
    expect(worldTimeForDate(0, 0)).toEqual(0);
    expect(worldTimeForDate(-3, -9)).toEqual(0);
  });
});

describe("spanTooltip", () => {
  test("a step under an hour reads in minutes", () => {
    expect(spanTooltip(605)).toContain("10");
    expect(spanTooltip(605)).toContain("minutesTooltip");
  });

  test("a step of an hour or more reads in hours, including the one-hour step", () => {
    expect(spanTooltip(3629)).toContain("hoursTooltip");
    expect(spanTooltip(3629)).toContain("1");
    expect(spanTooltip(14429)).toContain("\"hours\":4");
    expect(spanTooltip(28772)).toContain("\"hours\":8");
  });

  test("a full day reads as a day rather than as hours", () => {
    expect(spanTooltip(DAY)).toEqual("ep2e.time.dayTooltip");
  });
});
