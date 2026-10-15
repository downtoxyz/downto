// DowntoTests/Support/StubURLProtocol.swift — a URLProtocol that answers from a scripted queue, recording every request.
// Used by DowntoAPITests (401 → refresh → retry) and by any store test that needs `/api/*` stubbed.
import Foundation
import Synchronization

final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated struct Response: Sendable {
        let status: Int
        let body: Data
        let headers: [String: String]

        init(status: Int, body: Data = Data("{\"ok\":true}".utf8), headers: [String: String] = ["Content-Type": "application/json"]) {
            self.status = status
            self.body = body
            self.headers = headers
        }

        static func json(_ status: Int, _ json: String) -> Response { Response(status: status, body: Data(json.utf8)) }
    }

    nonisolated struct Recorded: Sendable {
        let url: URL
        let method: String
        let headers: [String: String]
        let body: Data?

        var authorization: String? { headers["Authorization"] }
        var bodyJSON: [String: Any]? {
            body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        }
    }

    /// Scripted responses, consumed in order; when empty, `fallback` answers.
    nonisolated static let queue = Mutex<[Response]>([])
    nonisolated static let fallback = Mutex<Response>(Response(status: 200))
    nonisolated static let recorded = Mutex<[Recorded]>([])
    /// A URLError code to fail the next request with instead of answering.
    nonisolated static let failNext = Mutex<URLError.Code?>(nil)

    static func reset(fallback: Response = Response(status: 200)) {
        queue.withLock { $0 = [] }
        recorded.withLock { $0 = [] }
        failNext.withLock { $0 = nil }
        Self.fallback.withLock { $0 = fallback }
    }

    static func enqueue(_ responses: Response...) {
        queue.withLock { $0.append(contentsOf: responses) }
    }

    static var requests: [Recorded] { recorded.withLock { $0 } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let request = self.request
        let body = request.httpBody ?? request.httpBodyStream.map { stream -> Data in
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            return data
        }
        Self.recorded.withLock {
            $0.append(Recorded(url: request.url!, method: request.httpMethod ?? "GET", headers: request.allHTTPHeaderFields ?? [:], body: body))
        }
        if let code = Self.failNext.withLock({ let c = $0; $0 = nil; return c }) {
            client?.urlProtocol(self, didFailWithError: URLError(code))
            return
        }
        let response = Self.queue.withLock { $0.isEmpty ? nil : $0.removeFirst() } ?? Self.fallback.withLock { $0 }
        let http = HTTPURLResponse(url: request.url!, statusCode: response.status, httpVersion: "HTTP/1.1", headerFields: response.headers)!
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: response.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
