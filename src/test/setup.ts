import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
