"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import {
  PanelLeftClose,
  PanelLeft,
  Video,
  Clock,
  Film,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PipelineSummary {
  pipelineId: string;
  videoTitle: string;
  createdAt: number;
  clipCount: number;
  readyClips: number;
}

interface PipelinesResponse {
  pipelines: PipelineSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

const PAGE_SIZE = 15;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const getKey = (
  pageIndex: number,
  previousPageData: PipelinesResponse | null
) => {
  // First page
  if (pageIndex === 0) return `/api/pipelines?limit=${PAGE_SIZE}`;

  // No more pages
  if (previousPageData && !previousPageData.hasMore) return null;

  // Next page with cursor
  if (previousPageData?.nextCursor) {
    return `/api/pipelines?limit=${PAGE_SIZE}&cursor=${previousPageData.nextCursor}`;
  }

  return null;
};

function SidebarItemSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg p-3">
      <Skeleton className="h-4 w-3/4" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function Sidebar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const pathname = usePathname();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Close sidebar on smaller screens
  React.useEffect(() => {
    const handleResize = () => {
      // Close sidebar on tablet and mobile (< 1024px)
      if (window.innerWidth < 1024) {
        setIsOpen(false);
      }
    };

    // Check on mount
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close sidebar when navigating on mobile
  React.useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsOpen(false);
    }
  }, [pathname]);

  const { data, isLoading, isValidating, size, setSize } =
    useSWRInfinite<PipelinesResponse>(getKey, fetcher, {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      revalidateFirstPage: true,
      refreshInterval: 30000,
      dedupingInterval: 5000,
    });

  // Flatten all pages of pipelines
  const pipelines = React.useMemo(() => {
    if (!data) return [];
    return data.flatMap((page) => page.pipelines);
  }, [data]);

  const hasMore = data ? data[data.length - 1]?.hasMore : false;
  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");

  // Handle scroll for infinite loading
  const handleScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const scrollThreshold = 100; // px from bottom to trigger load

    if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
      setSize((prev) => prev + 1);
    }
  }, [isLoadingMore, hasMore, setSize]);

  // Attach scroll listener
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const truncateTitle = (title: string, maxLength: number = 20) => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + "...";
  };

  return (
    <>
      {/* Toggle button when sidebar is closed */}
      {!isOpen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(true)}
          className="fixed left-4 top-4 z-50"
          aria-label="Open sidebar"
        >
          <PanelLeft className="size-5" />
        </Button>
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-full border-r bg-background transition-all duration-300 ease-in-out",
          isOpen ? "w-72" : "w-0 overflow-hidden border-r-0"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <Film className="size-5 text-primary" />
              <span className="font-semibold">Reel0</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsOpen(false)}
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>

          {/* New Video Button */}
          <div className="border-b p-3">
            <Link href="/">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                size="sm"
              >
                <Video className="size-4" />
                New Project
              </Button>
            </Link>
          </div>

          {/* Content */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-3"
          >
            {isLoading && pipelines.length === 0 ? (
              <div className="space-y-1">
                <SidebarItemSkeleton />
                <SidebarItemSkeleton />
                <SidebarItemSkeleton />
              </div>
            ) : pipelines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Video className="mb-2 size-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No processed videos yet
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Upload a video to get started
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {pipelines.map((pipeline) => {
                  const isActive = pathname === `/p/${pipeline.pipelineId}`;
                  return (
                    <Link
                      key={pipeline.pipelineId}
                      href={`/p/${pipeline.pipelineId}`}
                      className={cn(
                        "group flex flex-col gap-1 rounded-lg p-3 transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isActive ? "text-primary" : "text-foreground"
                          )}
                          title={pipeline.videoTitle}
                        >
                          {truncateTitle(pipeline.videoTitle)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatDate(pipeline.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Film className="size-3" />
                          {pipeline.readyClips}/{pipeline.clipCount} clips
                        </span>
                      </div>
                    </Link>
                  );
                })}

                {/* Loading more indicator */}
                {isLoadingMore && (
                  <div className="space-y-1 pt-1">
                    <SidebarItemSkeleton />
                    <SidebarItemSkeleton />
                  </div>
                )}

                {/* Load more trigger / validating indicator */}
                {hasMore && !isLoadingMore && (
                  <div className="flex justify-center py-2">
                    {isValidating ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <button
                        onClick={() => setSize((prev) => prev + 1)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Load more
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Spacer to push content when sidebar is open */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out",
          isOpen ? "w-72" : "w-0"
        )}
      />
    </>
  );
}
