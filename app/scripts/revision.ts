import { execSync } from 'node:child_process';

/**
 * The exact revision a bundle was built from, stamped into it.
 *
 * AGPL §13: whoever interacts with a hosted xNotary must be offered the source
 * of *that* version — a link to the project is not the same thing, and a
 * running service is precisely the case the clause exists for. So the app shows
 * what it was built from and links that commit. `--dirty` matters: a build made
 * from uncommitted changes corresponds to no public source at all, and should
 * say so rather than point at a commit it does not match.
 *
 * Shared by the xNotary build and the front-page build, which ship together.
 */
export function revision(): { readonly label: string; readonly commit: string } {
  const git = (args: string) => execSync(`git ${args}`, { encoding: 'utf8' }).trim();
  try {
    return { label: git('describe --tags --always --dirty'), commit: git('rev-parse HEAD') };
  } catch {
    // A tarball or a checkout without git. Say nothing rather than guess.
    return { label: 'unknown', commit: '' };
  }
}
