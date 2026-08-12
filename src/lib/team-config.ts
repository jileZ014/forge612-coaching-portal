import config from '../../team-config.json';

export interface BillingConfig {
  /**
   * Surcharge added to the parent's invoice as a visible line item, and taken by
   * the platform as application_fee_amount. The club receives its dues in full.
   * Stripe's own cut (~2.9% + 30c) comes out of this, so net to Forge612 is
   * roughly processingFeePercent - 2.9%.
   */
  processingFeePercent: number;
  /** Line-item name the parent sees for the surcharge. */
  processingFeeLabel: string;
  /** Product name shown at the top of the coach billing dashboard. */
  dashboardTitle: string;
}

export interface TenantFeatures {
  /**
   * The San Diego tournament roster + age/grade verification tools.
   * AZ-Flight-specific (hardcoded team codes and coach names). Off for every
   * other tenant, which 404s those routes rather than exposing another club's
   * coach names on this club's domain.
   */
  sdTournament: boolean;
}

export interface DemoScheduleItem {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  type: 'practice' | 'game' | 'tournament' | 'scrimmage' | 'combine';
}

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
  /** Full-bleed background behind the landing hero. */
  heroImageUrl: string;
  /** Background behind the landing call-to-action band. */
  ctaImageUrl: string;
  tagline: string;
  /** Opponent name used in the landing-page sample schedule. */
  demoOpponent: string;
  /** Venue used in the landing-page sample schedule. */
  demoVenue: string;
  /** Sample schedule shown on the public landing page. Illustrative only. */
  demoSchedule: DemoScheduleItem[];
  features: TenantFeatures;
  billing: BillingConfig;
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
