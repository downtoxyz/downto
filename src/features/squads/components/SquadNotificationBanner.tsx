"use client";

interface SquadNotificationData {
  squadId: string;
  squadName: string;
  ideaBy: string;
  startedBy: string;
  members: string[];
}

const SquadNotificationBanner = ({
  notification,
  onOpen,
}: {
  notification: SquadNotificationData;
  onOpen: (squadId: string) => void;
}) => (
  <div
    onClick={() => onOpen(notification.squadId)}
    className="fixed top-[60px] left-5 right-5 border-2 border-dt rounded-2xl p-4 z-[250] cursor-pointer"
    style={{
      background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
      animation: "toastIn 0.3s ease",
      boxShadow: "0 8px 32px rgba(232, 255, 90, 0.2)",
    }}
  >
    <div
      className="font-mono text-tiny text-dt uppercase mb-2"
      style={{ letterSpacing: "0.1em" }}
    >
      🎉 Squad Formed!
    </div>
    <div className="font-serif text-lg text-primary mb-3">
      {notification.squadName}
    </div>
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-xs text-dim">
        💡 idea by <span className="text-primary">{notification.ideaBy}</span>
      </div>
      <div className="font-mono text-xs text-dim">
        🚀 started by <span className="text-dt">{notification.startedBy}</span>
      </div>
      {notification.members.length > 0 && (
        <div className="font-mono text-xs text-dim mt-1">
          👥 {notification.members.join(", ")} + you
        </div>
      )}
    </div>
    <div className="font-mono text-tiny text-dt mt-2.5 opacity-70">
      Tap to open chat →
    </div>
  </div>
);

export default SquadNotificationBanner;
