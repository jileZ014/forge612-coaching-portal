import config from '../../team-config.json';

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
  sportConfig: SportConfig;
}

export const teamConfig: TeamConfig = config as TeamConfig;
