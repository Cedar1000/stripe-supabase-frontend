import { ageOn, daysUntilBirthday } from './dates';
import type { Person } from './types';

export type UpcomingBirthday = { person: Person; inDays: number; turning: number };

/** Living people with a known day and month, soonest first, within `withinDays`. */
export function upcomingBirthdays(people: Iterable<Person>, withinDays: number): UpcomingBirthday[] {
  const out: UpcomingBirthday[] = [];
  for (const person of people) {
    if (person.is_deceased) continue;
    const inDays = daysUntilBirthday(person.birth_date, person.birth_precision);
    if (inDays === null || inDays > withinDays) continue;
    const future = new Date();
    future.setDate(future.getDate() + inDays);
    out.push({ person, inDays, turning: ageOn(person.birth_date!, future) });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

/** Living people born in the current month whose exact day isn't recorded. */
export function monthOnlyThisMonth(people: Iterable<Person>) {
  const month = new Date().getMonth() + 1;
  return [...people].filter(
    (p) => !p.is_deceased && p.birth_precision === 'month' && Number(p.birth_date!.slice(5, 7)) === month,
  );
}
