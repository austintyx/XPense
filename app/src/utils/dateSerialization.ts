// Local calendar fields, not toISOString() -- toISOString() converts to UTC first and can shift
// the date back a day for anyone whose device timezone is behind UTC, before the value even
// reaches the backend's (correct) Singapore-midnight handling.
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Parse a "YYYY-MM-DD" string (e.g. from an HTML <input type="date">) as a local calendar date,
// not UTC midnight -- `new Date("YYYY-MM-DD")` alone parses as UTC midnight, which can display as
// the previous day for anyone whose device timezone is behind UTC. Appending a local time-of-day
// forces the Date constructor's local-time parsing path instead.
export function fromDateString(value: string): Date {
  return new Date(`${value}T00:00:00`);
}
