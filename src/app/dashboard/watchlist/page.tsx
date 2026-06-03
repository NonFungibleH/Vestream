import { redirect } from "next/navigation";

// The standalone Token Watchlist was merged into the Vesting Index as a
// "Save" action (June 2026): saved tokens now surface on /dashboard/explorer
// and on each token drill-down via the Save button. The /api/watchlist
// endpoint + table are unchanged. This redirect keeps old bookmarks/links
// (and the web→mobile handoff) working.
export default function WatchlistRedirect() {
  redirect("/dashboard/explorer");
}
