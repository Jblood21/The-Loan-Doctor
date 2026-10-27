import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { applyHoliday, isBorrowerFacingPath } from '@/lib/holidayTheme';
import { useHoliday } from '@/lib/useHoliday';
import type { HolidayId } from '@/lib/holidays';
import { ChristmasBack, ChristmasFront } from './Christmas';
import { EasterBack, EasterFront } from './Easter';
import { HalloweenBack, HalloweenFront } from './Halloween';
import { July4Back, July4Front } from './July4';
import '@/holiday.css';

// Each look has two layers: pieces BEHIND the page (cobwebs, fireworks) that show wherever
// the page is clear, and pieces IN FRONT, hugging the edges.
const ART: Record<HolidayId, { back: () => ReactNode; front: () => ReactNode }> = {
  halloween: { back: () => <HalloweenBack />, front: () => <HalloweenFront /> },
  christmas: { back: () => <ChristmasBack />, front: () => <ChristmasFront /> },
  easter: { back: () => <EasterBack />, front: () => <EasterFront /> },
  july4: { back: () => <July4Back />, front: () => <July4Front /> },
};

// Pages that fill the whole window; every other page sits beside the sidebar.
const FULL_WIDTH = /^\/(login|agent|reset-password|join-team)/;

/**
 * The seasonal look: colors (via data-holiday on <html>) plus a decoration layer around
 * the edges of the screen. The layer never takes clicks, is hidden from screen readers,
 * stays off the pages a borrower or buyer opens from a link, and holds still for people
 * who've asked their device to reduce motion.
 */
export function HolidayDecor() {
  const holiday = useHoliday();
  const { pathname } = useLocation();
  const active = isBorrowerFacingPath(pathname) ? null : holiday;

  useEffect(() => {
    applyHoliday(active);
  }, [active]);

  if (!active) return null;
  const fullWidth = FULL_WIDTH.test(pathname);
  const place = fullWidth ? '' : 'is-shell';
  return (
    <>
      {/* Pages with solid panels (sign-in) would hide a back layer, so it joins the front. */}
      {!fullWidth && (
        <div className={`holiday-layer holiday-back ${place}`} data-art={active} aria-hidden="true">
          {ART[active].back()}
        </div>
      )}
      <div className={`holiday-layer ${place}`} data-art={active} aria-hidden="true">
        {fullWidth && ART[active].back()}
        {ART[active].front()}
      </div>
    </>
  );
}
