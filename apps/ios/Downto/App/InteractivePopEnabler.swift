// App/InteractivePopEnabler.swift — re-enables UINavigationController's interactive pop under a hidden nav bar (ARCHITECTURE §7.5).
// Mount as `.background(InteractivePopEnabler().frame(width: 0, height: 0))` on any pushed view that hides its bar.
import SwiftUI
import UIKit

struct InteractivePopEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ c: Controller, context: Context) {}

    final class Controller: UIViewController, UIGestureRecognizerDelegate {
        override func didMove(toParent parent: UIViewController?) {
            super.didMove(toParent: parent)
            attach()
        }
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            attach()
        }
        private func attach() {
            guard let nav = nearestNavigationController(), let pop = nav.interactivePopGestureRecognizer else { return }
            pop.delegate = self
            pop.isEnabled = true
        }
        private func nearestNavigationController() -> UINavigationController? {
            var p: UIViewController? = self
            while let c = p {
                if let n = c.navigationController { return n }
                p = c.parent
            }
            return nil
        }
        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            (nearestNavigationController()?.viewControllers.count ?? 0) > 1
        }
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { false }
    }
}
