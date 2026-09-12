/**
 * Which booking state the site is in, and the session types it can offer.
 *
 * Shared by the page and the booking block so both describe the same thing.
 * The page needs it because a call to action has to be labelled for where it
 * actually leads: "Pick a time" pointing at a section with no calendar in it is
 * a broken promise, not a shortcut.
 */

export type BookingCopy = { cta: string; lead: string; note: string };

export type BookingConfig = {
  calUser: string | null;
  calEvent: string | null;
  origin: string;
  calendar: BookingCopy;
  email: BookingCopy;
};

export type FormatLike = { title: string; calEvent: string | null };

/** A bookable session: a label, a Cal.com link, and its public URL. */
export type SessionType = { title: string; calLink: string; url: string };

export function sessionTypes(booking: BookingConfig, formats: FormatLike[]): SessionType[] {
  if (!booking.calUser) return [];
  const origin = booking.origin.replace(/\/$/, '');
  return formats
    .map((format) => ({ title: format.title, event: format.calEvent ?? booking.calEvent }))
    .filter((type): type is { title: string; event: string } => Boolean(type.event))
    .map((type) => ({
      title: type.title,
      calLink: `${booking.calUser}/${type.event}`,
      url: `${origin}/${booking.calUser}/${type.event}`,
    }));
}

/** True once there is a calendar to put on the page. */
export function hasCalendar(booking: BookingConfig, formats: FormatLike[]): boolean {
  return sessionTypes(booking, formats).length > 0;
}

/** The words for whichever state the site is in. */
export function bookingCopy(booking: BookingConfig, formats: FormatLike[]): BookingCopy {
  return hasCalendar(booking, formats) ? booking.calendar : booking.email;
}
