// Data/ImageResizer.swift — nonisolated resize for chat uploads (port of src/lib/imageResize.ts: longest edge 1600, JPEG 0.85).
// ImageIO only (no UIKit), so it runs from `Task.detached` off the main actor; EXIF orientation is baked in.
import Foundation
import ImageIO
import UniformTypeIdentifiers

nonisolated enum ImageResizer {
    nonisolated struct Resized: Hashable, Sendable {
        let data: Data
        let width: Int
        let height: Int
    }

    nonisolated enum ResizeError: Error, Equatable {
        case undecodable
        case encodeFailed
    }

    static let defaultMaxEdge = 1600
    static let defaultQuality = 0.85

    /// Downscales so the longest edge is ≤ `maxEdge` (never upscales) and re-encodes as JPEG.
    static func resizeForChat(_ data: Data, maxEdge: Int = defaultMaxEdge, quality: Double = defaultQuality) throws -> Resized {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0 else {
            throw ResizeError.undecodable
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,   // apply EXIF orientation
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxEdge,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw ResizeError.undecodable
        }
        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw ResizeError.encodeFailed
        }
        let props: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
        CGImageDestinationAddImage(dest, image, props as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw ResizeError.encodeFailed }
        return Resized(data: out as Data, width: image.width, height: image.height)
    }
}
