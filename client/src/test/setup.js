// Adds matchers such as toBeInTheDocument() and toHaveAttribute() to expect()
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount whatever a test rendered, so tests cannot leak into each other
afterEach(cleanup)
