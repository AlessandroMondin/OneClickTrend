import UIKit
import UniformTypeIdentifiers

// Receives a shared URL (e.g. a TikTok video link), forwards it to the main
// app via the oneclicktrend:// URL scheme, and dismisses itself.
class ShareViewController: UIViewController {

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    remoteLog("share extension launched")
    handleShare()
  }

  // Local-dev logging to the API (logs/app.log on the Mac).
  private func remoteLog(_ message: String) {
    guard let url = URL(string: "\(Config.apiUrl)/logs") else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let body = ["level": "ext", "message": message]
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: request).resume()
  }

  private func handleShare() {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
      .flatMap { $0.attachments ?? [] } ?? []

    if let provider = providers.first(where: {
      $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
    }) {
      provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) {
        [weak self] item, _ in
        self?.forward((item as? URL)?.absoluteString ?? "")
      }
    } else if let provider = providers.first(where: {
      $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
    }) {
      provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) {
        [weak self] item, _ in
        self?.forward(item as? String ?? "")
      }
    } else {
      remoteLog("no url/text attachment found")
      complete()
    }
  }

  private func forward(_ shared: String) {
    DispatchQueue.main.async {
      self.remoteLog("got shared content: \(shared)")
      let encoded = shared.addingPercentEncoding(
        withAllowedCharacters: .alphanumerics
      ) ?? ""
      if !encoded.isEmpty,
         let url = URL(string: "oneclicktrend://shared?url=\(encoded)") {
        self.openMainApp(url)
      }
      // Give openURL: and the log request a moment before the extension dies.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        self.complete()
      }
    }
  }

  private func openMainApp(_ url: URL) {
    extensionContext?.open(url) { success in
      self.remoteLog("extensionContext.open success=\(success)")
      if !success {
        self.openViaResponderChain(url)
      }
    }
  }

  // UIApplication.shared is unavailable in extensions; walk the responder
  // chain and call openURL: on the application object instead.
  private func openViaResponderChain(_ url: URL) {
    let selector = sel_registerName("openURL:")
    var responder: UIResponder? = self
    while let current = responder {
      if current.responds(to: selector), current is UIApplication {
        current.perform(selector, with: url)
        remoteLog("attempted open via responder chain")
        return
      }
      responder = current.next
    }
    remoteLog("openURL failed: no UIApplication in responder chain")
  }

  private func complete() {
    DispatchQueue.main.async {
      self.extensionContext?.completeRequest(returningItems: nil)
    }
  }
}
