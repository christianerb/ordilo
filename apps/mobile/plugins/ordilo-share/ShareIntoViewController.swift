import UIKit
import UniformTypeIdentifiers

// A share extension cannot reliably launch its containing app. Store each
// delivery atomically in the app group and finish through the supported API.
// No session tokens or network dependency are needed to accept a document.
class ShareIntoViewController: UIViewController {
  private let label = UILabel()
  private let button = UIButton(type: .system)
  private var started = false

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

  @objc private func finish() { extensionContext?.completeRequest(returningItems: nil) }

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
      label.text = "Sicher auf deinem iPhone gespeichert.\n\nÖffne jetzt Ordilo, um deine Post einzuordnen."
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
