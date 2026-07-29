/**
 * Configurable sidebar items in the user portal.
 *
 * Dashboard is deliberately excluded — it is the sign-in landing page
 * (AuthLayout redirects there) and always visible, so making it hideable
 * could strand a role with an empty sidebar and nowhere obvious to click.
 */
export const MENU_KEYS = [
  'book', 'denah', 'schedule', 'bookings', 'calendar', 'history',
  'approvals', 'hub', 'chat', 'about',
] as const;

export type MenuKey = (typeof MENU_KEYS)[number];

export const MENU_ROLES = ['ADMIN', 'APPROVER', 'EMPLOYEE'] as const;
export type MenuRole = (typeof MENU_ROLES)[number];
