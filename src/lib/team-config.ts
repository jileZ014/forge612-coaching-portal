import config from '../../team-config.json';

export interface RegistrationBullet {
  /** Bold lead-in, e.g. "Monthly dues:" */
  label: string;
  text: string;
  /** Renders on an accent-tinted background for fee changes / deadlines. */
  highlight?: boolean;
}

export interface RegistrationLink {
  label: string;
  url: string;
}

export interface RegistrationConfig {
  /** Age-group options on the public form. */
  ageGroups: { code: string; label: string }[];
  /** Paragraph above the bullet list. */
  intro: string;
  bullets: RegistrationBullet[];
  /** Forms parents must complete. Empty array hides the section. */
  links: RegistrationLink[];
  /** Shown on the success screen after submitting. */
  successNote: string;
}

export interface SportConfig {
  playerLabel: string;
  playersLabel: string;
  coachLabel: string;
  practiceLabel: string;
  gameLabel: string;
  seasonLabel: string;
  positionOptions: string[];
  eventTypes: string[];
}

export interface TeamConfig {
  teamId: string;
  teamName: string;
  sport: string;
  primaryColor: string;
  accentColor: string;
  accentColorLight: string;
  coachEmail: string;
  coachName: string;
  domain: string;
  firebaseProject: string;
  stripeAccountId: string;
  logoUrl: string;
  tagline: string;
  /** Emoji used in coach notifications. 🏀 / 🏈 / 🏐 */
  sportEmoji: string;
  /** Club name as it appears to PARENTS in SMS and on invoices, e.g. "AZ Flight Basketball". */
  billingLabel: string;
  /** Domain for synthetic invoice+<id>@ addresses when a family has no email on file. */
  invoiceEmailDomain: string;
  /** Season shown on the public registration form, e.g. "2026-2027". */
  season: string;
  /** One-line description of dues on the public registration form. */
  duesBlurb: string;
  registration: RegistrationConfig;
  sportConfig: SportConfig;
}

export const teamConfig: TeamConfig = config as TeamConfig;
