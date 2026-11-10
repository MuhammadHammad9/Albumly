// A repository that forwards to another one, which can be swapped at any time.
// The library store is created once with this switch. Signing in swaps in the account
// repository and signing out swaps the browser one back, without the store or any component
// knowing: the new repository's library simply arrives as an "external change".
export function createRepositorySwitch(initial) {
  let active = initial
  let listener = null
  let unsubscribe = () => {}

  const attach = () => {
    unsubscribe = active.subscribe((library) => listener?.(library)) ?? (() => {})
  }

  return {
    load: () => active.load(),
    save: (library) => active.save(library),

    subscribe(fn) {
      listener = fn
      attach()
      return () => {
        unsubscribe()
        listener = null
      }
    },

    // Switches to `repository` and shows its library straight away
    use(repository) {
      if (repository === active) return
      unsubscribe()
      active = repository
      if (listener) {
        attach()
        listener(repository.load())
      }
    },

    get active() {
      return active
    },
  }
}
