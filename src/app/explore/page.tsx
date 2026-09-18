// src/app/explore/page.tsx
// Bare /explore was the index of the retired Pro token explorer. Its detail
// pages already 308 to /token/*; the index had no page, so old links and
// Google's crawl of /explore returned 404. Send it to the public unlock
// calendar, the closest live equivalent.

import { permanentRedirect } from "next/navigation";

export default function LegacyExploreIndexRedirect() {
  permanentRedirect("/unlocks");
}
