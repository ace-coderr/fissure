import { useEffect } from "react";

/** Set the page title for the current view (screen readers announce it on navigation). */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
