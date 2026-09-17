/**
 * Split whoever showed up into N even groups for a stations block.
 *
 * Deliberately dumb: a round-robin deal, not grouping by who needs work on
 * what. The skills-based version needs game observations to work from, and on
 * the first practice of the season there aren't any. Revisit once the loop has
 * something to feed it.
 *
 * Lives here rather than in actions.js because everything exported from a
 * 'use server' module has to be an async server action, and this is a pure
 * function.
 */
export function splitGroups(playerIds, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  playerIds.forEach((id, i) => groups[i % groupCount].push(id));
  return groups;
}
