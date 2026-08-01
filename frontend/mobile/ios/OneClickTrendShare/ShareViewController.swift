import UIKit
import UniformTypeIdentifiers

// Receives a shared URL (e.g. a TikTok video link), sends it to the backend
// (iOS does not allow share extensions to open their containing app), shows a
// brief confirmation and dismisses. The app picks pending links up from the
// API when it next becomes active.
class ShareViewController: UIViewController {

  private let label = UILabel()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.95)
    label.text = "Sending to OneClickTrend…"
    label.font = .systemFont(ofSize: 17, weight: .semibold)
    label.textAlignment = .center
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 16),
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    handleShare()
  }

  private func handleShare() {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
      .flatMap { $0.attachments ?? [] } ?? []

    if let provider = providers.first(where: {
      $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
    }) {
      provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) {
        [weak self] item, _ in
        self?.send((item as? URL)?.absoluteString ?? "")
      }
    } else if let provider = providers.first(where: {
      $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
    }) {
      provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) {
        [weak self] item, _ in
        self?.send(item as? String ?? "")
      }
    } else {
      finish("Nothing to share")
    }
  }

  private func send(_ shared: String) {
    guard !shared.isEmpty, let url = URL(string: "\(Config.apiUrl)/shared-links") else {
      return finish("Nothing to share")
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["url": shared])
    request.timeoutInterval = 5

    URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
      let ok = error == nil && (response as? HTTPURLResponse)?.statusCode == 201
      self?.finish(ok ? "Sent to OneClickTrend ✓" : "Failed — is the backend running?")
    }.resume()
  }

  private func finish(_ message: String) {
    DispatchQueue.main.async {
      self.label.text = message
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
        self.extensionContext?.completeRequest(returningItems: nil)
      }
    }
  }
}
