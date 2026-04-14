"use client";

interface FeedEmptyStateProps {
  onOpenAdd: () => void;
  onOpenFriends: (tab?: "friends" | "add") => void;
}

export default function FeedEmptyState({
  onOpenAdd,
  onOpenFriends,
}: FeedEmptyStateProps) {
  return (
    <div className="bg-card border border-dashed border-border-mid rounded-2xl py-10 px-6 text-center">
      <p className="font-serif text-2xl text-primary mb-2">
        Your feed is empty
      </p>
      <p className="font-mono text-xs text-muted mb-6 leading-relaxed">
        Save events or add friends
      </p>

      <div className="flex gap-2 justify-center flex-wrap">
        <button
          onClick={() => onOpenAdd()}
          className="bg-dt text-white border-none rounded-2xl py-2.5 px-4 font-mono text-xs font-bold cursor-pointer"
        >
          + Add Event
        </button>
        <button
          onClick={() => onOpenFriends()}
          className="bg-transparent text-primary border border-border-mid rounded-2xl py-2.5 px-4 font-mono text-xs cursor-pointer"
        >
          Find Friends
        </button>
      </div>
    </div>
  );
}
