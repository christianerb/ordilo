import UIKit
import UniformTypeIdentifiers

// Store each delivery atomically in the app group first — a share extension
// runs in its own process with no session token or network dependency, so
// the save itself never depends on reaching the host app. Opening Ordilo
// afterwards is a separate, user-initiated step (see openInHostApp below).
class ShareIntoViewController: UIViewController {
  private let label = UILabel()
  private let button = UIButton(type: .system)
  private var started = false
  private var succeeded = false

  private var hostAppScheme: String? {
    Bundle.main.object(forInfoDictionaryKey: "MainTargetUrlScheme") as? String
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.99, green: 0.98, blue: 0.96, alpha: 1)
    label.text = "Deine Post kommt zu Ordilo …"
    label.numberOfLines = 0
    label.textAlignment = .center
    label.font = .preferredFont(forTextStyle: .title2)
    label.adjustsFontForContentSizeCategory = true
    button.setTitle("Fertig", for: .normal)
    button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    button.addTarget(self, action: #selector(finish), for: .touchUpInside)
    button.isHidden = true
    let stack = UIStackView(arrangedSubviews: [label, button])
    stack.axis = .vertical
    stack.spacing = 28
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 28),
      stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -28),
      stack.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
      button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !started else { return }
    started = true
    Task { await receive() }
  }

  // One tap: on success it jumps straight into Ordilo's inbox, otherwise it
  // just dismisses — there is nothing to open yet after a failed share.
  @objc private func finish() {
    if succeeded, let scheme = hostAppScheme, let url = URL(string: "\(scheme)://expo-sharing") {
      openInHostApp(url)
    }
    extensionContext?.completeRequest(returningItems: nil)
  }

  // A share extension runs in its own process, so UIApplication.shared is
  // unavailable here. Walking the responder chain to the host app is the
  // same workaround expo-sharing's own default extension uses to jump
  // back — deliberate here, not a fallback, and only fired from this
  // button's tap so it always runs with a user gesture behind it.
  private func openInHostApp(_ url: URL) {
    var responder: UIResponder? = self
    while responder != nil {
      if let application = responder as? UIApplication {
        application.open(url, options: [:], completionHandler: nil)
        return
      }
      responder = responder?.next
    }
  }

  private func receive() async {
    var delivery: URL?
    do {
      guard let group = Bundle.main.object(forInfoDictionaryKey: "AppGroupId") as? String,
            let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group),
            let items = extensionContext?.inputItems as? [NSExtensionItem] else { throw IntakeError.unavailable }
      let providers = items.flatMap { $0.attachments ?? [] }
      guard !providers.isEmpty, providers.count <= 10 else { throw IntakeError.unsupported }
      let directory = container.appendingPathComponent("ordilo-inbox", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
      delivery = directory
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
      var payloads: [[String: Any]] = []
      for provider in providers {
        let type: UTType = provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) ? .pdf : .image
        guard provider.hasItemConformingToTypeIdentifier(type.identifier) else { throw IntakeError.unsupported }
        let payload = try await copy(provider, type: type, into: directory)
        payloads.append(payload)
      }
      // A manifest is the commit marker. The app ignores unfinished directories.
      let data = try JSONSerialization.data(withJSONObject: payloads)
      try data.write(to: directory.appendingPathComponent("ready.json"), options: .atomic)
      succeeded = true
      label.text = "Sicher auf deinem iPhone gespeichert."
      button.setTitle("Ordilo öffnen", for: .normal)
      UIAccessibility.post(notification: .announcement, argument: "Für Ordilo gespeichert")
    } catch {
      if let delivery { try? FileManager.default.removeItem(at: delivery) }
      label.text = "Das Speichern hat nicht geklappt. Bitte teile eine PDF-Datei oder ein Foto erneut mit Ordilo."
    }
    button.isHidden = false
  }

  private func copy(_ provider: NSItemProvider, type: UTType, into directory: URL) async throws -> [String: Any] {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
        do {
          guard let url else { throw error ?? IntakeError.unavailable }
          let size = (try url.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
          guard size > 0, size <= 20 * 1024 * 1024 else { throw IntakeError.unsupported }
          let name = url.lastPathComponent
          let destination = directory.appendingPathComponent(UUID().uuidString + "." + url.pathExtension)
          // NSItemProvider's temporary URL is only valid inside this callback.
          try FileManager.default.copyItem(at: url, to: destination)
          let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? (type == .pdf ? "application/pdf" : "image/jpeg")
          let kind = type == .pdf ? "file" : "image"
          continuation.resume(returning: ["value": destination.absoluteString, "shareType": kind, "mimeType": mime, "contentUri": destination.absoluteString, "contentType": kind, "contentMimeType": mime, "originalName": name, "contentSize": size])
        } catch { continuation.resume(throwing: error) }
      }
    }
  }
  private enum IntakeError: Error { case unavailable, unsupported }
}
