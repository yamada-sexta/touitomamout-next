const ERROR_NEW_LINE = "\n               └─ ";
export const TouitomamoutError = (error: string, details: string[]) => {
  const formattedDetails = details.reduce(
    (formatted, detail) =>
      detail ? formatted + `${ERROR_NEW_LINE}${detail}` : formatted,
    "",
  );
  const lastLine = `${ERROR_NEW_LINE}🦣.`;
  return `\n\u001B[36;1m[touitomamout]\u001B[0m ${error}${formattedDetails}${lastLine}`;
};
