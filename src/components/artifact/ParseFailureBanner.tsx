/**
 * The parse-failure banner (DESIGN.md "Revision History & Restore"):
 * shown by the pane when the latest SAVED revision fails the applicable
 * extension's validates hook — never for a broken draft. Offers a
 * one-click restore of the newest revision that parses.
 */
import type { ReactElement } from 'react';

import type { Unit } from '@design/repository-api';

interface ParseFailureBannerProps {
  unit: Unit;
  validates: (content: string) => Promise<boolean>;
}

export function ParseFailureBanner(
  _props: ParseFailureBannerProps,
): ReactElement {
  throw new Error('not implemented: ParseFailureBanner');
}
