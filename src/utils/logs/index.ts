import { Ora } from "ora";

export function logError(
  log: Ora,
  error: unknown,
  type: "fail" | "warn" = "fail",
) {
  const errorStr = error instanceof Error ? error.message : String(error);

  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const msg = strings.reduce((out, str, i) => {
      let val = "";
      if (i < values.length) {
        // if the interpolated value is the *same object* as error
        if (values[i] === error) {
          val = errorStr;
        } else {
          val = String(values[i]);
        }
      }
      return out + str + val;
    }, "");

    switch (type) {
      case "fail":
        log.fail(msg);
        console.warn(error)
        break;
      case "warn":
        log.warn(msg);
        break;
    }
  };
}

export const oraPrefix = (prefix: string): string => prefix.padEnd(15, " ");

const SEGMENT_DONE = "█";
const SEGMENT_UNDONE = "░";
export const oraProgress = (
  ora: Ora,
  text: {
    before?: string;
    after?: string;
  },
  index: number,
  maximum: number,
) => {
  const textBefore = text.before ?? " ";
  const textAfter = text.after ?? " ";
  const progress = Math.round((index / maximum) * 100);
  const segments = Math.round(progress / 5);
  const bar = `${SEGMENT_DONE.repeat(segments)}${SEGMENT_UNDONE.repeat(
    20 - segments,
  )}`;
  ora.text = `${textBefore + " "}${bar} ${progress}% ${textAfter}`;
};
