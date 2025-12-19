/**
 * A utility method to get a status excerpt/
 * @param status
 */
export const getPostExcerpt = (status: string) =>
  `« ${status.replaceAll("\n", "").slice(0, 25)}... »`;
