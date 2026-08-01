import UIKit
import UniformTypeIdentifiers

// Receives a shared URL (e.g. a TikTok video link), forwards it to the main
// app via the oneclicktrend:// URL scheme, and dismisses itself.
class ShareViewController: UIViewController {

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
      complete()
    }
  }

  private func forward(_ shared: String) {
    DispatchQueue.main.async {
      let encoded = shared.addingPercentEncoding(
        withAllowedCharacters: .alphanumerics
      ) ?? ""
      if !encoded.isEmpty,
         let url = URL(string: "oneclicktrend://shared?url=\(encoded)") {
        self.openMainApp(url)
      }
      self.complete()
    }
  }

  // UIApplication.shared is unavailable in extensions; walk the responder
  // chain and call openURL: on the application object instead.
  private func openMainApp(_ url: URL) {
    let selector = sel_registerName("openURL:")
    var responder: UIResponder? = self
    while let current = responder {
      if current.responds(to: selector), current is UIApplication {
        current.perform(selector, with: url)
        return
      }
      responder = current.next
    }
  }

  private func complete() {
    DispatchQueue.main.async {
      self.extensionContext?.completeRequest(returningItems: nil)
    }
  }
}
