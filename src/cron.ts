type CronDate = { toJSDate: () => Date };

type CronField = {
  wildcard: boolean;
  values: Set<number>;
};

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function replaceNames(value: string, names: string[], offset: number): string {
  let result = value.toUpperCase();
  names.forEach((name, index) => {
    result = result.replaceAll(name, String(index + offset));
  });
  return result;
}

function parseField(
  source: string,
  minimum: number,
  maximum: number,
  names?: string[],
): CronField {
  const normalized = names ? replaceNames(source, names, minimum) : source;
  const wildcard = normalized === "*" || normalized === "?";
  const values = new Set<number>();

  for (const part of normalized.split(",")) {
    const [rangeSource = "*", stepSource] = part.split("/");
    const step = stepSource === undefined ? 1 : Number(stepSource);
    if (!Number.isInteger(step) || step <= 0)
      throw new Error(`Invalid cron field: ${source}`);

    let start = minimum;
    let end = maximum;
    if (rangeSource !== "*" && rangeSource !== "?") {
      const [startSource, endSource] = rangeSource.split("-");
      start = Number(startSource);
      end = endSource === undefined ? start : Number(endSource);
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < minimum ||
      end > maximum ||
      start > end
    ) {
      throw new Error(`Invalid cron field: ${source}`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return { wildcard, values };
}

export class CronJob {
  readonly #onTick: () => void | Promise<void>;
  readonly #fields: CronField[];
  readonly #stepMilliseconds: number;
  #timer: ReturnType<typeof setInterval> | undefined;
  #lastTick = "";

  constructor(expression: string, onTick: () => void | Promise<void>) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length === 5) parts.unshift("0");
    if (parts.length !== 6)
      throw new Error(`Invalid cron expression: ${expression}`);

    this.#fields = [
      parseField(parts[0]!, 0, 59),
      parseField(parts[1]!, 0, 59),
      parseField(parts[2]!, 0, 23),
      parseField(parts[3]!, 1, 31),
      parseField(parts[4]!, 1, 12, MONTH_NAMES),
      parseField(parts[5]!, 0, 7, DAY_NAMES),
    ];
    if (this.#fields[5]!.values.has(7)) {
      this.#fields[5]!.values.delete(7);
      this.#fields[5]!.values.add(0);
    }
    this.#stepMilliseconds =
      expression.trim().split(/\s+/).length === 5 ? 60_000 : 1_000;
    this.#onTick = onTick;
  }

  #matches(date: Date): boolean {
    const [second, minute, hour, dayOfMonth, month, dayOfWeek] = this.#fields;
    if (
      !second!.values.has(date.getSeconds()) ||
      !minute!.values.has(date.getMinutes()) ||
      !hour!.values.has(date.getHours()) ||
      !month!.values.has(date.getMonth() + 1)
    ) {
      return false;
    }

    const matchesMonthDay = dayOfMonth!.values.has(date.getDate());
    const matchesWeekDay = dayOfWeek!.values.has(date.getDay());
    if (!dayOfMonth!.wildcard && !dayOfWeek!.wildcard) {
      return matchesMonthDay || matchesWeekDay;
    }
    return matchesMonthDay && matchesWeekDay;
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      const now = new Date();
      const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
      if (key !== this.#lastTick && this.#matches(now)) {
        this.#lastTick = key;
        try {
          void Promise.resolve(this.#onTick()).catch((error: unknown) => {
            console.error("Scheduled sync failed:", error);
          });
        } catch (error) {
          console.error("Scheduled sync failed:", error);
        }
      }
    }, 1_000);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  nextDates(count: number): CronDate[] {
    const dates: CronDate[] = [];
    const cursor = new Date(Date.now() + this.#stepMilliseconds);
    cursor.setMilliseconds(0);
    if (this.#stepMilliseconds === 60_000) cursor.setSeconds(0);
    const limit = Date.now() + 366 * 24 * 60 * 60 * 1000 * 5;

    while (dates.length < count && cursor.getTime() <= limit) {
      if (this.#matches(cursor)) {
        const match = new Date(cursor.getTime());
        dates.push({ toJSDate: () => match });
      }
      cursor.setTime(cursor.getTime() + this.#stepMilliseconds);
    }
    return dates;
  }
}
