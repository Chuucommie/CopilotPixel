interface ChangelogSection {
  title: string;
  items: string[];
}

interface ChangelogContributor {
  name: string;
  url: string;
  description: string;
}

interface ChangelogEntry {
  version: string;
  sections: ChangelogSection[];
  contributors: ChangelogContributor[];
}

/** Extract "major.minor" from a semver string (e.g. "1.1.1" -> "1.1"). */
export function toMajorMinor(version: string): string {
  const parts = version.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

export const CHANGELOG_REPO_URL = 'https://github.com/Chuucommie/CopilotAgents';

export const changelogEntries: ChangelogEntry[] = [
  {
    version: '1.4',
    sections: [
      {
        title: 'Copilot integration',
        items: [
          'GitHub Copilot CLI is the active hook provider for session, tool, and permission events',
          'Hook installation is consent-gated and managed from the workspace settings',
          'The standalone server serves the office over a token-protected local connection',
        ],
      },
      {
        title: 'Packaging',
        items: [
          'Updated Marketplace and npm identities for CopilotAgents',
          'Added release metadata and a standalone installation guide',
        ],
      },
    ],
    contributors: [],
  },
];
