// Data/Models/Message.swift — `messages` (ARCHITECTURE §3.4). `sender_id` is null for system rows; `text` is null for image rows.
import Foundation

nonisolated struct Message: Codable, Identifiable, Hashable, Sendable {
    let id: MessageID
    let squadId: SquadID
    let senderId: UserID?
    let text: String?
    let isSystem: Bool
    let messageType: MessageType
    let mentions: [UserID]
    /// Storage path in `squad-chat-images` (`{squad_id}/{uuid}.{ext}`); signed URL resolved lazily by ImageCache.
    let imagePath: String?
    let imageWidth: Int?
    let imageHeight: Int?
    let createdAt: Date

    init(id: MessageID, squadId: SquadID, senderId: UserID?, text: String?, isSystem: Bool, messageType: MessageType,
         mentions: [UserID], imagePath: String?, imageWidth: Int?, imageHeight: Int?, createdAt: Date) {
        self.id = id
        self.squadId = squadId
        self.senderId = senderId
        self.text = text
        self.isSystem = isSystem
        self.messageType = messageType
        self.mentions = mentions
        self.imagePath = imagePath
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
        self.createdAt = createdAt
    }
}
